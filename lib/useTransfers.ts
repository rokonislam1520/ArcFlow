'use client';
/**
 * Token transfer history, read from ERC-20 `Transfer` logs.
 *
 * This reads the token contracts themselves rather than ArcFlow's own `Sent`
 * events. That distinction matters: the Send page settles through App Kit,
 * which performs a plain ERC-20 transfer and never touches `ArcFlowSend`. A
 * history built only from ArcFlow's events would therefore be empty for most
 * real usage while looking perfectly healthy — the user would send money and
 * see nothing recorded.
 *
 * Two filtered queries per token (outgoing, incoming) so the node does the
 * matching instead of us scanning every transfer on the chain.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { erc20Abi, formatUnits, parseAbiItem, type Address } from 'viem';
import type { ArcChain } from './chains';
import { getPublicClient } from './clients';
import { useRefreshSignal } from './refresh';

/**
 * Declared explicitly rather than picked out of `erc20Abi`, so viem can infer
 * the decoded `args` and this file stays free of `any` casts around money.
 */
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

interface TokenRef {
  symbol: string;
  address: Address;
}

export interface Transfer {
  direction: 'sent' | 'received';
  /** The other party: recipient for sent, sender for received. */
  counterparty: Address;
  symbol: string;
  raw: bigint;
  decimals: number;
  amount: string;
  blockNumber: bigint;
  txHash: `0x${string}`;
  /** Unix seconds, when the block header could be read. */
  timestamp: number | null;
}

/**
 * How far back to scan.
 *
 * Public RPCs commonly cap `eth_getLogs` ranges, so this stays conservative;
 * a narrower window that succeeds beats a wider one that errors.
 */
const LOOKBACK_BLOCKS = 9_000n;

/** Block timestamps are a second round trip, so only resolve what is shown. */
const TIMESTAMPED_LIMIT = 12;

export function useTransfers(chain: ArcChain | null, owner: Address | null, limit = 10) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const refreshSignal = useRefreshSignal();

  const load = useCallback(async () => {
    if (!chain || !owner) {
      setTransfers([]);
      return;
    }
    const client = getPublicClient(chain);
    if (!client) {
      setError(`No RPC endpoint for ${chain.label}`);
      return;
    }

    const tokens: TokenRef[] = [];
    for (const symbol of ['USDC', 'EURC', 'USDT'] as const) {
      const address = chain.tokens[symbol];
      if (address) tokens.push({ symbol, address: address as Address });
    }

    if (tokens.length === 0) {
      setTransfers([]);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const latest = await client.getBlockNumber();
      const fromBlock = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;

      // Decimals are read per token rather than assumed: USDC is 6 on most
      // chains, but assuming that for an 18-decimal token overstates a balance
      // by a factor of a trillion.
      const decimalsList = await Promise.all(
        tokens.map((t) =>
          client
            .readContract({ address: t.address, abi: erc20Abi, functionName: 'decimals' })
            .then((d) => Number(d))
            .catch(() => null)
        )
      );

      const perToken = await Promise.all(
        tokens.map(async (token, i) => {
          const decimals = decimalsList[i];
          if (decimals === null) return [];

          const [out, incoming] = await Promise.all([
            client
              .getLogs({
                address: token.address,
                event: TRANSFER_EVENT,
                args: { from: owner },
                fromBlock,
                toBlock: 'latest',
              })
              .catch(() => []),
            client
              .getLogs({
                address: token.address,
                event: TRANSFER_EVENT,
                args: { to: owner },
                fromBlock,
                toBlock: 'latest',
              })
              .catch(() => []),
          ]);

          type TransferLog = Awaited<
            ReturnType<typeof client.getLogs<typeof TRANSFER_EVENT>>
          >[number];

          const toTransfer = (log: TransferLog, direction: 'sent' | 'received'): Transfer => {
            const raw = log.args.value ?? 0n;
            return {
              direction,
              counterparty: (direction === 'sent' ? log.args.to : log.args.from) as Address,
              symbol: token.symbol,
              raw,
              decimals,
              amount: formatUnits(raw, decimals),
              blockNumber: log.blockNumber ?? 0n,
              txHash: log.transactionHash as `0x${string}`,
              timestamp: null,
            };
          };

          return [
            ...out.map((l) => toTransfer(l, 'sent')),
            ...incoming.map((l) => toTransfer(l, 'received')),
          ];
        })
      );

      if (id !== requestId.current) return;

      const merged = perToken
        .flat()
        .sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0))
        .slice(0, limit);

      // Resolve times only for what will actually be rendered.
      const blocks = [...new Set(merged.slice(0, TIMESTAMPED_LIMIT).map((t) => t.blockNumber))];
      const times = new Map<bigint, number>();
      await Promise.all(
        blocks.map((blockNumber) =>
          client
            .getBlock({ blockNumber })
            .then((b) => times.set(blockNumber, Number(b.timestamp)))
            // A missing timestamp renders as a block height, which is still true.
            .catch(() => undefined)
        )
      );

      if (id !== requestId.current) return;

      setTransfers(
        merged.map((t) => ({ ...t, timestamp: times.get(t.blockNumber) ?? null }))
      );
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'Could not load transfers.');
      setTransfers([]);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [chain, owner, limit]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  return { transfers, loading, error, refresh: load };
}

/** Compact relative time, e.g. "3m ago". Falls back to null when unknown. */
export function relativeTime(unixSeconds: number | null): string | null {
  if (unixSeconds === null) return null;
  const seconds = Math.floor(Date.now() / 1000) - unixSeconds;
  if (seconds < 0) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

export function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
