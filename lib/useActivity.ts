'use client';

import { useCallback, useEffect, useState } from 'react';
import { ADDRESSES, arcFlowSendAbi } from './config';
import { publicClient } from './useWallet';

export interface Activity {
  direction: 'sent' | 'received';
  counterparty: `0x${string}`;
  amount: bigint;
  fee: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

/** How far back to scan for history. Keeps the RPC request bounded. */
const LOOKBACK_BLOCKS = 50_000n;

/**
 * Reads the caller's transfer history from `ArcFlowSend`'s `Sent` events.
 *
 * Two filtered queries (from / to) rather than scanning every event, so the
 * node does the matching.
 */
export function useActivity(address: `0x${string}` | '', limit = 10) {
  const [activity, setActivity] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address || !ADDRESSES.send) {
      setActivity([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;
      const event = arcFlowSendAbi.find(
        (item) => item.type === 'event' && item.name === 'Sent'
      ) as any;

      const [outgoing, incoming] = await Promise.all([
        publicClient.getLogs({
          address: ADDRESSES.send,
          event,
          args: { from: address },
          fromBlock,
          toBlock: 'latest',
        }),
        publicClient.getLogs({
          address: ADDRESSES.send,
          event,
          args: { to: address },
          fromBlock,
          toBlock: 'latest',
        }),
      ]);

      const mapped: Activity[] = [
        ...outgoing.map((log) => ({
          direction: 'sent' as const,
          counterparty: (log as any).args.to as `0x${string}`,
          amount: (log as any).args.amount as bigint,
          fee: (log as any).args.fee as bigint,
          blockNumber: log.blockNumber ?? 0n,
          txHash: log.transactionHash!,
        })),
        ...incoming.map((log) => ({
          direction: 'received' as const,
          counterparty: (log as any).args.from as `0x${string}`,
          amount: (log as any).args.amount as bigint,
          fee: (log as any).args.fee as bigint,
          blockNumber: log.blockNumber ?? 0n,
          txHash: log.transactionHash!,
        })),
      ];

      // Newest first
      mapped.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0));
      setActivity(mapped.slice(0, limit));
    } catch (err) {
      console.error('Failed to load activity:', err);
      setError('Could not load activity from chain.');
      setActivity([]);
    } finally {
      setIsLoading(false);
    }
  }, [address, limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { activity, isLoading, error, refresh };
}

export function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
