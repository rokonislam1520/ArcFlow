'use client';
/**
 * Multichain transaction history from ERC-20 Transfer logs.
 *
 * Core limitations:
 *
 * - Public RPCs commonly cap eth_getLogs to a few thousand blocks, so complete
 *   on-chain history is not feasible from the client. This scans the most recent
 *   window and paginates within it. A user whose first transfer is older than the
 *   window will see an incomplete list, which is honest: the alternative is an
 *   indexer backend or a chain-scan that takes minutes and frequently errors.
 *
 * - Transaction status (pending/confirmed/failed) requires polling mempool state
 *   or waiting for receipts. For confirmed transfers already in logs, the status
 *   is implicitly "confirmed" — if it had reverted, the Transfer event would not
 *   have been emitted. For a freshly submitted tx, real status tracking is wired
 *   through notifications (see useNotifications).
 *
 * - Logs give from/to/value, but no gas, no USD value at tx time, and no memo.
 *   Those require additional reads: getTransactionReceipt for gas, historical
 *   pricing for value at time, and either an indexer or event parsing for memos.
 *   This keeps what logs give directly and leaves augmentation to a future phase.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { erc20Abi, formatUnits, parseAbiItem, type Address, type Hash } from 'viem';
import { getEnvChains, type ArcChain } from './chains';
import { getPublicClient } from './clients';
import { useRefreshSignal } from './refresh';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

/**
 * A completed on-chain transfer, read from logs.
 *
 * Status is implicitly "confirmed" — a reverted transaction emits no Transfer
 * event, so its presence in logs means it succeeded.
 */
export interface HistoryTransfer {
  chainId: string;
  chainLabel: string;
  direction: 'sent' | 'received';
  counterparty: Address;
  tokenSymbol: string;
  tokenAddress: Address;
  raw: bigint;
  decimals: number;
  amount: string;
  blockNumber: bigint;
  txHash: Hash;
  /** Unix seconds, resolved from block timestamp. Null when unavailable. */
  timestamp: number | null;
  /** Derived: present when this tx also appears in the pending set. */
  wasPending?: boolean;
}

export interface HistoryChain {
  chain: ArcChain;
  transfers: HistoryTransfer[];
  /** Null when the chain loaded successfully; set when RPC failed. */
  error: string | null;
  loading: boolean;
  /**
   * Blocks actually scanned, after narrowing to what the RPC allowed. Null when
   * nothing was read. Surfaced so the UI can state real coverage instead of
   * implying the list is complete.
   */
  scannedBlocks: bigint | null;
}

export interface HistoryState {
  chains: HistoryChain[];
  /** True when at least one chain is still loading. */
  loading: boolean;
  /** Count of chains that successfully returned data. */
  healthy: number;
  total: number;
  /**
   * Narrowest window scanned across chains — the honest bound on coverage,
   * since the overall list is only as complete as its shallowest chain.
   */
  narrowestScan: bigint | null;
}

interface TokenRef {
  symbol: string;
  address: Address;
}

/**
 * Candidate scan windows, widest first.
 *
 * There is no single safe constant here: RPC endpoints come from config, and
 * their `eth_getLogs` caps differ by provider. Several public endpoints reject
 * a 9,000-block filtered query outright as an "archive request" while serving
 * 100 blocks fine, so a fixed window either fails on strict providers or
 * needlessly truncates history on permissive ones. This tries wide and narrows
 * until the endpoint accepts the request.
 */
const WINDOW_CANDIDATES = [9_000n, 2_000n, 500n, 100n] as const;

/**
 * Widest window each chain's RPC accepted, keyed by chain id.
 *
 * Cached so the narrowing probe runs once per chain rather than on every
 * refresh — without this, a strict endpoint would cost four failed requests
 * per token per load.
 */
const acceptedWindow = new Map<string, bigint>();

/**
 * Find the widest scan window this endpoint will serve.
 *
 * Probes with a real query rather than assuming, because the cap is a provider
 * policy that is not discoverable any other way.
 */
async function resolveWindow(
  client: NonNullable<ReturnType<typeof getPublicClient>>,
  chainId: string,
  probeToken: Address,
  owner: Address,
  latest: bigint
): Promise<bigint> {
  const cached = acceptedWindow.get(chainId);
  if (cached !== undefined) return cached;

  for (const width of WINDOW_CANDIDATES) {
    try {
      await client.getLogs({
        address: probeToken,
        event: TRANSFER_EVENT,
        args: { from: owner },
        fromBlock: latest > width ? latest - width : 0n,
        toBlock: 'latest',
      });
      acceptedWindow.set(chainId, width);
      return width;
    } catch {
      // Too wide for this provider; try the next.
    }
  }

  // Nothing worked — the failure is not about range. Use the narrowest so the
  // real error surfaces from the actual queries below.
  const narrowest = WINDOW_CANDIDATES[WINDOW_CANDIDATES.length - 1];
  acceptedWindow.set(chainId, narrowest);
  return narrowest;
}

/** Timestamp resolution is expensive; limit it to the most recent rows. */
const TIMESTAMPED_LIMIT = 30;

/**
 * Read transfer logs for one chain.
 *
 * Never throws; failure is reported in `.error` so one unreachable chain does
 * not blank the whole history.
 */
async function readChainHistory(
  chain: ArcChain,
  owner: Address
): Promise<Omit<HistoryChain, 'loading'>> {
  const client = getPublicClient(chain);
  if (!client) {
    return {
      chain,
      transfers: [],
      error:
        chain.type !== 'evm'
          ? `${chain.label} is not an EVM chain`
          : `No RPC endpoint configured for ${chain.label}`,
      scannedBlocks: null,
    };
  }

  const tokens: TokenRef[] = [];
  for (const symbol of ['USDC', 'EURC', 'USDT'] as const) {
    const address = chain.tokens[symbol];
    if (address) tokens.push({ symbol, address: address as Address });
  }

  if (tokens.length === 0) {
    // Nothing to scan rather than a failure: this chain has no tracked tokens.
    return { chain, transfers: [], error: null, scannedBlocks: null };
  }

  try {
    const latest = await client.getBlockNumber();
    const window = await resolveWindow(client, chain.id, tokens[0].address, owner, latest);
    const fromBlock = latest > window ? latest - window : 0n;

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

        const [sent, received] = await Promise.all([
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

        type TransferLog = (typeof sent)[number];

        const toTransfer = (log: TransferLog, direction: 'sent' | 'received'): HistoryTransfer => {
          const raw = log.args.value ?? 0n;
          return {
            chainId: chain.id,
            chainLabel: chain.label,
            direction,
            counterparty: (direction === 'sent' ? log.args.to : log.args.from) as Address,
            tokenSymbol: token.symbol,
            tokenAddress: token.address,
            raw,
            decimals,
            amount: formatUnits(raw, decimals),
            blockNumber: log.blockNumber ?? 0n,
            txHash: log.transactionHash as Hash,
            timestamp: null,
          };
        };

        return [...sent.map((l) => toTransfer(l, 'sent')), ...received.map((l) => toTransfer(l, 'received'))];
      })
    );

    const merged = perToken.flat().sort((a, b) =>
      b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0
    );

    // Resolve block timestamps only for the most recent; older rows fall back to block height.
    const blocks = [...new Set(merged.slice(0, TIMESTAMPED_LIMIT).map((t) => t.blockNumber))];
    const times = new Map<bigint, number>();
    await Promise.all(
      blocks.map((blockNumber) =>
        client
          .getBlock({ blockNumber })
          .then((b) => times.set(blockNumber, Number(b.timestamp)))
          .catch(() => undefined)
      )
    );

    return {
      chain,
      transfers: merged.map((t) => ({ ...t, timestamp: times.get(t.blockNumber) ?? null })),
      error: null,
      scannedBlocks: window,
    };
  } catch (err) {
    return {
      chain,
      transfers: [],
      error: err instanceof Error ? err.message : `Failed to read ${chain.label} history`,
      scannedBlocks: null,
    };
  }
}

/**
 * Multichain transfer history.
 *
 * Reads every EVM chain in the active network mode concurrently; each settles
 * independently so one slow RPC does not stall the view. Refreshes on the
 * app-wide signal so a confirmed transfer updates the list immediately.
 */
export function useHistory(owner: Address | null, isTestnet: boolean) {
  const [chains, setChains] = useState<HistoryChain[]>([]);
  const requestId = useRef(0);
  const refreshSignal = useRefreshSignal();

  const load = useCallback(async () => {
    if (!owner) {
      setChains([]);
      return;
    }

    const id = ++requestId.current;
    const targets = getEnvChains(isTestnet).filter(
      (c) => c.type === 'evm' && c.rpcEndpoints.length > 0
    );

    // Mark all as loading immediately so the UI shows progress.
    setChains(
      targets.map((c) => ({
        chain: c,
        transfers: [],
        error: null,
        loading: true,
        scannedBlocks: null,
      }))
    );

    const results = await Promise.all(targets.map((c) => readChainHistory(c, owner)));

    if (id !== requestId.current) return;

    setChains(results.map((r) => ({ ...r, loading: false })));
  }, [owner, isTestnet]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const loading = chains.some((c) => c.loading);
  const healthy = chains.filter((c) => !c.error).length;

  // The merged list is only as deep as its shallowest successful chain, so the
  // minimum is what can honestly be claimed about coverage.
  const scans = chains
    .map((c) => c.scannedBlocks)
    .filter((s): s is bigint => s !== null);
  const narrowestScan = scans.length > 0 ? scans.reduce((a, b) => (b < a ? b : a)) : null;

  return {
    chains,
    loading,
    healthy,
    total: chains.length,
    narrowestScan,
    refresh: load,
  } satisfies HistoryState & { refresh: () => Promise<void> };
}

/**
 * Merge every chain's transfers into one chronological list.
 *
 * Multichain history cannot be perfectly ordered without a common clock: block
 * N on Ethereum might settle before block M on Polygon even when M < N. This
 * sorts by block height within each chain and timestamp across chains when
 * available, which is correct enough for a wallet activity feed.
 */
export function mergeHistory(chains: HistoryChain[]): HistoryTransfer[] {
  return chains
    .flatMap((c) => c.transfers)
    .sort((a, b) => {
      // Timestamp when both have it; otherwise block height as a rough proxy.
      const aKey = a.timestamp ?? Number(a.blockNumber);
      const bKey = b.timestamp ?? Number(b.blockNumber);
      return bKey - aKey;
    });
}

/** Compact relative time for the activity list. */
export function relativeTime(unixSeconds: number | null): string | null {
  if (unixSeconds === null) return null;
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
