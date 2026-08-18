'use client';
/**
 * Account chip for a Swap card: the wallet's own logo, its address in bold, and
 * a two-item menu.
 *
 * It reports identity and offers one action. It does not connect, sign, or read
 * balances: `WalletProvider` owns the connection, `WalletPicker` owns the list
 * of wallets to connect, and this component only says which account the card is
 * reading from and provides the way to change it.
 *
 * Two decisions worth keeping:
 *
 *  - The first click opens this small menu, not the wallet list. The common
 *    reason to touch this chip is to check which account is in view; jumping
 *    straight to a provider list would answer a question the user did not ask
 *    and put "connect something else" one accidental tap away.
 *  - The logo is the connected wallet's own, from its EIP-6963 announcement. A
 *    single generic glyph for every wallet would misreport identity precisely
 *    when it matters — when more than one wallet is installed and the user is
 *    checking which one is about to sign.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { shortAddress } from '@/lib/profile';
import { WalletPicker, WalletIcon } from '@/components/WalletPicker';

export function WalletSelector({
  address,
  walletName,
  walletIcon,
  /**
   * Right-aligns the menu. Both cards sit in the same narrow column, so both
   * open inward and neither widens the page at 360px.
   */
  align = 'right',
  label,
}: {
  /** The connected address, or null when no wallet is connected. */
  address: string | null;
  /** Name the wallet announced, e.g. for the menu's secondary line. */
  walletName?: string;
  /** Icon the wallet announced. Absent for providers that published none. */
  walletIcon?: string;
  align?: 'left' | 'right';
  /** Announced to screen readers, e.g. "Account selling from". */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Outside click and Escape both dismiss, matching AccountMenu. Focus returns
  // to the trigger on Escape so keyboard users are not dropped at the top of
  // the document.
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

  const openPicker = () => {
    // The menu closes first: leaving it open behind the modal would show two
    // layers of the same decision.
    setOpen(false);
    setPicking(true);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={address ? `${label}: ${shortAddress(address)}` : label}
        className="flex items-center gap-1.5 max-w-[170px] sm:max-w-none pl-1.5 pr-1 py-1 rounded-xl
          border border-transparent text-ink-primary
          hover:bg-surface-hover/[0.06] hover:border-hairline
          active:scale-[0.98] transition-all duration-200 ease-premium"
      >
        {address ? (
          <>
            <WalletIcon icon={walletIcon} name={walletName} size={20} />
            {/* The address is the point of the chip, so it carries the weight. */}
            <span className="text-sm font-semibold tracking-tight truncate">
              {shortAddress(address)}
            </span>
          </>
        ) : (
          <>
            <WalletIcon size={20} />
            <span className="text-sm font-semibold text-accent-text">Connect wallet</span>
          </>
        )}
        <Chevron open={open} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`absolute top-full mt-2 z-50 w-[236px] glass rounded-2xl p-1.5 shadow-float animate-scale-in
            ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {/*
           * Shown only when there is something to report. With no wallet
           * connected the menu is a single action, rather than a heading over an
           * empty space or a placeholder address.
           */}
          {address && (
            <>
              <div className="px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  Current connected wallet
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <WalletIcon icon={walletIcon} name={walletName} size={22} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold tracking-tight truncate">
                      {shortAddress(address)}
                    </span>
                    {walletName && (
                      <span className="block text-[11px] text-ink-muted truncate">
                        {walletName}
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <div className="h-px bg-hairline mx-1 my-1" />
            </>
          )}

          <button
            role="menuitem"
            onClick={openPicker}
            className="w-full text-left px-2.5 py-2.5 rounded-xl text-sm font-medium
              text-accent-text hover:bg-arc-500/[0.12] transition-colors"
          >
            Connect a new wallet
          </button>
        </div>
      )}

      {/*
       * The app's one provider list, shared with ConnectButton. Opening it here
       * does not fork the connect flow — `WalletProvider.connect` still performs
       * it, and the chip above re-renders from that state once it resolves.
       */}
      <WalletPicker isOpen={picking} onClose={() => setPicking(false)} />
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-ink-muted shrink-0 transition-transform duration-200 ${
        open ? 'rotate-180' : ''
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
