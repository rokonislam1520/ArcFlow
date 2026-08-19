'use client';
/**
 * The token universe for swapping, derived from the App Kit registry.
 *
 * Scope, stated plainly because it drives the whole selector UI: App Kit
 * exposes no token-list endpoint and no way to enumerate what a wallet holds.
 * A chain record carries `usdcAddress`, `eurcAddress`, `usdtAddress` and a
 * `nativeCurrency`, so the *browsable* catalogue is those four per chain across
 * the swap-capable chains. That is a limit on listing, not on trading.
 *
 * `swap()` and `estimateSwap()` type `tokenIn`/`tokenOut` as
 * `SupportedSwapToken | \`0x${string}\``, so a raw contract address is a valid
 * route. Any ERC-20 the user can name can therefore be traded, even though the
 * SDK cannot list it — see `lib/tokenResolve.ts`, which reads a pasted address
 * straight from the token contract.
 *
 * So this file builds the registry-backed catalogue, and resolution by address
 * extends it on demand. Neither path invents a token: every entry here comes
 * from a chain record, and every resolved entry comes from the contract itself.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getEnvChains,
  type ArcChain,
  type TokenAlias,
} from './chains';

/** A selectable token: one asset on one chain. */
export interface SwapToken {
  /** Stable identity: `${chainId}:${alias}`, or `${chainId}:${address}` when resolved. */
  key: string;
  /** Alias App Kit routes by. Native is routed as 'NATIVE'. */
  alias: TokenAlias;
  /**
   * What to hand the SDK as `tokenIn`/`tokenOut`.
   *
   * Registry tokens route by alias, so this is absent for them and `alias` is
   * used. Address-resolved tokens have no alias to speak of, so they carry the
   * contract address here — which `swap()` accepts directly. Callers must
   * therefore prefer `route ?? alias`; reading `alias` alone would silently
   * trade the wrong asset, since a resolved token's alias is only a placeholder.
   */
  route?: string;
  /** Ticker shown to the user. Native uses the chain's own symbol. */
  symbol: string;
  /** Canonical asset name. */
  name: string;
  chain: ArcChain;
  /** ERC-20 address. Absent for the native asset, which has none. */
  address?: string;
  /** True for the chain's gas asset. */
  isNative: boolean;
  /** Known for resolved tokens, which read it from the contract. */
  decimals?: number;
  /** Read from a contract rather than the registry, so not badged as canonical. */
  unverified?: boolean;
}

/** The value to send to App Kit for this token. */
export function routeOf(token: SwapToken): string {
  return token.route ?? token.alias;
}


/**
 * Canonical names for the three stablecoins in the registry.
 *
 * These are the issuers' own names, not decoration. Native assets take their
 * name from the chain record, so nothing here is guessed per chain.
 */
const STABLE_NAMES: Record<string, string> = {
  USDC: 'USD Coin',
  EURC: 'Euro Coin',
  USDT: 'Tether USD',
};

/** Tokens available on one chain, in a stable, sensible order. */
export function tokensForChain(chain: ArcChain): SwapToken[] {
  const out: SwapToken[] = [];

  (['USDC', 'EURC', 'USDT'] as const).forEach((alias) => {
    const address = chain.tokens[alias];
    if (!address) return;
    out.push({
      key: `${chain.id}:${alias}`,
      alias,
      symbol: alias,
      name: STABLE_NAMES[alias] ?? alias,
      chain,
      address,
      isNative: false,
    });
  });

  out.push({
    key: `${chain.id}:NATIVE`,
    alias: 'NATIVE',
    symbol: chain.nativeCurrency.symbol,
    name: chain.nativeCurrency.name,
    chain,
    isNative: true,
  });

  return out;
}

/**
 * Every routable token across every swap-capable chain in the current mode.
 *
 * Capability is passed through to the registry, so a chain with no swap route
 * never contributes tokens the user cannot actually trade.
 */
export function buildTokenUniverse(isTestnet: boolean): SwapToken[] {
  return getEnvChains(isTestnet, 'swap').flatMap(tokensForChain);
}

/** Chains that can swap, for the modal's left rail. */
export function swapChains(isTestnet: boolean): ArcChain[] {
  return getEnvChains(isTestnet, 'swap');
}

/* ------------------------------------------------------------------ search */

const ADDRESS_RE = /^0x[0-9a-fA-F]{6,40}$/;

/** Whether the query looks like the user pasted a contract address. */
export function isAddressQuery(query: string): boolean {
  return ADDRESS_RE.test(query.trim());
}

/**
 * Filter tokens by symbol, name, chain, or contract address.
 *
 * Address matching is prefix-based so a partially pasted address still finds
 * its token, and is compared case-insensitively because checksummed and
 * lowercase forms of the same address are the same address.
 */
export function searchTokens(tokens: SwapToken[], query: string): SwapToken[] {
  const q = query.trim().toLowerCase();
  if (!q) return tokens;

  if (isAddressQuery(q)) {
    return tokens.filter((t) => t.address?.toLowerCase().startsWith(q));
  }

  return tokens.filter(
    (t) =>
      t.symbol.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.chain.label.toLowerCase().includes(q)
  );
}

/** Chain-name filter for the left rail. */
export function searchChains(chains: ArcChain[], query: string): ArcChain[] {
  const q = query.trim().toLowerCase();
  if (!q) return chains;
  return chains.filter(
    (c) => c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
  );
}

/* --------------------------------------------------- favorites and recents */

const FAV_KEY = 'arcflow.swap.favoriteTokens';
const FAV_CHAIN_KEY = 'arcflow.swap.favoriteChains';
const RECENT_KEY = 'arcflow.swap.recentTokens';
const RECENT_LIMIT = 6;

function readList(storageKey: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Storage unavailable or corrupt: an empty list is a safe, honest default.
    return [];
  }
}

function writeList(storageKey: string, value: string[]): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Preference simply will not persist; nothing else depends on it.
  }
}

/**
 * A persisted set of keys, used for both favorite tokens and favorite chains.
 *
 * Reads happen in an effect rather than during render so server and first
 * client render agree — reading localStorage inline would hydrate-mismatch.
 */
function usePersistedSet(storageKey: string) {
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    setKeys(readList(storageKey));
  }, [storageKey]);

  const toggle = useCallback(
    (key: string) => {
      setKeys((prev) => {
        const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
        writeList(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const has = useCallback((key: string) => keys.includes(key), [keys]);

  return { keys, has, toggle };
}

export function useFavoriteTokens() {
  return usePersistedSet(FAV_KEY);
}

export function useFavoriteChains() {
  return usePersistedSet(FAV_CHAIN_KEY);
}

/** Most-recently selected tokens, newest first. */
export function useRecentTokens() {
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    setKeys(readList(RECENT_KEY));
  }, []);

  const record = useCallback((key: string) => {
    setKeys((prev) => {
      const next = [key, ...prev.filter((k) => k !== key)].slice(0, RECENT_LIMIT);
      writeList(RECENT_KEY, next);
      return next;
    });
  }, []);

  return { keys, record };
}

/** Resolve stored keys back to tokens, dropping any no longer in the registry. */
export function tokensByKeys(universe: SwapToken[], keys: string[]): SwapToken[] {
  const index = new Map(universe.map((t) => [t.key, t]));
  return keys.map((k) => index.get(k)).filter((t): t is SwapToken => t !== undefined);
}

/* ------------------------------------------------------------------ colour */

/**
 * A deterministic accent per chain, so a chain looks the same everywhere.
 *
 * Hashing the id keeps this stable without bundling per-chain artwork that
 * would go stale as App Kit adds networks.
 */
export function chainAccent(chain: ArcChain): string {
  let hash = 0;
  for (let i = 0; i < chain.id.length; i += 1) {
    hash = (hash * 31 + chain.id.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 70% 55%)`;
}

/** Token accent: stablecoins keep brand-ish hues, native follows its chain. */
export function tokenAccent(token: SwapToken): string {
  if (token.alias === 'USDC') return '#2775ca';
  if (token.alias === 'EURC') return '#1f7a5c';
  if (token.alias === 'USDT') return '#26a17b';
  return chainAccent(token.chain);
}

/** Shorten an address for display without losing its identifying ends. */
export function shortAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

/* ----------------------------------------------------------------- helpers */

/** Find a token by chain and alias, used to keep selection valid across mode changes. */
export function findToken(
  universe: SwapToken[],
  chainId: string,
  alias: TokenAlias
): SwapToken | undefined {
  return universe.find((t) => t.chain.id === chainId && t.alias === alias);
}

/**
 * A sensible default pair for a chain: its two most liquid stablecoins,
 * falling back to native when a chain carries only one.
 */
export function defaultPair(chain: ArcChain): { sell?: SwapToken; buy?: SwapToken } {
  const tokens = tokensForChain(chain);
  const stables = tokens.filter((t) => !t.isNative);
  return {
    sell: stables[0] ?? tokens[0],
    buy: stables[1] ?? tokens.find((t) => t !== (stables[0] ?? tokens[0])),
  };
}

/** Group a token list by chain, preserving the registry's chain order. */
export function groupByChain(tokens: SwapToken[]): Array<{ chain: ArcChain; tokens: SwapToken[] }> {
  const groups = new Map<string, { chain: ArcChain; tokens: SwapToken[] }>();
  for (const token of tokens) {
    const existing = groups.get(token.chain.id);
    if (existing) existing.tokens.push(token);
    else groups.set(token.chain.id, { chain: token.chain, tokens: [token] });
  }
  return [...groups.values()];
}

/** The universe for the current mode, memoised. */
export function useTokenUniverse(isTestnet: boolean): SwapToken[] {
  return useMemo(() => buildTokenUniverse(isTestnet), [isTestnet]);
}
