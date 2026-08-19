'use client';
/**
 * Account chip for a Swap card: the wallet's own logo, its address in bold, and
 * a two-item menu.
 *
 * It reports identity and offers two actions. It does not connect, sign, or read
 * balances: `WalletProvider` owns the connection, `WalletPicker` owns the list
 * of wallets to connect, `useViewingAddress` owns the pasted address, and this
 * component only says which account the card is reading from.
 *
 * Three decisions worth keeping:
 *
 *  - The first click opens this small menu, not the wallet list. The common
 *    reason to touch this chip is to check which account is in view; jumping
 *    straight to a provider list would answer a question the user did not ask
 *    and put "connect something else" one accidental tap away.
 *  - The logo is the connected wallet's own, from its EIP-6963 announcement. A
 *    single generic glyph for every wallet would misreport identity precisely
 *    when it matters — when more than one wallet is installed and the user is
 *    checking which one is about to sign.
 *  - A pasted address is never dressed up as an account. It has no provider and
 *    no key, so it cannot sign: it is marked read-only with an amber dot rather
 *    than the green of a live account, and the page keeps requiring the
 *    connected wallet before any transaction. A UI that showed the two alike
 *    would invite someone to believe they were about to trade funds they cannot
 *    touch.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { getAddress, isAddress } from 'viem';
import { shortAddress } from '@/lib/profile';
import { WalletPicker, WalletIcon } from '@/components/WalletPicker';

/** Which account the card is currently reading balances from. */
export type SelectionKind = 'connected' | 'viewing' | 'none';

export function WalletSelector({
  kind,
  address,
  connectedAddress,
  walletName,
  walletIcon,
  onUseViewingAddress,
  onClearViewingAddress,
  /**
   * Right-aligns the menu. Both cards sit in the same narrow column, so both
   * open inward and neither widens the page at 360px.
   */
  align = 'right',
  label,
}: {
  kind: SelectionKind;
  /** The address on screen: the connected wallet, or a pasted one. */
  address: string | null;
  /** The connected wallet, still shown in the menu while viewing another. */
  connectedAddress: string | null;
  /** Name the wallet announced, e.g. for the menu's secondary line. */
  walletName?: string;
  /** Icon the wallet announced. Absent for providers that published none. */
  walletIcon?: string;
  /** Called only with a checksummed, validated address. */
  onUseViewingAddress: (address: `0x${string}`) => void;
  onClearViewingAddress: () => void;
  align?: 'left' | 'right';
  /** Announced to screen readers, e.g. "Account selling from". */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const isViewing = kind === 'viewing';

  const close = useCallback(() => {
    setOpen(false);
    setPasting(false);
    setDraft('');
    setInvalid(false);
  }, []);

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

  // Focus the field when the paste view opens: it is the only thing there to
  // do, and requiring a second click to reach it is friction for no reason.
  useEffect(() => {
    if (pasting) inputRef.current?.focus();
  }, [pasting]);

  const openPicker = () => {
    // The menu closes first: leaving it open would stack two popovers on the
    // same anchor, both offering the same decision.
    close();
    setPicking(true);
  };


  const commitDraft = () => {
    const trimmed = draft.trim();
    // The same `isAddress` check the address book and Send use. A wrong address
    // must fail here, visibly, rather than become a balance lookup that
    // silently returns zero.
    if (!isAddress(trimmed)) {
      setInvalid(true);
      return;
    }
    // Stored checksummed, for the EIP-55 typo detection the casing carries.
    onUseViewingAddress(getAddress(trimmed));
    close();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        /*
         * The chip anchors both the small menu and the wallet list, so it closes
         * whichever is up rather than opening a second popover over the first.
         */
        onClick={() => {
          if (picking) {
            setPicking(false);
            return;
          }
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open || picking}

        aria-label={address ? `${label}: ${shortAddress(address)}` : label}
        className="flex items-center gap-1.5 max-w-[170px] sm:max-w-none pl-1.5 pr-1 py-1 rounded-xl
          border border-transparent text-ink-primary
          hover:bg-surface-hover/[0.06] hover:border-hairline
          active:scale-[0.98] transition-all duration-200 ease-premium"
      >
        {address ? (
          <>
            {/*
             * A pasted address gets an amber dot, not a wallet logo: there is no
             * provider to take an icon from, and borrowing the connected
             * wallet's would claim this address belongs to it.
             */}
            {isViewing ? (
              <span
                aria-hidden
                className="w-2 h-2 rounded-full bg-warning shrink-0"
              />
            ) : (
              <WalletIcon icon={walletIcon} name={walletName} size={20} />
            )}
            {/* The address is the point of the chip, so it carries the weight. */}
            <span
              className={`text-sm font-semibold tracking-tight truncate ${
                isViewing ? 'text-warning' : ''
              }`}
            >
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
          className={`absolute top-full mt-2 z-50 w-[244px] glass rounded-2xl p-1.5 shadow-float animate-scale-in
            ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {pasting ? (
            /*
             * The paste view replaces the menu rather than expanding below it,
             * so the popover does not grow past the card it is anchored to on a
             * narrow screen.
             */
            <div className="p-1.5">
              <label
                htmlFor={inputId}
                className="block text-[10px] font-semibold uppercase tracking-wider text-ink-muted"
              >
                View any address
              </label>
              <input
                ref={inputRef}
                id={inputId}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  // Clear the error as soon as the text changes: keeping it up
                  // while someone fixes the typo reads as though the new value
                  // were also rejected.
                  if (invalid) setInvalid(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitDraft();
                }}
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={invalid}
                className={`w-full mt-1.5 px-2.5 py-2 rounded-xl bg-surface-input border text-xs font-mono
                  outline-none transition-colors ${
                    invalid
                      ? 'border-amber-500/50 bg-amber-500/[0.07]'
                      : 'border-hairline focus:border-arc-500/40'
                  }`}
              />
              {invalid && (
                <p className="mt-1.5 text-[11px] text-warning/90 leading-relaxed">
                  That is not a valid address.
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-ink-muted leading-relaxed">
                Balances only. This app cannot sign for an address you paste.
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                <button
                  onClick={commitDraft}
                  className="flex-1 py-2 rounded-xl bg-arc-500/15 text-accent-text text-xs font-semibold
                    hover:bg-arc-500/25 transition-colors"
                >
                  View
                </button>
                <button
                  onClick={() => {
                    setPasting(false);
                    setDraft('');
                    setInvalid(false);
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-ink-muted
                    hover:text-ink-primary hover:bg-surface-hover/[0.06] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/*
               * Shown only when there is something to report. With no wallet
               * connected the menu is the actions alone, rather than a heading
               * over an empty space or a placeholder address.
               */}
              {connectedAddress && (
                <>
                  <div className="px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                      Current connected wallet
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <WalletIcon icon={walletIcon} name={walletName} size={22} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold tracking-tight truncate">
                          {shortAddress(connectedAddress)}
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

              {/*
               * Offered above the two actions while a pasted address is in view,
               * because returning to one's own wallet is the way out of a state
               * that cannot trade — it should not be the least visible option.
               */}
              {isViewing && (
                <>
                  <button
                    role="menuitem"
                    onClick={() => {
                      onClearViewingAddress();
                      close();
                    }}
                    className="w-full text-left px-2.5 py-2.5 rounded-xl text-sm font-medium
                      text-warning hover:bg-amber-500/[0.10] transition-colors"
                  >
                    <span className="block whitespace-nowrap">Stop viewing {shortAddress(address ?? '')}</span>
                  </button>
                  <div className="h-px bg-hairline mx-1 my-1" />
                </>
              )}

              <button
                role="menuitem"
                onClick={openPicker}
                // `whitespace-nowrap` keeps this on one line at every width; the
                // popover is sized to fit it rather than the label being allowed
                // to wrap and unbalance the menu.
                className="w-full text-left px-2.5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap
                  text-accent-text hover:bg-arc-500/[0.12] transition-colors"
              >
                Connect a new wallet
              </button>

              <div className="h-px bg-hairline mx-1 my-1" />

              <button
                role="menuitem"
                onClick={() => setPasting(true)}
                className="w-full text-left px-2.5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap
                  text-ink-secondary hover:text-ink-primary hover:bg-surface-hover/[0.06] transition-colors"
              >
                Paste wallet address
              </button>
            </>
          )}
        </div>
      )}

      {/*
       * The app's one provider list, shared with ConnectButton. Opening it here
       * does not fork the connect flow — `WalletProvider.connect` still performs
       * it, and the chip above re-renders from that state once it resolves.
       *
       * Anchored to the chip itself, so the list appears under the control that
       * opened it. It portals out to the body rather than nesting here, because
       * this chip sits inside a Swap card that clips its overflow — anchored
       * inside that card, the list would be cut off by its edge.
       */}
      <WalletPicker
        isOpen={picking}
        onClose={() => setPicking(false)}
        anchorRef={buttonRef}
      />

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
