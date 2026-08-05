'use client';
/**
 * Live network health, measured rather than assumed.
 *
 * Each chain is probed with a real `eth_blockNumber` call and timed. Nothing
 * here is a static "operational" badge: a chain is reported healthy only
 * because a request to it just succeeded, and the latency shown is the one we
 * actually observed. A status indicator that cannot fail is worse than none,
 * because it tells users everything is fine while their transfers hang.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getEnvChains, type ArcChain } from './chains';
import { getPublicClient } from './clients';
import { useRefreshSignal } from './refresh';

export interface ChainStatus {
  chain: ArcChain;
  /** Latest block height, or null when the probe failed. */
  blockNumber: bigint | null;
  /** Round-trip time in ms for the probe that produced `blockNumber`. */
  latencyMs: number | null;
  ok: boolean;
  error?: string;
}

/** Latency bands, used only for presentation. */
export type LatencyGrade = 'fast' | 'ok' | 'slow';

export function gradeLatency(ms: number | null): LatencyGrade | null {
  if (ms === null) return null;
  if (ms < 400) return 'fast';
  if (ms < 1200) return 'ok';
  return 'slow';
}

/** A probe that hangs must not leave the row spinning forever. */
const PROBE_TIMEOUT_MS = 8_000;

async function probe(chain: ArcChain): Promise<ChainStatus> {
  const client = getPublicClient(chain);
  if (!client) {
    return {
      chain,
      blockNumber: null,
      latencyMs: null,
      ok: false,
      error: chain.type !== 'evm' ? 'Needs a non-EVM adapter' : 'No RPC endpoint',
    };
  }

  const started = Date.now();
  try {
    const blockNumber = await Promise.race([
      client.getBlockNumber(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timed out')), PROBE_TIMEOUT_MS)
      ),
    ]);
    return {
      chain,
      blockNumber,
      latencyMs: Date.now() - started,
      ok: true,
    };
  } catch (err) {
    return {
      chain,
      blockNumber: null,
      // Report how long we waited before giving up; that is real information.
      latencyMs: Date.now() - started,
      ok: false,
      error: err instanceof Error ? err.message : 'Unreachable',
    };
  }
}

/**
 * Poll every configured chain.
 *
 * Chains are probed concurrently and each settles on its own, so one dead RPC
 * cannot stall the panel.
 */
export function useNetworkStatus(
  isTestnet: boolean,
  options: { pollMs?: number; limit?: number } = {}
) {
  const { pollMs = 30_000, limit } = options;
  const [statuses, setStatuses] = useState<ChainStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const requestId = useRef(0);
  const refreshSignal = useRefreshSignal();

  const check = useCallback(async () => {
    const chains = getEnvChains(isTestnet).filter((c) => c.type === 'evm');
    const subset = limit ? chains.slice(0, limit) : chains;

    const id = ++requestId.current;
    setLoading(true);

    const results = await Promise.all(subset.map(probe));

    if (id !== requestId.current) return; // superseded by a newer run
    setStatuses(results);
    setCheckedAt(Date.now());
    setLoading(false);
  }, [isTestnet, limit]);

  useEffect(() => {
    void check();
  }, [check, refreshSignal]);

  useEffect(() => {
    if (pollMs <= 0) return;
    const timer = setInterval(() => {
      // A hidden tab does not need fresh block heights.
      if (typeof document !== 'undefined' && document.hidden) return;
      void check();
    }, pollMs);
    return () => clearInterval(timer);
  }, [check, pollMs]);

  const healthy = statuses.filter((s) => s.ok).length;

  return {
    statuses,
    loading,
    checkedAt,
    healthy,
    total: statuses.length,
    /** True when every probed chain answered. */
    allHealthy: statuses.length > 0 && healthy === statuses.length,
    refresh: check,
  };
}
