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
import { getEnvChains, hasArcSupport, type ArcChain } from '@/lib/chains';
import { chainDisplayName } from '@/lib/chainBrand';
import { useNetworkMode } from '@/lib/network';
import { useWallet } from '@/lib/WalletProvider';
import { useSession } from '@/lib/SessionProvider';
import { useProfile } from '@/lib/ProfileProvider';
import { shortAddress } from '@/lib/profile';
import { ChainMark } from '@/components/BrandMark';

/** How long the "Copied" confirmation stays up, in ms. */
const COPY_FEEDBACK_MS = 1600;

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
  const { isTestnet, setMode, ready } = useNetworkMode();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'root' | 'networks'>('root');
  const [copied, setCopied] = useState(false);
  const [confirmMainnet, setConfirmMainnet] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setView('root');
    setConfirmMainnet(false);
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

  const chains = getEnvChains(isTestnet);
  const arcMissingOnMainnet = !hasArcSupport(false);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2.5 pl-2 pr-2.5 py-1 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] transition-colors"
      >
        <Avatar src={profile.fields.avatar} fallback={displayName ?? address} />
        <span className="hidden md:flex flex-col leading-tight min-w-0 text-left">
          {displayName && (
            <span className="text-xs font-medium truncate max-w-[110px]">{displayName}</span>
          )}
          <span className="font-mono text-[11px] text-slate-500 truncate">
            {shortAddress(address)}
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-3.5 h-3.5 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
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
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <Avatar src={profile.fields.avatar} fallback={displayName ?? address} size={40} />
                  <div className="min-w-0 flex-1">
                    {displayName && (
                      <div className="text-sm font-medium truncate">{displayName}</div>
                    )}
                    <div
                      id="account-address-full"
                      className="font-mono text-[11px] text-slate-400 break-all"
                      title={address}
                    >
                      {shortAddress(address)}
                    </div>
                    {wallet && (
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {wallet.name}
                        {session.status === 'signed-in' && (
                          <span className="text-mint-400"> · Verified</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => void copyAddress()}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  {copied ? (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-mint-400" aria-hidden>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      <span className="text-mint-300">Copied</span>
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
              <div className="p-2 border-b border-white/10">
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  Network
                </div>

                <button
                  onClick={() => setView('networks')}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left"
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
                    <span className="block text-[11px] text-slate-500">
                      {chain && chain.isTestnet !== isTestnet
                        ? 'Different mode — switch to continue'
                        : 'Switch network'}
                    </span>
                  </span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-600" aria-hidden>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>

              {/* Mode. Kept distinct from the network list because it changes
                  what every chain in that list means: test funds or real ones. */}
              <div className="p-2 border-b border-white/10">
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  Mode
                </div>

                {confirmMainnet ? (
                  <div className="px-2 pb-1">
                    <p className="text-xs text-slate-300 mb-1">Switch to mainnet?</p>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Transactions will move real funds and cannot be reversed.
                    </p>
                    {/* Arc is testnet-only today, so say so rather than let the
                        flagship chain quietly vanish from every selector. */}
                    {arcMissingOnMainnet && (
                      <p className="text-[11px] text-amber-300/90 mb-2">
                        Arc has no mainnet yet and will not appear in mainnet mode.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setMode('mainnet');
                          setConfirmMainnet(false);
                        }}
                        className="flex-1 px-2 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30 text-[11px]"
                      >
                        Use mainnet
                      </button>
                      <button
                        onClick={() => setConfirmMainnet(false)}
                        className="flex-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[11px]"
                      >
                        Stay on testnet
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    role="group"
                    aria-label="Network mode"
                    className="mx-2 mb-1 grid grid-cols-2 gap-1 p-1 rounded-lg bg-black/30 border border-white/5"
                  >
                    <ModeOption
                      label="Testnet"
                      active={ready && isTestnet}
                      // Moving to testnet is always safe, so it needs no
                      // confirmation; only the mainnet direction does.
                      onClick={() => setMode('testnet')}
                      activeClass="bg-sky-500/20 text-sky-200 border-sky-500/40"
                    />
                    <ModeOption
                      label="Mainnet"
                      active={ready && !isTestnet}
                      onClick={() => (isTestnet ? setConfirmMainnet(true) : undefined)}
                      activeClass="bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
                    />
                  </div>
                )}
              </div>

              {/* Exit */}
              <div className="p-2">
                <button
                  onClick={handleDisconnect}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-red-300 hover:bg-red-500/10 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden>
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                  </svg>
                  Disconnect wallet
                </button>
              </div>

              {(walletError || session.error) && (
                <p className="px-4 pb-3 text-[11px] text-red-300">
                  {walletError ?? session.error}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 p-3 border-b border-white/10">
                <button
                  onClick={() => setView('root')}
                  className="p-1 rounded-lg hover:bg-white/10"
                  aria-label="Back to account"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <span className="text-sm font-medium">Switch network</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500">
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
                        ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}
                    >
                      <ChainMark chain={c} size={22} />
                      <span className="flex-1 min-w-0 truncate">{chainDisplayName(c)}</span>
                      {switching === c.id ? (
                        <span className="text-[10px] text-slate-400">Check wallet…</span>
                      ) : active ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-mint-400" aria-hidden>
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : (
                        /* Solana needs a different adapter, so flag it rather
                           than offer a switch that cannot work. */
                        !isEvm && <span className="text-[10px] text-slate-500">non-EVM</span>
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
  onClick,
  activeClass,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  activeClass: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`px-2 py-1.5 rounded-md text-xs border transition-colors ${
        active ? activeClass : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
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
        className="rounded-full object-cover border border-white/10 shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      className="rounded-full bg-gradient-to-br from-arc-500 to-mint-500 flex items-center justify-center font-bold shrink-0"
    >
      {fallback.slice(2, 4).toUpperCase()}
    </div>
  );
}
