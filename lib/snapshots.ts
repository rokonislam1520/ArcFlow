'use client';
/**
 * Portfolio value history.
 *
 * App Kit's pricing service returns a spot price only — `priceUSD`, `fetchedAt`
 * and `decimals`, with no 24h change and no time series (verified against
 * 1.11.0). There is no historical balance endpoint either. So "24H change" and
 * "value over time" cannot be read from anywhere; the only honest way to show
 * them is to record what we actually observe and compare against that.
 *
 * This stores a local, per-address, per-network-mode series of portfolio
 * valuations. The consequence is that history begins when the user first opens
 * the dashboard, not when they first acquired funds — so callers must be able
 * to say "not enough history yet" rather than implying a real 24h delta. That
 * limitation is deliberate and surfaced in the UI; inventing a baseline would
 * produce a number that looks authoritative and is simply false.
 */
import { useEffect, useRef, useState } from 'react';

export interface Snapshot {
  /** Epoch ms when the valuation was taken. */
  at: number;
  /** Total portfolio value in USD at that moment. */
  totalUSD: number;
}

/** Keep two weeks: enough for the longest range offered, bounded in size. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Don't record more often than this. The portfolio polls every 30s; persisting
 * each poll would write ~2900 points/day and make the series mostly noise.
 */
const MIN_INTERVAL_MS = 5 * 60 * 1000;

/** Hard cap so a long-lived session cannot grow the entry without bound. */
const MAX_POINTS = 600;

function storageKey(owner: string, isTestnet: boolean): string {
  // Scoped per address and per network mode: testnet play money and mainnet
  // funds must never share a series, or the chart would show a cliff whenever
  // the user toggles modes.
  return `arcflow.pv.${isTestnet ? 't' : 'm'}.${owner.toLowerCase()}`;
}

function read(owner: string, isTestnet: boolean): Snapshot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(owner, isTestnet));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed
      .filter((p): p is Snapshot => {
        if (typeof p !== 'object' || p === null) return false;
        const s = p as Partial<Snapshot>;
        return (
          typeof s.at === 'number' &&
          typeof s.totalUSD === 'number' &&
          Number.isFinite(s.totalUSD) &&
          s.at > cutoff
        );
      })
      .sort((a, b) => a.at - b.at);
  } catch {
    // Corrupt or unavailable storage (private mode, quota) is not fatal: the
    // dashboard simply has no history to show.
    return [];
  }
}

function write(owner: string, isTestnet: boolean, points: Snapshot[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = points.slice(-MAX_POINTS);
    window.localStorage.setItem(storageKey(owner, isTestnet), JSON.stringify(trimmed));
  } catch {
    // Quota exceeded or storage disabled. History is a nicety, not a
    // requirement, so failing to persist must not break the page.
  }
}

export interface PortfolioHistory {
  points: Snapshot[];
  /**
   * Change since the oldest point at least 24h old. Null when no such point
   * exists — the series does not yet span a day, so no 24h delta is knowable.
   */
  change24h: { absolute: number; percent: number; since: number } | null;
  /** How long the recorded series spans, in ms. Zero when empty. */
  spanMs: number;
  /** True until the first valuation has been recorded. */
  isEmpty: boolean;
}

/**
 * Record portfolio value over time and derive the change since 24h ago.
 *
 * `totalUSD` is only recorded once it is meaningful: a zero total during the
 * initial load would otherwise be persisted as a real observation and show up
 * as a crash to zero on the chart.
 */
export function usePortfolioHistory(
  owner: string | null,
  isTestnet: boolean,
  totalUSD: number,
  options: { ready?: boolean } = {}
): PortfolioHistory {
  const { ready = true } = options;
  const [points, setPoints] = useState<Snapshot[]>([]);
  // Tracks the last write so we can throttle without re-reading storage.
  const lastWriteAt = useRef(0);

  // Load whenever the identity of the series changes.
  useEffect(() => {
    if (!owner) {
      setPoints([]);
      lastWriteAt.current = 0;
      return;
    }
    const existing = read(owner, isTestnet);
    setPoints(existing);
    lastWriteAt.current = existing.at(-1)?.at ?? 0;
  }, [owner, isTestnet]);

  // Append a new observation, throttled.
  useEffect(() => {
    if (!owner || !ready) return;

    const now = Date.now();
    if (now - lastWriteAt.current < MIN_INTERVAL_MS) return;

    lastWriteAt.current = now;
    setPoints((current) => {
      const next = [...current, { at: now, totalUSD }];
      write(owner, isTestnet, next);
      return next.slice(-MAX_POINTS);
    });
  }, [owner, isTestnet, totalUSD, ready]);

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  // The most recent point that is still at least 24h old is the correct
  // baseline; anything newer would understate the window.
  const baseline = [...points].reverse().find((p) => p.at <= dayAgo);
  const latest = points.at(-1);

  let change24h: PortfolioHistory['change24h'] = null;
  if (baseline && latest && baseline.totalUSD > 0) {
    const absolute = latest.totalUSD - baseline.totalUSD;
    change24h = {
      absolute,
      percent: (absolute / baseline.totalUSD) * 100,
      since: baseline.at,
    };
  }

  const spanMs = points.length > 1 ? points[points.length - 1].at - points[0].at : 0;

  return { points, change24h, spanMs, isEmpty: points.length === 0 };
}

/** Clear a stored series, e.g. when a user wants to reset their chart. */
export function clearHistory(owner: string, isTestnet: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(owner, isTestnet));
  } catch {
    // Nothing to do; the caller cannot act on this either.
  }
}
