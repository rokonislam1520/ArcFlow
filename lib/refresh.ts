'use client';
/**
 * App-wide refresh signal, published when money has actually moved on-chain.
 *
 * Without this, each page refreshed only its own data: send a transfer and the
 * dashboard, portfolio and activity list would all keep showing pre-transfer
 * numbers until manually reloaded. In a wallet, a stale balance shown next to a
 * confirmed transaction reads as money having vanished.
 *
 * Deliberately a plain module-level store rather than context: `useBalances`
 * and friends are called from many places, and threading a provider through
 * every one of them would be a lot of plumbing for a single integer.
 */
import { useEffect, useRef, useState } from 'react';

type Listener = (nonce: number) => void;

const listeners = new Set<Listener>();
let nonce = 0;

/**
 * Announce that on-chain state changed. Call only *after* a receipt confirms —
 * refreshing on submission would re-read the pre-transaction state and show a
 * number that contradicts the success the user was just shown.
 */
export function publishRefresh(): void {
  nonce += 1;
  for (const listener of listeners) listener(nonce);
}

/** Current signal value, for non-React callers. */
export function getRefreshNonce(): number {
  return nonce;
}

/**
 * Subscribe to the refresh signal.
 *
 * Returns a counter rather than firing a callback so it can be dropped into a
 * dependency array: the data hooks already reload when their deps change, and
 * this makes them reload on confirmation too, without a second code path.
 */
export function useRefreshSignal(): number {
  const [value, setValue] = useState(nonce);

  useEffect(() => {
    const listener: Listener = (next) => setValue(next);
    listeners.add(listener);
    // Re-sync in case a refresh fired between render and subscribe.
    if (nonce !== value) setValue(nonce);
    return () => {
      listeners.delete(listener);
    };
    // `value` is intentionally omitted: including it would resubscribe on every
    // signal, and the catch-up above only needs to run when mounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}

/**
 * Poll while a condition holds — used to keep watching a chain that has not yet
 * reflected a transfer (a destination chain after a bridge, for instance).
 *
 * Stops on unmount and never overlaps runs, so a slow RPC cannot pile up
 * requests behind a tab left open.
 */
export function usePolling(
  callback: () => Promise<void> | void,
  intervalMs: number,
  enabled: boolean
): void {
  // Held in a ref so changing the callback identity doesn't restart the timer.
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        await saved.current();
      } catch {
        // A failed poll is not fatal; the next tick tries again.
      } finally {
        running = false;
        if (!cancelled) timer = setTimeout(tick, intervalMs);
      }
    };

    timer = setTimeout(tick, intervalMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [intervalMs, enabled]);
}
