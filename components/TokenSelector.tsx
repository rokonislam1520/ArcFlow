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
 * Two limits, stated because they shape the UI:
 *
 * The *browsable* list is what App Kit can enumerate — USDC, EURC, USDT and the
 * native asset per chain. There is no token-list endpoint, and no provider here
 * can list the arbitrary ERC-20s a wallet holds, so "Your Tokens" covers those
 * assets and not every last airdrop.
 *
 * Trading is not limited that way. `swap()` accepts a raw contract address, so
 * pasting one resolves it against the chain itself (`lib/tokenResolve.ts`) and
 * offers it for selection — marked unverified, since it came from a contract
 * rather than from the registry. An address that no chain recognises is
 * reported as not found instead of being listed as tradable.
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
  tokensForChain,
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
import { useResolvedToken } from '@/lib/tokenResolve';



interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: SwapToken) => void;
  /** The other side of the pair, excluded so a token cannot be swapped for itself. */
  exclude?: SwapToken;
  title?: string;
  /**
   * Restrict the picker to one chain, and hide the chain rail with it.
   *
   * For a same-chain operation such as Send, offering the full cross-chain
   * universe would let someone pick a token on a chain their wallet is not on —
   * a selection that could never be submitted. Locking the scope means every
   * token on screen is one the current transaction can actually use.
   */
  lockedChain?: ArcChain;
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

function TokenSelectorBody({ onClose, onSelect, exclude, title, lockedChain }: Props) {
  const { isTestnet } = useNetworkMode();
  const { address } = useWallet();
  const crossChainUniverse = useTokenUniverse(isTestnet);
  const chains = useMemo(() => swapChains(isTestnet), [isTestnet]);

  /**
   * When locked, the universe comes from the chain itself rather than from the
   * swap-capable set: a chain can be sendable without being swappable, and
   * scoping to `useTokenUniverse` would wrongly show it as having no tokens.
   */
  const universe = useMemo(
    () => (lockedChain ? tokensForChain(lockedChain) : crossChainUniverse),
    [lockedChain, crossChainUniverse]
  );

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

  /*
   * Hold the page still while the dialog is up.
   *
   * The token list scrolls internally, and once it hits its end the browser
   * hands the gesture to the page behind — so the swap form drifts under a modal
   * the user is only scrolling. The previous value is restored rather than being
   * cleared to '', so a page that sets its own overflow keeps it afterwards.
   */
  useEffect(() => {
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, []);


  const visibleChains = useMemo(() => searchChains(chains, chainQuery), [chains, chainQuery]);

  const filteredTokens = useMemo(() => {
    const scoped = chainFilter
      ? universe.filter((t) => t.chain.id === chainFilter.id)
      : universe;
    return searchTokens(scoped, tokenQuery).filter((t) => t.key !== exclude?.key);
  }, [universe, chainFilter, tokenQuery, exclude]);

  /**
   * Chains a pasted address is looked up on.
   *
   * Narrowed to the locked or filtered chain when there is one, so the user gets
   * one answer for the chain they are actually looking at rather than the same
   * token found on eight networks.
   */
  const resolveChains = useMemo(() => {
    if (lockedChain) return [lockedChain];
    if (chainFilter) return [chainFilter];
    return chains;
  }, [lockedChain, chainFilter, chains]);

  /**
   * The pasted address, read from the chains themselves.
   *
   * Only meaningful when the catalogue has nothing to offer, but the hook runs
   * regardless and returns an inert state for non-address input, which keeps it
   * out of the conditional-hook trap.
   */
  const resolved = useResolvedToken(tokenQuery, resolveChains, address as Address | null);

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

  /**
   * Tokens this wallet actually holds, richest first.
   *
   * Surfaced above the full catalogue because holding a token is the strongest
   * signal that it is the one being reached for — otherwise picking the asset
   * you own means scrolling past every chain that offers it. Unpriced holdings
   * sort last but are kept: a balance with no quote is still a balance, and
   * dropping it would hide funds the user has.
   *
   * Derived from the same `balanceIndex` the rows read, so a token can never
   * appear here with a balance the row below it disagrees about.
   */
  const heldTokens = useMemo(() => {
    if (tokenQuery || chainFilter) return [];
    return universe
      .filter((t) => t.key !== exclude?.key && balanceIndex.has(`${t.chain.id}:${t.symbol}`))
      .sort((a, b) => {
        const av = balanceIndex.get(`${a.chain.id}:${a.symbol}`)?.valueUSD;
        const bv = balanceIndex.get(`${b.chain.id}:${b.symbol}`)?.valueUSD;
        return (bv ?? -1) - (av ?? -1);
      });
  }, [universe, exclude, balanceIndex, tokenQuery, chainFilter]);

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
      // A lighter scrim and no blur on the backdrop: the page behind should stay
      // legible around a modal this size, and heavy blurring made the app feel
      // like it had navigated away rather than opened a picker over it.
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 animate-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Select token'}
    >
      <div
        /*
         * Floats above the page on desktop, and rises from the bottom edge on
         * mobile, where a sheet is the native-feeling shape for a picker.
         * Narrower when locked: without the chain rail, the full width would
         * leave a single short list stranded in a lot of empty space.
         *
         * Sized by `max-h` against a natural height rather than a fixed
         * `h-[600px]`, so a short list (one chain, three tokens) produces a
         * short modal instead of a tall box padded with empty space, while a
         * long one stops at 78vh and scrolls internally. `min-h` keeps it from
         * collapsing to something cramped while balances are still arriving.
         */
        className={`w-full bg-surface-card border-2 border-hairline

          rounded-t-3xl sm:rounded-3xl shadow-float flex flex-col overflow-hidden animate-scale-in
          max-h-[88vh] sm:max-h-[78vh] sm:min-h-[420px]
          ${lockedChain ? 'max-w-md' : 'max-w-[820px]'}`}

        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-hairline shrink-0">
          <h2 className="text-base font-semibold tracking-tight truncate">
            {title ?? 'Select Token'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-surface-hover/[0.06]
              active:scale-95 flex items-center justify-center transition-all duration-200"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Chain rail beside the token list on desktop, stacked on mobile.
            Omitted entirely when locked to one chain, where it would offer a
            filter with exactly one valid answer. */}
        <div className="flex-1 flex flex-col sm:flex-row min-h-0">
          {!lockedChain && (
          <div className="sm:w-[228px] shrink-0 border-b sm:border-b-0 sm:border-r border-hairline flex flex-col min-h-0">
            <div className="p-3 shrink-0">
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
                  className={`shrink-0 sm:w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-sm whitespace-nowrap
                    transition-colors duration-200 ${
                    chainFilter === null
                      ? 'bg-arc-500/15 text-accent-text ring-1 ring-inset ring-arc-500/25'
                      : 'hover:bg-surface-hover/[0.06] text-ink-secondary'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-accent border-2 border-hairline text-accent-contrast flex items-center justify-center text-[10px] font-bold shrink-0">

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
                <div className="hidden sm:block mx-2 mt-2 border-t border-hairline" />
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
                <p className="px-3 py-6 text-xs text-ink-muted whitespace-nowrap">
                  No chain matches that search.
                </p>
              )}

              {otherChains.length === 0 && visibleChains.length > 0 && (
                <p className="hidden sm:block px-3 py-4 text-xs text-ink-muted">
                  Every chain is starred.
                </p>
              )}
            </div>
          </div>
          )}

          {/* Token list */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="p-3 shrink-0">
              <SearchInput
                value={tokenQuery}
                onChange={setTokenQuery}
                placeholder={
                  lockedChain
                    ? `Search tokens on ${chainDisplayName(lockedChain)}`
                    : 'Search for a token or paste address'
                }
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto px-2 sm:px-3 pb-3">
              {/*
                Held tokens lead, since the asset you own is the likeliest pick;
                favourites and recents follow as deliberate choices.

                Grouped by chain, with the chain named in the heading, because
                the same ticker exists on many networks — a flat "Your Tokens"
                list showed USDC four times over with nothing to tell them
                apart but a logo badge. Chains are ordered by the value held on
                them, so the account's largest position still comes first.
              */}
              {heldTokens.length > 0 &&
                groupByChain(heldTokens).map((group) => (
                  <Section
                    key={`held-${group.chain.id}`}
                    title={`Your Tokens · ${chainDisplayName(group.chain)}`}
                  >
                    {group.tokens.map(row)}
                  </Section>
                ))}


              {!tokenQuery && favoriteTokenList.length > 0 && (
                <Section title="Favorites">{favoriteTokenList.map(row)}</Section>
              )}

              {!tokenQuery && recentTokenList.length > 0 && (
                <Section title="Recent">{recentTokenList.map(row)}</Section>
              )}

              {/*
                A pasted address that the catalogue does not contain: the chains
                are asked directly, and whatever they confirm is offered here.
              */}
              {resolved.found.length > 0 && (
                <Section title="Found on chain">
                  {resolved.found.map(({ token, amount }) => (
                    <TokenRow
                      key={token.key}
                      token={token}
                      balance={amount === null ? undefined : { amount, valueUSD: null }}
                      starred={favorites.has(token.key)}
                      onSelect={() => handleSelect(token)}
                      onToggleStar={() => favorites.toggle(token.key)}
                    />
                  ))}
                </Section>
              )}

              {filteredTokens.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  {resolved.loading ? (
                    <p className="text-sm text-ink-secondary">
                      Reading that address on{' '}
                      {resolveChains.length === 1
                        ? chainDisplayName(resolveChains[0])
                        : `${resolveChains.length} chains`}
                      …
                    </p>
                  ) : resolved.found.length > 0 ? (
                    // The result is rendered above; this branch only exists
                    // because the catalogue itself matched nothing, which is not
                    // a failure once the chain has answered.
                    null
                  ) : isAddressQuery(tokenQuery) ? (
                    <>
                      <p className="text-sm text-ink-secondary mb-1.5">
                        {resolved.searched
                          ? 'No ERC-20 token responded at that address.'
                          : 'Paste the full address to look it up.'}
                      </p>
                      <p className="text-xs text-ink-muted max-w-sm mx-auto leading-relaxed">
                        {resolved.searched
                          ? `Nothing on ${
                              resolveChains.length === 1
                                ? chainDisplayName(resolveChains[0])
                                : 'the chains searched'
                            } reported a symbol and decimals there, so there is no token to offer. Check the address and the chain.`
                          : 'A partial address cannot be read on-chain. Once the full address is in, it is checked against each chain directly.'}
                      </p>
                    </>
                  ) : (

                    <p className="text-sm text-ink-secondary">
                      Nothing matches that search on{' '}
                      {lockedChain
                        ? chainDisplayName(lockedChain)
                        : chainFilter
                          ? chainDisplayName(chainFilter)
                          : 'any chain'}
                      .
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
              <p className="px-4 py-2 text-[11px] text-warning/80 border-t border-hairline shrink-0">
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
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none"
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
        className="w-full pl-9 pr-3 py-2.5 bg-black/25 border border-hairline rounded-xl text-sm text-ink-primary outline-none
          hover:border-hairline
          focus:border-arc-500/50 focus:bg-black/35 focus:ring-[3px] focus:ring-arc-500/[0.12]
          transition-all duration-200 placeholder:text-ink-muted"
      />
    </div>
  );
}

function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden sm:block px-3 pt-4 pb-1.5 text-[10px] uppercase tracking-wider text-ink-muted font-semibold">
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      {/*
        Sticky, so the group a row belongs to stays named while scrolling. With
        a cross-chain list the chain heading *is* the row's context — once it
        scrolls away, "USDC" alone does not say which network it is on.
      */}
      <div className="sticky top-0 z-10 px-2 py-1.5 bg-surface-card label-mono">

        {title}
      </div>
      <div className="space-y-px">{children}</div>
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
      className={`shrink-0 sm:w-full flex items-center rounded-xl group transition-colors duration-200 ${
        // The accent ring marks the active filter unambiguously; a tint alone
        // is easy to miss against a list of hovered rows.
        active ? 'bg-arc-500/15 ring-1 ring-inset ring-arc-500/25' : 'hover:bg-surface-hover/[0.06]'
      }`}
    >
      <button
        onClick={onSelect}
        className={`flex-1 min-w-0 flex items-center gap-2.5 px-2 py-2 text-sm whitespace-nowrap ${
          active ? 'text-accent-text' : 'text-ink-secondary'
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
    <div className="flex items-center rounded-xl hover:bg-surface-hover/[0.06] active:bg-surface-input transition-colors duration-200 group">
      <button
        onClick={onSelect}
        className="flex-1 min-w-0 flex items-center gap-2.5 pl-2 pr-1 py-2 text-left"
      >
        {/* Real token logo, badged with its chain's real logo. */}
        <TokenMark token={token} size={32} />

        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-semibold truncate text-ink-primary">{token.symbol}</span>
            {/*
              The tick means "in the App Kit registry", so a token read from a
              contract must not carry it — it would vouch for an asset nobody
              vouched for. Those get the warning mark instead.
            */}
            {token.unverified ? (
              <svg
                className="w-3.5 h-3.5 text-warning shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-label="Read from the contract, not in the registry — verify before trading"
                role="img"
              >
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              !token.isNative && (
                <svg
                  className="w-3.5 h-3.5 text-accent-text shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-label="In the App Kit registry"
                  role="img"
                >
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )
            )}

          </span>
          <span className="block text-[11px] text-ink-muted truncate">
            {token.name} · {chainDisplayName(token.chain)}
            {token.address && (
              <span className="ml-1.5 font-mono text-ink-muted">
                {shortAddress(token.address, 6, 4)}
              </span>
            )}
          </span>
        </span>

        {/*
          Balance, or an explicit dash when this wallet holds none — a blank
          would read as "not loaded yet" rather than "you have none of this".
          `max-w` with truncation because a raw on-chain amount can run to
          eighteen decimals and would otherwise push the symbol off the row.
        */}
        <span className="text-right shrink-0 pl-2 max-w-[42%]">
          {balance ? (
            <>
              <span className="block text-[13px] tabular-nums truncate">{balance.amount}</span>
              {/* Only when a real quote exists; never a fabricated price. */}
              <span className="block text-[11px] text-ink-muted tabular-nums">
                {balance.valueUSD === null ? 'Unpriced' : formatUSD(balance.valueUSD)}
              </span>
            </>
          ) : (
            <span className="text-xs text-ink-muted">—</span>
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
          ? 'text-warning'
          : 'text-ink-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-warning'
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
