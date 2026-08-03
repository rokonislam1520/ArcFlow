'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { ADDRESSES, USDC_DECIMALS, erc20Abi, type TokenInfo } from './config';
import { publicClient } from './useWallet';

/** Trims trailing zeros so 12.500000 renders as 12.5. */
export function formatAmount(raw: bigint, decimals: number, maxFractionDigits = 4): string {
  const asString = formatUnits(raw, decimals);
  const num = Number(asString);
  if (!Number.isFinite(num)) return asString;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

/**
 * Reads an ERC20 balance for `owner` from chain.
 *
 * `refresh` is exposed so callers can re-read after a transaction confirms
 * rather than showing a stale number.
 */
export function useTokenBalance(
  owner: `0x${string}` | '',
  token: `0x${string}` | undefined,
  decimals: number
) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!owner || !token) {
      setBalance(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = (await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [owner],
      })) as bigint;
      setBalance(result);
    } catch (err) {
      console.error('balanceOf failed:', err);
      setError('Could not read balance');
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [owner, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    balance,
    formatted: balance === null ? null : formatAmount(balance, decimals),
    isLoading,
    error,
    refresh,
  };
}

/** Convenience wrapper for the USDC balance, which most pages need. */
export function useUsdcBalance(owner: `0x${string}` | '') {
  return useTokenBalance(owner, ADDRESSES.usdc, USDC_DECIMALS);
}

/** Reads balances for several tokens at once (Portfolio / Swap selectors). */
export function useTokenBalances(owner: `0x${string}` | '', tokens: TokenInfo[]) {
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = tokens.map((t) => t.address ?? '').join(',');

  const refresh = useCallback(async () => {
    const withAddress = tokens.filter((t) => t.address);
    if (!owner || withAddress.length === 0) {
      setBalances({});
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        withAddress.map((t) =>
          publicClient.readContract({
            address: t.address!,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [owner],
          }) as Promise<bigint>
        )
      );
      const next: Record<string, bigint> = {};
      withAddress.forEach((t, i) => {
        next[t.symbol] = results[i];
      });
      setBalances(next);
    } catch (err) {
      console.error('Batch balanceOf failed:', err);
      setError('Could not read balances');
      setBalances({});
    } finally {
      setIsLoading(false);
    }
    // `key` captures the token list identity without re-running on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { balances, isLoading, error, refresh };
}
