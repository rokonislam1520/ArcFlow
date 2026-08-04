/**
 * Real multichain portfolio, read directly from each chain.
 *
 * Balances come from ERC-20 `balanceOf` and `eth_getBalance` via viem, batched
 * through multicall3 where available. Values are then priced with live rates
 * from App Kit.
 *
 * Deliberately NOT built on `unifiedBalance.getBalances`: that reports funds
 * deposited into Circle's Gateway, not funds in the user's wallet. Verified
 * against a well-known funded mainnet address, it returned 0.000000 on all 25
 * supported chains — so using it for "total portfolio value" would show almost
 * every real user a zero balance. Gateway holdings are surfaced separately and
 * labelled as such.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { erc20Abi, formatUnits, type Address } from 'viem';
import { getEnvChains, type ArcChain } from './chains';
import { getPublicClient } from './clients';
import { fetchRates, rateFor } from './rates';

/** One token holding on one chain. */
export interface Holding {
  chainId: string;
  chainLabel: string;
  symbol: string;
  /** Undefined for the chain's native asset. */
  address?: string;
  /** Raw base units, kept exact; formatting happens at the edge. */
  raw: bigint;
  decimals: number;
  /** Human-readable amount. */
  amount: string;
  /** Null when the pricing service has no quote for this token. */
  valueUSD: number | null;
  isNative: boolean;
}

export interface ChainPortfolio {
  chain: ArcChain;
  holdings: Holding[];
  /** Sum of priced holdings only; unpriced tokens are excluded, not zeroed. */
  valueUSD: number;
  /** Set when this chain's RPC failed, so the UI can distinguish 0 from error. */
  error?: string;
}

export interface Portfolio {
  chains: ChainPortfolio[];
  totalUSD: number;
  /** True when at least one chain failed, meaning the total is understated. */
  partial: boolean;
  loading: boolean;
  updatedAt: number | null;
}

/** ERC-20 tokens the registry knows about for a chain. */
function tokenList(chain: ArcChain): Array<{ symbol: string; address: Address }> {
  const out: Array<{ symbol: string; address: Address }> = [];
  for (const symbol of ['USDC', 'EURC', 'USDT'] as const) {
    const address = chain.tokens[symbol];
    if (address) out.push({ symbol, address: address as Address });
  }
  return out;
}

/**
 * Read token balances, preferring one multicall but falling back to individual
 * `eth_call`s.
 *
 * The fallback matters: viem throws outright if Multicall3 is absent from a
 * chain, and losing an entire chain's balances over a missing helper contract
 * is a worse outcome than a few extra RPC calls. The transport batches those
 * calls into a single HTTP request anyway.
 */
async function readTokenBalances(
  client: NonNullable<ReturnType<typeof getPublicClient>>,
  tokens: Array<{ symbol: string; address: Address }>,
  owner: Address
): Promise<Array<bigint | null>> {
  if (tokens.length === 0) return [];

  try {
    const results = await client.multicall({
      contracts: tokens.map((t) => ({
        address: t.address,
        abi: erc20Abi,
        functionName: 'balanceOf' as const,
        args: [owner] as const,
      })),
      allowFailure: true,
    });
    return results.map((r) => (r.status === 'success' ? (r.result as bigint) : null));
  } catch {
    return Promise.all(
      tokens.map((t) =>
        client
          .readContract({
            address: t.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [owner],
          })
          .then((v) => v as bigint)
          .catch(() => null)
      )
    );
  }
}

/**
 * Read every balance for one chain.
 *
 * Never throws: a single unreachable RPC must not blank the whole portfolio,
 * so failure is reported per chain and the rest still renders.
 */
export async function readChainPortfolio(
  chain: ArcChain,
  owner: Address
): Promise<ChainPortfolio> {
  const client = getPublicClient(chain);
  if (!client) {
    // Non-EVM (Solana) or no RPC. Reported rather than silently skipped.
    return {
      chain,
      holdings: [],
      valueUSD: 0,
      error:
        chain.type !== 'evm'
          ? `${chain.label} needs a non-EVM adapter`
          : `No RPC endpoint for ${chain.label}`,
    };
  }

  const tokens = tokenList(chain);

  try {
    // Rates and balances are independent, so overlap them.
    const [rates, native, tokenBalances] = await Promise.all([
      fetchRates(chain),
      client.getBalance({ address: owner }).catch(() => null),
      readTokenBalances(client, tokens, owner),
    ]);

    const holdings: Holding[] = [];

    tokens.forEach((token, i) => {
      const raw = tokenBalances[i];
      // null means the read failed; 0n means a genuinely empty balance. Both
      // are omitted from the list, but only the former is a missing datum.
      if (raw === null || raw === 0n) return;

      const rate = rateFor(rates, token.address);
      // Trust the pricing service's decimals when present: it is authoritative
      // for the token it just priced, and USDC is 6 on most chains but not all.
      const decimals = rate?.decimals ?? 6;
      const amount = formatUnits(raw, decimals);

      holdings.push({
        chainId: chain.id,
        chainLabel: chain.label,
        symbol: token.symbol,
        address: token.address,
        raw,
        decimals,
        amount,
        valueUSD: rate ? Number(amount) * rate.priceUSD : null,
        isNative: false,
      });
    });

    if (native !== null && native > 0n) {
      const { decimals, symbol } = chain.nativeCurrency;
      const amount = formatUnits(native, decimals);
      // On Arc the gas token is USDC, so the native asset is genuinely priced;
      // elsewhere it is ETH/MATIC/etc. which this rates call does not cover.
      const nativeRate = rateFor(rates, chain.tokens.USDC);
      const priced = symbol === 'USDC' && nativeRate ? Number(amount) * nativeRate.priceUSD : null;

      holdings.push({
        chainId: chain.id,
        chainLabel: chain.label,
        symbol,
        raw: native,
        decimals,
        amount,
        valueUSD: priced,
        isNative: true,
      });
    }

    const valueUSD = holdings.reduce((sum, h) => sum + (h.valueUSD ?? 0), 0);
    return { chain, holdings, valueUSD };
  } catch (err) {
    return {
      chain,
      holdings: [],
      valueUSD: 0,
      error: err instanceof Error ? err.message : `Failed to read ${chain.label}`,
    };
  }
}

/**
 * Live portfolio across every chain in the active network mode.
 *
 * Chains are read concurrently; each settles independently so one slow network
 * cannot stall the view.
 */
export function usePortfolio(
  owner: Address | null,
  isTestnet: boolean,
  options: { pollMs?: number } = {}
): Portfolio & { refresh: () => Promise<void> } {
  const { pollMs = 30_000 } = options;

  const [state, setState] = useState<Omit<Portfolio, 'loading'>>({
    chains: [],
    totalUSD: 0,
    partial: false,
    updatedAt: null,
  });
  const [loading, setLoading] = useState(false);
  // Discards responses from a superseded address/network selection.
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!owner) {
      setState({ chains: [], totalUSD: 0, partial: false, updatedAt: null });
      return;
    }

    const id = ++requestId.current;
    setLoading(true);

    // Only EVM chains with at least one known token are worth reading.
    const chains = getEnvChains(isTestnet).filter(
      (c) => c.type === 'evm' && c.rpcEndpoints.length > 0
    );

    const results = await Promise.all(
      chains.map((c) => readChainPortfolio(c, owner))
    );

    if (id !== requestId.current) return; // A newer request won.

    const withFunds = results.filter((r) => r.holdings.length > 0 || r.error);
    setState({
      chains: withFunds,
      totalUSD: results.reduce((sum, r) => sum + r.valueUSD, 0),
      partial: results.some((r) => r.error),
      updatedAt: Date.now(),
    });
    setLoading(false);
  }, [owner, isTestnet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!owner || pollMs <= 0) return;
    const timer = setInterval(() => {
      // Skip background tabs; polling dozens of RPCs unseen is wasteful.
      if (typeof document !== 'undefined' && document.hidden) return;
      void refresh();
    }, pollMs);
    return () => clearInterval(timer);
  }, [owner, pollMs, refresh]);

  return { ...state, loading, refresh };
}

/** Aggregate holdings by token symbol across all chains. */
export function byToken(
  chains: ChainPortfolio[]
): Array<{ symbol: string; amount: number; valueUSD: number; chains: number }> {
  const map = new Map<string, { amount: number; valueUSD: number; chains: Set<string> }>();

  for (const c of chains) {
    for (const h of c.holdings) {
      const entry = map.get(h.symbol) ?? { amount: 0, valueUSD: 0, chains: new Set<string>() };
      entry.amount += Number(h.amount);
      entry.valueUSD += h.valueUSD ?? 0;
      entry.chains.add(h.chainId);
      map.set(h.symbol, entry);
    }
  }

  return [...map.entries()]
    .map(([symbol, v]) => ({
      symbol,
      amount: v.amount,
      valueUSD: v.valueUSD,
      chains: v.chains.size,
    }))
    .sort((a, b) => b.valueUSD - a.valueUSD);
}

/** Format a USD amount for display, with sane precision for small values. */
export function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: value !== 0 && Math.abs(value) < 0.01 ? 6 : 2,
  }).format(value);
}
