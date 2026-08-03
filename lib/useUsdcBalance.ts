'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import { ADDRESSES, RPC_URL, USDC_DECIMALS, erc20Abi } from './config';

/**
 * Reads the connected account's USDC balance from chain.
 *
 * Uses a read-only HTTP client rather than the injected wallet provider so the
 * balance still resolves when the wallet is on a different network.
 */
export function useUsdcBalance(address: string) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address || !ADDRESSES.usdc) {
      setBalance(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const client = createPublicClient({ transport: http(RPC_URL) });
      const result = await client.readContract({
        address: ADDRESSES.usdc,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      });
      setBalance(result as bigint);
    } catch (err) {
      console.error('Failed to read USDC balance:', err);
      setError('Could not read balance');
      setBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  /** Human-readable balance, or null when unavailable. */
  const formatted =
    balance === null ? null : formatUnits(balance, USDC_DECIMALS);

  return { balance, formatted, isLoading, error, refresh };
}
