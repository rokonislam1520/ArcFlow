'use client';
/**
 * Token selector, following the reference layout: a chain rail beside a
 * searchable token list.
 *
 * Chain rail filters the list instantly. Token search matches symbol, name,
 * chain, or a pasted contract address. Favorites and recents are the user's
 * own, persisted locally. Balances and USD values are read from chain RPCs via
 * `usePortfolio` — nothing here is placeholder data.
 *
 * One deliberate honesty: the list is the routable universe, which App Kit
 * defines as USDC, EURC, USDT and the native asset per chain. There is no
 * token-list endpoint to enumerate more, and `swap()` accepts only those
 * aliases, so a pasted address that is not one of them is reported as
 * unroutable rather than being shown as if it could be traded.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type Address } from 'viem';
import { useNetworkMode } from '@/lib/network';
import { useWallet } from '@/lib/WalletProvider';
import { type ArcChain } from '@/lib/chains';
import { usePortfolio, formatUSD } from '@/lib/portfolio';
import { ChainMark, TokenMark } from '@/components/BrandMark';
import { chainDisplayName } from '@/lib/chainBrand';
import {
  type SwapToken,
  useTokenUniverse,
  swapChains,
  searchChains,
  searchTokens,
  useFavoriteTokens,
  useFavoriteChains,
  useRecentTokens,
  tokensByKeys,
  groupByChain,
  shortAddress,
  isAddressQuery,
} from '@/lib/swapTokens';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: SwapToken) => void;
  /** The other side of the pair, excluded so a token cannot be swapped for itself. */
  exclude?: SwapToken;
  title?: string;
}

/** A balance row as shown in the list. */
type BalanceCell = { amount: string; valueUSD: number | null };

/**
 * Mounts the body only while open.
 *
 * The body reads balances across every swap-capable chain, so keeping it
 * mounted while closed would poll RPCs for a dialog nobody is looking at.
 */
export function TokenSelector(props: Props) {
  if (!props.isOpen) return null;
  return <TokenSelectorBody {...props} />;
}

function TokenSelectorBody({ onClose, onSelect, exclude, title }: Props) {
  const { isTestnet } = useNetworkMode();
  const { address } = useWallet();
  const universe = useTokenUniverse(isTestnet);
  const chains = useMemo(() => swapChains(isTestnet), [isTestnet]);

  const [chainFilter, setChainFilter] = useState<ArcChain | null>(null);
  const [chainQuery, setChainQuery] = useState('');
  const [tokenQuery, setTokenQuery] = useState('');

  const favorites = useFavoriteTokens();
  const favoriteChains = useFavoriteChains();
  const recents = useRecentTokens();

  const portfolio = usePortfolio(address as Address | null, isTestnet);

  // Escape closes, which is what a dialog is expected to do.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visibleChains = useMemo(() => searchChains(chains, chainQuery), [chains, chainQuery]);

  const filteredTokens = useMemo(() => {
    const scoped = chainFilter
      ? universe.filter((t) => t.chain.id === chainFilter.id)
      : universe;
    return searchTokens(scoped, tokenQuery).filter((t) => t.key !== exclude?.key);
  }, [universe, chainFilter, tokenQuery, exclude]);

  const favoriteTokenList = useMemo(
    () => tokensByKeys(universe, favorites.keys).filter((t) => t.key !== exclude?.key),
    [universe, favorites.keys, exclude]
  );

  const recentTokenList = useMemo(
    () => tokensByKeys(universe, recents.keys).filter((t) => t.key !== exclude?.key),
    [universe, recents.keys, exclude]
  );

  /**
   * Balances keyed by chain and *display symbol*.
   *
   * Symbol rather than the token's `key`: a native token's key carries the
   * routing alias 'NATIVE', while the balance row carries the chain's real
   * ticker (ETH, POL, SOL). Keying on the alias hides every native balance.
   */
  const balanceIndex = useMemo(() => {
    const map = new Map<string, BalanceCell>();
    for (const c of portfolio.chains) {
      for (const h of c.holdings) {
        map.set(`${c.chain.id}:${h.symbol}`, { amount: h.amount, valueUSD: h.valueUSD });
      }
    }
    return map;
  }, [portfolio.chains]);

  const balanceOf = useCallback(
    (token: SwapToken) => balanceIndex.get(`${token.chain.id}:${token.symbol}`),
    [balanceIndex]
  );

  const handleSelect = useCallback(
    (token: SwapToken) => {
      recents.record(token.key);
      onSelect(token);
      onClose();
    },
    [onSelect, onClose, recents]
  );

  const starredChains = visibleChains.filter((c) => favoriteChains.has(c.id));
  const otherChains = visibleChains.filter((c) => !favoriteChains.has(c.id));

  /** Row renderer shared by every token section. */
  const row = (t: SwapToken) => (
    <TokenRow
      key={t.key}
      token={t}
      balance={balanceOf(t)}
      starred={favorites.has(t.key)}
      onSelect={() => handleSelect(t)}
      onToggleStar={() => favorites.toggle(t.key)}
    />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm animate-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Select token'}
    >
      <div
        className="w-full max-w-4xl h-[88vh] sm:h-[600px] bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
            {title ?? 'Select Token'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Chain rail beside the token list on desktop, stacked on mobile. */}
        <div className="flex-1 flex flex-col sm:flex-row min-h-0">
          <div className="sm:w-60 shrink-0 border-b sm:border-b-0 sm:border-r border-white/10 flex flex-col min-h-0">
            <div className="p-3 sm:p-4 sm:border-b border-white/10 shrink-0">
              <SearchInput
                value={chainQuery}
                onChange={setChainQuery}
                placeholder="Search chains"
              />
            </div>

            {/*
              Starred chains are pinned outside the scroll container, so they
              stay put while the A–Z list scrolls beneath them. Putting them
              inside with `position: sticky` would let a long starred list crowd
              out the list it is meant to sit above.
            */}
            <div className="shrink-0 px-3 sm:px-2 pb-2 sm:pb-0">
              <div className="flex sm:block gap-1.5 sm:gap-0 sm:space-y-0.5 overflow-x-auto sm:overflow-visible">
                <button
                  onClick={() => setChainFilter(null)}
                  className={`shrink-0 sm:w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-sm whitespace-nowrap transition-colors ${
                    chainFilter === null
                      ? 'bg-arc-500/15 text-arc-300'
                      : 'hover:bg-white/[0.06] text-slate-300'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-gradient-to-br from-arc-500 to-mint-500 flex items-center justify-center text-[10px] font-bold shrink-0">
                    ∞
                  </span>
                  <span className="truncate font-medium">All Chains</span>
                </button>

                {starredChains.length > 0 && (
                  <>
                    <RailHeading>Starred Chains</RailHeading>
                    {starredChains.map((c) => (
                      <ChainRow
                        key={c.id}
                        chain={c}
                        active={chainFilter?.id === c.id}
                        starred
                        onSelect={() => setChainFilter(c)}
                        onToggleStar={() => favoriteChains.toggle(c.id)}
                      />
                    ))}
                  </>
                )}
              </div>

              {starredChains.length > 0 && (
                <div className="hidden sm:block mx-2 mt-2 border-t border-white/10" />
              )}
            </div>

            {/* Horizontal strip on mobile, scrolling list on desktop. */}
            <div className="flex sm:block gap-1.5 sm:gap-0 sm:space-y-0.5 overflow-x-auto sm:overflow-y-auto sm:flex-1 px-3 sm:px-2 pb-3 sm:pb-3 sm:pt-2 scroll-smooth">
              <RailHeading>{chainQuery ? 'Results' : 'All Chains'}</RailHeading>
              {otherChains.map((c) => (
                <ChainRow
                  key={c.id}
                  chain={c}
                  active={chainFilter?.id === c.id}
                  starred={false}
                  onSelect={() => setChainFilter(c)}
                  onToggleStar={() => favoriteChains.toggle(c.id)}
                />
              ))}

              {visibleChains.length === 0 && (
                <p className="px-3 py-6 text-xs text-slate-500 whitespace-nowrap">
                  No chain matches that search.
                </p>
              )}

              {otherChains.length === 0 && visibleChains.length > 0 && (
                <p className="hidden sm:block px-3 py-4 text-xs text-slate-600">
                  Every chain is starred.
                </p>
              )}
            </div>
          </div>

          {/* Token list */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="p-3 sm:p-4 border-b border-white/10 shrink-0">
              <SearchInput
                value={tokenQuery}
                onChange={setTokenQuery}
                placeholder="Search for a token or paste address"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto px-2 sm:px-4 py-3">
              {!tokenQuery && favoriteTokenList.length > 0 && (
                <Section title="Favorites">{favoriteTokenList.map(row)}</Section>
              )}

              {!tokenQuery && recentTokenList.length > 0 && (
                <Section title="Recent">{recentTokenList.map(row)}</Section>
              )}

              {filteredTokens.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  {isAddressQuery(tokenQuery) ? (
                    <>
                      <p className="text-sm text-slate-300 mb-1.5">
                        No routable token at that address.
                      </p>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                        App Kit routes swaps for USDC, EURC, USDT and native assets. An
                        arbitrary ERC-20 cannot be quoted here, so it is not offered.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">
                      Nothing matches that search on{' '}
                      {chainFilter ? chainDisplayName(chainFilter) : 'any chain'}.
                    </p>
                  )}
                </div>
              ) : tokenQuery || chainFilter ? (
                <Section
                  title={
                    tokenQuery
                      ? `${filteredTokens.length} result${filteredTokens.length === 1 ? '' : 's'}`
                      : (chainFilter ? chainDisplayName(chainFilter) : '')
                  }
                >
                  {filteredTokens.map(row)}
                </Section>
              ) : (
                groupByChain(filteredTokens).map((group) => (
                  <Section key={group.chain.id} title={chainDisplayName(group.chain)}>
                    {group.tokens.map(row)}
                  </Section>
                ))
              )}
            </div>

            {portfolio.partial && (
              <p className="px-4 py-2 text-[11px] text-amber-300/80 border-t border-white/10 shrink-0">
                Some chains could not be reached, so a few balances are missing rather than
                zero.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- focus belongs in the search field of a search dialog
        autoFocus={autoFocus}
        className="w-full pl-9 pr-3 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-sm outline-none focus:border-arc-500/40 focus:bg-white/[0.08] transition-colors placeholder:text-slate-500"
      />
    </div>
  );
}

function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden sm:block px-3 pt-4 pb-1.5 text-[10px] uppercase tracking-wider text-slate-600 font-semibold">
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="px-2 pb-1.5 text-[11px] uppercase tracking-wider text-slate-600 font-semibold">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/**
 * A row is a flex container holding two sibling buttons, not a button inside a
 * button: nested interactive elements are invalid HTML and swallow clicks.
 */
function ChainRow({
  chain,
  active,
  starred,
  onSelect,
  onToggleStar,
}: {
  chain: ArcChain;
  active: boolean;
  starred: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
}) {
  const name = chainDisplayName(chain);

  return (
    <div
      className={`shrink-0 sm:w-full flex items-center rounded-xl group transition-colors ${
        active ? 'bg-arc-500/15' : 'hover:bg-white/[0.06]'
      }`}
    >
      <button
        onClick={onSelect}
        className={`flex-1 min-w-0 flex items-center gap-2.5 px-2 py-2 text-sm whitespace-nowrap ${
          active ? 'text-arc-300' : 'text-slate-300'
        }`}
      >
        <ChainMark chain={chain} size={24} />
        <span className="truncate font-medium">{name}</span>
      </button>
      <StarButton starred={starred} onClick={onToggleStar} label={name} />
    </div>
  );
}

function TokenRow({
  token,
  balance,
  starred,
  onSelect,
  onToggleStar,
}: {
  token: SwapToken;
  balance?: BalanceCell;
  starred: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
}) {
  return (
    <div className="flex items-center rounded-xl hover:bg-white/[0.06] transition-colors group">
      <button
        onClick={onSelect}
        className="flex-1 min-w-0 flex items-center gap-3 pl-2 pr-1 py-2.5 text-left"
      >
        {/* Real token logo, badged with its chain's real logo. */}
        <TokenMark token={token} size={40} />

        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate">{token.symbol}</span>
            {/* Registry tokens are the canonical issuances App Kit routes. */}
            {!token.isNative && (
              <svg
                className="w-3.5 h-3.5 text-arc-400 shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-label="In the App Kit registry"
                role="img"
              >
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </span>
          <span className="block text-[11px] text-slate-500 truncate">
            {token.name} · {chainDisplayName(token.chain)}
            {token.address && (
              <span className="ml-1.5 font-mono text-slate-600">
                {shortAddress(token.address, 6, 4)}
              </span>
            )}
          </span>
        </span>

        {/* Balance, or an explicit dash when this wallet holds none. */}
        <span className="text-right shrink-0 pl-2">
          {balance ? (
            <>
              <span className="block text-sm tabular-nums">{balance.amount}</span>
              <span className="block text-[11px] text-slate-500 tabular-nums">
                {balance.valueUSD === null ? 'Unpriced' : formatUSD(balance.valueUSD)}
              </span>
            </>
          ) : (
            <span className="text-xs text-slate-600">—</span>
          )}
        </span>
      </button>
      <StarButton starred={starred} onClick={onToggleStar} label={token.symbol} />
    </div>
  );
}

/** Always visible once starred, so a favorite is not hidden until hover. */
function StarButton({
  starred,
  onClick,
  label,
}: {
  starred: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={starred ? `Unstar ${label}` : `Star ${label}`}
      aria-label={starred ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
      aria-pressed={starred}
      className={`px-2 py-2 mr-1 rounded-lg transition-all ${
        starred
          ? 'text-amber-400'
          : 'text-slate-600 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-amber-400'
      }`}
    >
      <svg
        className="w-4 h-4"
        fill={starred ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    </button>
  );
}
