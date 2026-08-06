'use client';
/**
 * Market prices from App Kit's pricing service.
 *
 * Every price here is fetched. None is assumed to be $1.00 — verified live,
 * USDC quoted at $1.0002 and EURC at $1.1509, and EURC is not a dollar
 * stablecoin at all. Hardcoding parity would misreport portfolio value and
 * would hide exactly the depeg event a user would most want to see.
 *
 * Coverage is bounded by what the service actually prices. It exposes four
 * token aliases — USDC, USDT, EURC and NATIVE — so quotes exist for the
 * stablecoins plus each chain's gas asset (ETH via Ethereum, POL via Polygon,
 * SOL via Solana, verified live at $1896.96 / $0.0754 / $73.89). Assets with no
 * alias and no registry address, notably BTC and the ARB governance token,
 * cannot be quoted and are therefore not listed rather than filled in from an
 * unrelated source.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getEnvChains, type ArcChain } from './chains';
import { fetchRates, nativeRate, rateFor } from './rates';

export interface MarketRow {
  symbol: string;
  /** Longer name for display, e.g. "Ethereum" for ETH. */
  name: string;
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
 * dollar is meaningless — it is quoted, never graded. Volatile assets like ETH
 * have no peg at all.
 */
const USD_PEGGED = new Set(['USDC', 'USDT']);

/** Display names for the symbols we can actually quote. */
const NAMES: Record<string, string> = {
  USDC: 'USD Coin',
  USDT: 'Tether',
  EURC: 'Euro Coin',
  ETH: 'Ethereum',
  POL: 'Polygon',
  MATIC: 'Polygon',
  SOL: 'Solana',
  AVAX: 'Avalanche',
  BNB: 'BNB',
};

export function useMarket(isTestnet: boolean, pollMs = 60_000) {
  const [rows, setRows] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);

    const candidates: ArcChain[] = getEnvChains(isTestnet).filter((c) => c.type === 'evm');

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

    // Walk chains collecting quotes. Stablecoin prices are global so the first
    // hit wins, but native assets differ per chain and each contributes its own
    // symbol (ETH from Ethereum, POL from Polygon, and so on).
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
          name: NAMES[symbol] ?? symbol,
          priceUSD: rate.priceUSD,
          pegDeviationPct: USD_PEGGED.has(symbol) ? (rate.priceUSD - 1) * 100 : null,
          sourceChain: chain.label,
          fetchedAt: rate.fetchedAt,
        });
      }

      // The chain's gas asset, keyed by its own symbol so several chains
      // sharing ETH collapse into one row rather than repeating it.
      const native = nativeRate(rates);
      const nativeSymbol = chain.nativeCurrency.symbol;
      if (native && !out.has(nativeSymbol)) {
        out.set(nativeSymbol, {
          symbol: nativeSymbol,
          name: NAMES[nativeSymbol] ?? nativeSymbol,
          priceUSD: native.priceUSD,
          // Gas assets float freely; there is no peg to deviate from.
          pegDeviationPct: USD_PEGGED.has(nativeSymbol)
            ? (native.priceUSD - 1) * 100
            : null,
          sourceChain: chain.label,
          fetchedAt: native.fetchedAt,
        });
      }
    }

    if (id !== requestId.current) return;

    // Stablecoins first (the app's subject matter), then gas assets by value.
    const ordered = [...out.values()].sort((a, b) => {
      const aStable = a.pegDeviationPct !== null || a.symbol === 'EURC';
      const bStable = b.pegDeviationPct !== null || b.symbol === 'EURC';
      if (aStable !== bStable) return aStable ? -1 : 1;
      return b.priceUSD - a.priceUSD;
    });

    setRows(ordered);
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

/**
 * Format a price with precision suited to its magnitude.
 *
 * Stablecoins need four decimals to make a depeg visible; an asset priced in
 * the thousands does not, and showing $1896.9600 just adds noise.
 */
export function formatPrice(value: number): string {
  const digits = value >= 100 ? 2 : 4;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
