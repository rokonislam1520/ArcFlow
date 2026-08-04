/**
 * Real USD token prices from App Kit.
 *
 * Prices are never hardcoded and never assumed. A stablecoin is not exactly
 * $1.00 — verified live, USDC quoted at $1.0002 and EURC at $1.1509 — so
 * pretending otherwise would misreport portfolio value, and would be badly
 * wrong for the non-USD stablecoins this app supports.
 *
 * `getTokenRates` works without credentials ("permissionless mode"), verified
 * against @circle-fin/app-kit 1.11.0. A `kitKey` may be supplied for higher
 * rate limits; it must stay server-side, so it is intentionally not read from a
 * NEXT_PUBLIC_* variable here.
 */
'use client';

import type { AppKit } from '@circle-fin/app-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getKit, type ArcChain, type TokenAlias } from './chains';

/** A price quote for one token, with the timestamp the service reported. */
export interface Rate {
  priceUSD: number;
  /** When the upstream service priced it, not when we fetched it. */
  fetchedAt: number;
  decimals?: number;
}

/** Quotes keyed by lowercase token address. */
export type RateMap = Record<string, Rate>;

/**
 * Cache keyed by chain id. Prices move slowly relative to render frequency, so
 * this avoids a network round trip for every component that shows a value.
 */
const cache = new Map<string, { at: number; rates: RateMap }>();

/** Long enough to prevent request storms, short enough to stay current. */
const TTL_MS = 60_000;

/**
 * Fetch rates for the tokens a chain actually has.
 *
 * Returns an empty map rather than throwing when the service has no data for a
 * chain: an unpriced token should render as "unavailable", not take down the
 * whole dashboard.
 */
export async function fetchRates(chain: ArcChain): Promise<RateMap> {
  const cached = cache.get(chain.id);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rates;

  const tokens: TokenAlias[] = [];
  if (chain.tokens.USDC) tokens.push('USDC');
  if (chain.tokens.EURC) tokens.push('EURC');
  if (chain.tokens.USDT) tokens.push('USDT');
  if (tokens.length === 0) return {};

  try {
    const { rates } = await getKit().getTokenRates({
      // The SDK types `chain` as its Blockchain enum, whose values are exactly
      // these registry ids; the runtime accepts the plain string (verified
      // against 1.11.0 with 'Ethereum' and 'Arc_Testnet'). Casting at this one
      // boundary keeps the registry the single source of chain ids instead of
      // duplicating the enum across the app.
      chain: chain.id as Parameters<AppKit['getTokenRates']>[0]['chain'],
      tokens,
    });

    // Response shape is rates[chainId][tokenAddress]; addresses come back
    // lowercased, so normalize keys for reliable lookups.
    const forChain = (rates as Record<string, Record<string, unknown>>)[chain.id] ?? {};
    const out: RateMap = {};
    for (const [addr, value] of Object.entries(forChain)) {
      const r = value as { priceUSD?: string; fetchedAt?: number; decimals?: number };
      const price = Number(r.priceUSD);
      // A non-finite or negative price is unusable; omit rather than show junk.
      if (!Number.isFinite(price) || price < 0) continue;
      out[addr.toLowerCase()] = {
        priceUSD: price,
        fetchedAt: r.fetchedAt ?? Date.now(),
        decimals: r.decimals,
      };
    }

    cache.set(chain.id, { at: Date.now(), rates: out });
    return out;
  } catch {
    // Serve a stale quote if we have one; a slightly old price beats none.
    return cached?.rates ?? {};
  }
}

/** Look up one token's price, tolerating address casing differences. */
export function rateFor(rates: RateMap, address?: string): Rate | undefined {
  if (!address) return undefined;
  return rates[address.toLowerCase()];
}

/**
 * Live rates for a chain, refreshed on an interval.
 *
 * Refresh pauses when the tab is hidden: a background tab polling prices wastes
 * the user's battery and our rate limit.
 */
export function useRates(chain: ArcChain | null): {
  rates: RateMap;
  loading: boolean;
  refresh: () => void;
} {
  const [rates, setRates] = useState<RateMap>({});
  const [loading, setLoading] = useState(false);
  // Guards against a slow response for a previous chain overwriting a newer one.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!chain) {
      setRates({});
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const next = await fetchRates(chain);
    if (id === requestId.current) {
      setRates(next);
      setLoading(false);
    }
  }, [chain]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load();
    }, TTL_MS);
    return () => clearInterval(timer);
  }, [load]);

  return { rates, loading, refresh: load };
}
