'use client';
/**
 * Stablecoin market data from App Kit's pricing service.
 *
 * Every price here is fetched. None is assumed to be $1.00 — verified live,
 * USDC quoted at $1.0002 and EURC at $1.1509, and EURC is not a dollar
 * stablecoin at all. Hardcoding parity would misreport portfolio value and
 * would hide exactly the depeg event a user would most want to see.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getEnvChains, type ArcChain } from './chains';
import { fetchRates, rateFor } from './rates';

export interface MarketRow {
  symbol: string;
  priceUSD: number;
  /**
   * Signed % difference from this token's own reference value. Null when the
   * token has no meaningful peg to compare against.
   */
  pegDeviationPct: number | null;
  /** Chain the quote was read from, so the number is attributable. */
  sourceChain: string;
  fetchedAt: number;
}

/**
 * Reference values used only to express deviation.
 *
 * USD-pegged coins reference 1.00. EURC is euro-pegged, so comparing it to a
 * dollar is meaningless — it is quoted, never graded.
 */
const USD_PEGGED = new Set(['USDC', 'USDT']);

export function useMarket(isTestnet: boolean, pollMs = 60_000) {
  const [rows, setRows] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);

    // Prefer a chain that actually carries these tokens. Rates are global, but
    // the service is queried per chain, so pick one that has them listed.
    const candidates: ArcChain[] = getEnvChains(isTestnet).filter(
      (c) => c.type === 'evm' && (c.tokens.USDC || c.tokens.EURC || c.tokens.USDT)
    );

    if (candidates.length === 0) {
      if (id === requestId.current) {
        setRows([]);
        setError('No priced tokens on this network.');
        setLoading(false);
      }
      return;
    }

    const out = new Map<string, MarketRow>();
    let sawAny = false;

    // Walk chains until every token has a quote; most resolve on the first.
    for (const chain of candidates) {
      const rates = await fetchRates(chain);
      if (Object.keys(rates).length === 0) continue;
      sawAny = true;

      for (const symbol of ['USDC', 'EURC', 'USDT'] as const) {
        if (out.has(symbol)) continue;
        const rate = rateFor(rates, chain.tokens[symbol]);
        if (!rate) continue;

        out.set(symbol, {
          symbol,
          priceUSD: rate.priceUSD,
          pegDeviationPct: USD_PEGGED.has(symbol) ? (rate.priceUSD - 1) * 100 : null,
          sourceChain: chain.label,
          fetchedAt: rate.fetchedAt,
        });
      }

      if (out.size === 3) break;
    }

    if (id !== requestId.current) return;

    setRows([...out.values()]);
    // Distinguish "service returned nothing" from "we have not asked yet".
    setError(sawAny ? null : 'Pricing service unavailable.');
    setUpdatedAt(Date.now());
    setLoading(false);
  }, [isTestnet]);

  useEffect(() => {
    void load();
    if (pollMs <= 0) return;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load();
    }, pollMs);
    return () => clearInterval(timer);
  }, [load, pollMs]);

  return { rows, loading, error, updatedAt, refresh: load };
}

/** Format a price with enough precision to make a depeg visible. */
export function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}
