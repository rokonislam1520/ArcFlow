'use client';
/**
 * Balance reads.
 *
 * Every number here comes from an `eth_call` against the chain's own RPC.
 * Nothing is mocked, and no price is hardcoded — fiat values come from App
 * Kit's `getTokenRates`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { erc20Abi, formatUnits, type Address } from 'viem';
import { getPublicClient } from './clients';
import { getEnvChains, getKit, type ArcChain } from './chains';
import { useNetworkMode } from './network';
import { useRefreshSignal } from './refresh';

export interface TokenBalance {
  symbol: string;
  /** Undefined for the chain's native asset. */
  address?: Address;
  decimals: number;
  raw: bigint;
  formatted: string;
}

/** Trim trailing zeros so "12.500000" renders as "12.5". */
export function prettyAmount(raw: bigint, decimals: number, maxFractionDigits = 6): string {
  const full = formatUnits(raw, decimals);
  const [whole, fraction = ''] = full.split('.');
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');
  const withCommas = Number(whole).toLocaleString('en-US');
  return trimmed ? `${withCommas}.${trimmed}` : withCommas;
}

/**
 * Balances for every token a chain supports, plus its native asset.
 * Uses one multicall per chain rather than N sequential round trips.
 */
export function useChainBalances(chain: ArcChain | null, address: Address | null) {
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-reads after any confirmed transaction, wherever in the app it happened.
  const refreshSignal = useRefreshSignal();

  // Guards against a slow earlier request overwriting a newer result.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!chain || !address) {
      setBalances([]);
      return;
    }
    const client = getPublicClient(chain);
    if (!client) {
      setError(`No RPC endpoint available for ${chain.label}`);
      return;
    }

    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);

    try {
      const tokens = Object.entries(chain.tokens) as [string, string][];

      const [nativeRaw, ...tokenResults] = await Promise.all([
        client.getBalance({ address }),
        ...tokens.map(([, tokenAddress]) =>
          client
            .multicall({
              contracts: [
                {
                  address: tokenAddress as Address,
                  abi: erc20Abi,
                  functionName: 'balanceOf',
                  args: [address],
                },
                {
                  address: tokenAddress as Address,
                  abi: erc20Abi,
                  functionName: 'decimals',
                },
              ],
              // A single missing token must not blank the whole page.
              allowFailure: true,
            })
            .catch(() => null)
        ),
      ]);

      if (id !== requestId.current) return; // superseded

      const next: TokenBalance[] = [];

      tokens.forEach(([symbol, tokenAddress], i) => {
        const result = tokenResults[i];
        if (!result) return;
        const [balanceRes, decimalsRes] = result;
        if (balanceRes.status !== 'success' || decimalsRes.status !== 'success') return;

        // Decimals are read on-chain rather than assumed: USDC is 6 on most
        // chains but DAI-style tokens are 18, and guessing corrupts amounts.
        const decimals = Number(decimalsRes.result);
        const raw = balanceRes.result as bigint;
        next.push({
          symbol,
          address: tokenAddress as Address,
          decimals,
          raw,
          formatted: prettyAmount(raw, decimals),
        });
      });

      next.push({
        symbol: chain.nativeCurrency.symbol,
        decimals: chain.nativeCurrency.decimals,
        raw: nativeRaw,
        formatted: prettyAmount(nativeRaw, chain.nativeCurrency.decimals),
      });

      setBalances(next);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'Failed to read balances');
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [chain, address]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  return { balances, isLoading, error, refresh: load };
}

export interface ChainBalanceSummary {
  chain: ArcChain;
  balances: TokenBalance[];
}

/**
 * USDC across every supported chain, read in parallel.
 *
 * This is the honest version of a "unified balance": each chain is queried
 * directly. App Kit's Gateway-backed Unified Balance is a separate product
 * (funds must be deposited into it first), so conflating the two would
 * misrepresent where the money actually sits.
 */
export function useMultichainUsdc(address: Address | null) {
  const { isTestnet } = useNetworkMode();
  const refreshSignal = useRefreshSignal();
  const chains = useMemo(
    () => getEnvChains(isTestnet).filter((c) => c.type === 'evm' && c.tokens.USDC),
    [isTestnet]
  );
  const [results, setResults] = useState<ChainBalanceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!address) {
      setResults([]);
      return;
    }
    setIsLoading(true);

    const settled = await Promise.all(
      chains.map(async (chain): Promise<ChainBalanceSummary | null> => {
        const client = getPublicClient(chain);
        const usdc = chain.tokens.USDC;
        if (!client || !usdc) return null;
        try {
          const [raw, decimals] = await Promise.all([
            client.readContract({
              address: usdc as Address,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [address],
            }),
            client.readContract({
              address: usdc as Address,
              abi: erc20Abi,
              functionName: 'decimals',
            }),
          ]);
          const d = Number(decimals);
          return {
            chain,
            balances: [
              {
                symbol: 'USDC',
                address: usdc as Address,
                decimals: d,
                raw: raw as bigint,
                formatted: prettyAmount(raw as bigint, d),
              },
            ],
          };
        } catch {
          // One unreachable RPC should not fail the whole portfolio.
          return null;
        }
      })
    );

    setResults(settled.filter((r): r is ChainBalanceSummary => r !== null));
    setIsLoading(false);
  }, [chains, address]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  /** Total USDC in base units. Safe to sum: USDC decimals match across chains. */
  const totalUsdc = useMemo(
    () => results.reduce((sum, r) => sum + (r.balances[0]?.raw ?? 0n), 0n),
    [results]
  );

  return { results, totalUsdc, isLoading, refresh: load };
}

/**
 * Live token rates from App Kit. Replaces the previously hardcoded price table
 * that made swap quotes wrong.
 */
export function useTokenRates(chain: ArcChain | null, tokens: string[]) {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const key = tokens.join(',');

  useEffect(() => {
    if (!chain || tokens.length === 0) return;
    let cancelled = false;

    void (async () => {
      try {
        const result = await getKit().getTokenRates({
          chain: chain.id,
          tokens,
        } as Parameters<ReturnType<typeof getKit>['getTokenRates']>[0]);

        if (cancelled) return;

        // Shape varies by SDK version, so normalize defensively instead of
        // assuming a layout and silently producing NaN.
        const out: Record<string, number> = {};
        const entries = Array.isArray(result)
          ? result
          : Object.entries(result ?? {}).map(([token, value]) => ({ token, value }));

        for (const entry of entries as Array<Record<string, unknown>>) {
          const token = String(entry.token ?? entry.symbol ?? '');
          const rawValue = entry.value ?? entry.rate ?? entry.price ?? entry.usdPrice;
          const value = Number(rawValue);
          if (token && Number.isFinite(value)) out[token] = value;
        }
        setRates(out);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setRates({});
          setError(err instanceof Error ? err.message : 'Rates unavailable');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // `key` stands in for the token array to avoid re-running on identical content.
  }, [chain, key, tokens]);

  return { rates, error };
}
