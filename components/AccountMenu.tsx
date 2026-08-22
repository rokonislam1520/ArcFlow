'use client';
/**
 * Account menu opened from the connected address.
 *
 * Everything about "who am I and what am I connected to" lives here: the
 * address, the chain, the mainnet/testnet mode, and the way out. Previously
 * the address was a link to /profile and the chain controls were scattered
 * across the header, so answering "which network am I on?" meant reading three
 * separate widgets that each showed part of the answer.
 *
 * Deliberately *not* a profile shortcut. Clicking your own address to edit a
 * bio is a surprising jump; the address is about the connection, and profile
 * settings belong in navigation with the rest of the app's pages.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import { getSelectableChains, type ArcChain } from '@/lib/chains';
import { chainDisplayName } from '@/lib/chainBrand';
import { formatUSD, usePortfolio } from '@/lib/portfolio';
import { useModeSwitch } from '@/lib/useModeSwitch';
import { useWallet } from '@/lib/WalletProvider';
import { useSession } from '@/lib/SessionProvider';
import { useProfile } from '@/lib/ProfileProvider';
import { shortAddress } from '@/lib/profile';
import { ChainMark } from '@/components/BrandMark';

/** How long the "Copied" confirmation stays up, in ms. */
const COPY_FEEDBACK_MS = 1600;

/**
 * How often the header re-reads the portfolio.
 *
 * Slower than the /portfolio page's 30s. This total is ambient — it sits in the
 * chrome of every screen, so its poll is a cost the whole app pays, and a
 * balance that is a minute stale is not misleading in the way a stale quote
 * would be. The value still refreshes immediately on a wallet or network
 * change, because those remount the query rather than wait for the timer.
 */
const HEADER_POLL_MS = 60_000;

export function AccountMenu() {
  const {
    address,
    chain,
    chainId,
    wallet,
    isUnsupportedChain,
    disconnect,
    switchChain,
    error: walletError,
  } = useWallet();
  const session = useSession();
  const profile = useProfile();
  // A mode change is one operation: it flips the mode, moves the wallet to that
  // mode's default chain, and refreshes every chain-dependent screen.
  const { isTestnet, ready, switching: switchingMode, switchMode } = useModeSwitch();

  /*
   * The same hook /portfolio uses, and its `totalUSD` is taken as given rather
   * than recomputed here. That total is already sum(balance × price) over the
   * supported chains, and it already drops assets with no reliable price — so
   * re-deriving it in the header would be a second implementation free to
   * disagree with the portfolio page about the user's own net worth.
   *
   * Keyed on address and mode, so a wallet or mainnet/testnet change refetches
   * on its own; no extra wiring, and no chance of showing one wallet's total
   * next to another's address.
   */
  const portfolio = usePortfolio(address as Address | null, isTestnet, {
    pollMs: HEADER_POLL_MS,
  });

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'root' | 'networks'>('root');
  const [copied, setCopied] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setView('root');
  }, []);

  // Outside click and Escape both dismiss. A menu that traps you until you
  // find the exact toggle again is a menu people learn to avoid.
  useEffect(() => {
    if (!open) return;

    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Clear the copy confirmation on a timer, and cancel it if the component
  // goes away first so it cannot set state after unmount.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!address) return null;

  const displayName = profile.fields.displayName || profile.fields.username || null;

  /*
   * An em dash until the first result lands, never a $0.00 that later jumps to
   * a real figure — a total is the one number where a wrong-then-corrected
   * value is worse than an obvious absence. `updatedAt` marks a completed
   * fetch, so this is false only before the first one, not during a refresh:
   * a poll should not blank a figure the user is already reading.
   *
   * Once a fetch has completed, 0 is a real answer and is shown as $0.00.
   */
  const totalPending = portfolio.updatedAt === null;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      // Clipboard access can be denied or unavailable over plain HTTP. Select
      // the text instead so the address can still be copied by hand, rather
      // than showing a "Copied" that did not happen.
      const node = document.getElementById('account-address-full');
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  };

  const handleSwitchChain = async (target: ArcChain) => {
    setSwitching(target.id);
    // The wallet is the authority on the active chain: WalletProvider updates
    // from the provider's chainChanged event, so the UI reflects the switch
    // only once it truly happened, and a declined prompt leaves it accurate.
    await switchChain(target);
    setSwitching(null);
    setView('root');
  };

  const handleDisconnect = () => {
    // End the server session too. Leaving it alive after disconnect would keep
    // the address authenticated behind the user's back.
    if (session.status === 'signed-in') void session.signOut();
    disconnect();
    close();
  };

  const chains = getSelectableChains(isTestnet);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 pl-2 pr-2.5 py-1 rounded-xl border border-hairline bg-surface-input hover:bg-surface-hover/[0.06] transition-colors"
      >
        <Avatar src={profile.fields.avatar} fallback={displayName ?? address} />
        <span className="hidden md:flex flex-col leading-tight min-w-0 text-left">
          {displayName && (
            <span className="text-xs font-medium truncate max-w-[110px]">{displayName}</span>
          )}
          <span className="font-mono text-[11px] text-ink-muted truncate">
            {shortAddress(address)}
          </span>
        </span>

        {/*
         * The total, weighted above the address on purpose: the address is an
         * identifier you check occasionally, the balance is the number you came
         * to read. A rule separates them so two unrelated values do not read as
         * one string.
         *
         * `tabular-nums` holds the pill's width steady as the figure changes,
         * which matters here because this sits in the header of every page —
         * digits of differing widths would nudge the whole row on each poll.
         * It stays visible at all breakpoints while the address collapses below
         * md, since dropping the more useful of the two on a phone would be the
         * wrong way round.
         */}
        <span className="flex items-center gap-2 min-w-0" aria-live="polite" aria-atomic="true">
          <span className="w-px h-4 bg-hairline shrink-0" aria-hidden />
          {totalPending ? (
            <span className="text-sm font-bold text-ink-muted tabular-nums" title="Loading balances">
              $—
            </span>
          ) : (
            <span
              className="text-sm font-bold tabular-nums truncate"
              // Only surfaced when a chain actually failed, so the tooltip is
              // absent in the normal case rather than crying wolf on every load.
              title={
                portfolio.partial
                  ? 'Some networks could not be read, so this total is understated'
                  : 'Total value of priced assets'
              }
            >
              {formatUSD(portfolio.totalUSD)}
            </span>
          )}
        </span>

        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-3.5 h-3.5 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[300px] glass p-0 z-50 overflow-hidden"
        >
          {view === 'root' ? (
            <>
              {/* Identity */}
              <div className="p-4 border-b border-hairline">
                <div className="flex items-center gap-3">
                  <Avatar src={profile.fields.avatar} fallback={displayName ?? address} size={40} />
                  <div className="min-w-0 flex-1">
                    {displayName && (
                      <div className="text-sm font-medium truncate">{displayName}</div>
                    )}
                    <div
                      id="account-address-full"
                      className="font-mono text-[11px] text-ink-secondary break-all"
                      title={address}
                    >
                      {shortAddress(address)}
                    </div>
                    {wallet && (
                      <div className="text-[11px] text-ink-muted mt-0.5 truncate">
                        {wallet.name}
                        {session.status === 'signed-in' && (
                          <span className="text-success"> · Verified</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => void copyAddress()}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs border border-hairline bg-surface-input hover:bg-surface-hover/[0.06] transition-colors"
                >
                  {copied ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-success" aria-hidden>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      <span className="text-success">Copied</span>
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden>
                        <rect x="9" y="9" width="12" height="12" rx="2" />
                        <path d="M5 15V5a2 2 0 012-2h10" />
                      </svg>
                      Copy address
                    </>
                  )}
                </button>
              </div>

              {/* Network */}
              <div className="p-2 border-b border-hairline">
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
                  Network
                </div>

                <button
                  onClick={() => setView('networks')}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-surface-hover/[0.06] transition-colors text-left"
                >
                  {chain ? (
                    <ChainMark chain={chain} size={22} />
                  ) : (
                    <span className="w-[22px] h-[22px] rounded-full bg-amber-500/20 border border-amber-500/40 shrink-0" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">
                      {/* Naming the unsupported network beats a generic "wrong
                          network": the user needs to know what to change from. */}
                      {isUnsupportedChain
                        ? `Unsupported network (${chainId})`
                        : chain
                          ? chainDisplayName(chain)
                          : 'No network'}
                    </span>
                    <span className="block text-[11px] text-ink-muted">
                      {chain && chain.isTestnet !== isTestnet
                        ? 'Different mode — switch to continue'
                        : 'Switch network'}
                    </span>
                  </span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-ink-muted" aria-hidden>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>

              {/* Mode. Kept distinct from the network list because it changes
                  what every chain in that list means: test funds or real ones. */}
              <div className="p-2 border-b border-hairline">
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
                  Mode
                </div>

                {/* One tap switches, in both directions. The mode is already
                    stated in the header badge and on every mainnet row, and the
                    wallet raises its own prompt for the chain change, so a
                    confirmation here was a third notice for a choice the user
                    can reverse with one more tap. */}
                <div
                  role="group"
                  aria-label="Network mode"
                  className="mx-2 mb-1 grid grid-cols-2 gap-1 p-1 rounded-lg bg-black/30 border border-hairline"
                >
                  <ModeOption
                    label="Testnet"
                    active={ready && isTestnet}
                    disabled={switchingMode}
                    onClick={() => void switchMode('testnet')}
                    activeClass="bg-sky-500/20 text-accent-text border-sky-500/40"
                  />
                  <ModeOption
                    label="Mainnet"
                    active={ready && !isTestnet}
                    disabled={switchingMode}
                    onClick={() => void switchMode('mainnet')}
                    activeClass="bg-emerald-500/20 text-success border-emerald-500/40"
                  />
                </div>
              </div>

              {/* Exit */}
              <div className="p-2">
                <button
                  onClick={handleDisconnect}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-danger hover:bg-red-500/10 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden>
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                  </svg>
                  Disconnect wallet
                </button>
              </div>

              {(walletError || session.error) && (
                <p className="px-4 pb-3 text-[11px] text-danger">
                  {walletError ?? session.error}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 p-3 border-b border-hairline">
                <button
                  onClick={() => setView('root')}
                  className="p-1 rounded-lg hover:bg-surface-hover/[0.06]"
                  aria-label="Back to account"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <span className="text-sm font-medium">Switch network</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-ink-muted">
                  {isTestnet ? 'Testnet' : 'Mainnet'}
                </span>
              </div>

              <div className="max-h-[320px] overflow-y-auto p-2">
                {chains.map((c) => {
                  const active = c.id === chain?.id;
                  const isEvm = c.type === 'evm';
                  return (
                    <button
                      key={c.id}
                      onClick={() => void handleSwitchChain(c)}
                      disabled={!isEvm || switching !== null}
                      className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-left transition-colors
                        disabled:opacity-40 disabled:cursor-not-allowed
                        ${active ? 'bg-surface-input' : 'hover:bg-surface-hover/[0.06]'}`}
                    >
                      <ChainMark chain={c} size={22} />
                      <span className="flex-1 min-w-0 truncate">{chainDisplayName(c)}</span>
                      {switching === c.id ? (
                        <span className="text-[10px] text-ink-secondary">Check wallet…</span>
                      ) : active ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-success" aria-hidden>
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : (
                        /* Solana needs a different adapter, so flag it rather
                           than offer a switch that cannot work. */
                        !isEvm && <span className="text-[10px] text-ink-muted">non-EVM</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ModeOption({
  label,
  active,
  disabled,
  onClick,
  activeClass,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  activeClass: string;
}) {
  return (
    <button
      onClick={onClick}
      // Disabled only while a switch is in flight, so a second tap cannot start
      // a competing chain request before the first has settled.
      disabled={disabled}
      aria-pressed={active}
      className={`px-2 py-1.5 rounded-md text-xs border transition-colors disabled:cursor-not-allowed ${
        active ? activeClass : 'border-transparent text-ink-secondary hover:text-ink-primary hover:bg-surface-hover/[0.06]'
      }`}
    >
      {label}
    </button>
  );
}

function Avatar({ src, fallback, size = 32 }: { src: string; fallback: string; size?: number }) {
  if (src) {
    // Profile avatars are user-supplied data URLs, so next/image's optimizer
    // has nothing to fetch or resize and would only add indirection.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        style={{ width: size, height: size }}
        className="rounded-full object-cover border border-hairline shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      className="rounded-full bg-accent text-accent-contrast border border-hairline flex items-center justify-center font-bold shrink-0"
    >

      {fallback.slice(2, 4).toUpperCase()}
    </div>
  );
}
