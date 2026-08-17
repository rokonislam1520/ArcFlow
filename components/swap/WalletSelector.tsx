'use client';
/**
 * Wallet selector for the Swap cards.
 *
 * Purely a control surface over state that already exists: `WalletProvider`
 * owns the connection, and the read-only viewing address is passed in from the
 * page. Nothing here connects, signs, or reads a balance on its own.
 *
 * The distinction this component exists to make visible:
 *
 *  - A **connected wallet** can sign. It came through EIP-6963 discovery and
 *    `WalletProvider.connect`, and it has a provider behind it.
 *  - A **viewing address** cannot sign, ever. It is a string someone pasted.
 *    There is no provider, no adapter, and no key — so it is labelled as
 *    read-only rather than dressed up as an account, and the page keeps
 *    requiring the connected wallet before any transaction.
 *
 * Conflating those two is the failure mode worth designing against: a UI that
 * shows a pasted address the same way it shows a connected one invites the user
 * to believe they are about to trade funds they cannot touch.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { getAddress, isAddress } from 'viem';
import { shortAddress } from '@/lib/profile';
import type { DiscoveredWallet } from '@/lib/WalletProvider';

/** Which account the page is currently showing balances for. */
export type SelectionKind = 'connected' | 'viewing' | 'none';

export function WalletSelector({
  kind,
  address,
  walletName,
  walletIcon,
  wallets,
  onConnect,
  onUseViewingAddress,
  onClearViewingAddress,
  /**
   * Right-aligns the popover. The Buy card sits in the same column as the Sell
   * card, so both open inward and neither pushes the page wider — the overflow
   * a left-anchored popover would cause at 360px.
   */
  align = 'right',
  label,
}: {
  kind: SelectionKind;
  address: string | null;
  walletName?: string;
  walletIcon?: string;
  wallets: DiscoveredWallet[];
  /** Existing App Kit connect flow. `uuid` picks a specific discovered wallet. */
  onConnect: (uuid?: string) => void;
  /** Called only with a checksummed, validated address. */
  onUseViewingAddress: (address: `0x${string}`) => void;
  onClearViewingAddress: () => void;
  align?: 'left' | 'right';
  /** Announced to screen readers, e.g. "Account selling from". */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

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
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="flex items-center gap-1.5 px-2 py-1 -mr-1 rounded-lg text-[11px]
          text-ink-muted hover:text-ink-secondary hover:bg-surface-hover/[0.06]
          transition-colors duration-200"
      >
        {address ? (
          <>
            <StatusDot kind={kind} />
            <span className="font-mono">{shortAddress(address)}</span>
          </>
        ) : (
          <span className="font-semibold text-accent-text">Connect</span>
        )}
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-30 mt-1.5 w-[248px] rounded-2xl bg-surface-card border border-hairline
            shadow-card overflow-hidden animate-in ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {pasting ? (
            <div className="p-3">
              <label htmlFor={inputId} className="block text-[11px] text-ink-muted mb-1.5">
                Wallet address
              </label>
              <input
                ref={inputRef}
                id={inputId}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  // Clear the complaint as soon as the text changes; leaving it
                  // up while the user fixes the address reads as if the new
                  // value were rejected too.
                  setInvalid(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitDraft();
                  }
                }}
                spellCheck={false}
                autoComplete="off"
                placeholder="0x…"
                aria-invalid={invalid}
                className={`w-full px-2.5 py-2 rounded-xl bg-surface-input border text-xs font-mono
                  outline-none transition-colors duration-200 placeholder:text-ink-muted ${
                    invalid
                      ? 'border-amber-500/40 bg-amber-500/[0.07]'
                      : 'border-hairline focus:border-arc-500/40'
                  }`}
              />

              {invalid && (
                <p className="mt-1.5 text-[11px] text-warning/90">
                  Not a valid address. Check for a missing character.
                </p>
              )}

              <p className="mt-2 text-[11px] text-ink-muted leading-relaxed">
                Used to view balances only. Swapping still requires the connected wallet.
              </p>

              <div className="flex items-center gap-2 mt-2.5">
                <button
                  onClick={close}
                  className="flex-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold
                    bg-surface-input border border-hairline text-ink-secondary
                    hover:border-arc-500/30 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={commitDraft}
                  disabled={draft.trim() === ''}
                  className="flex-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold
                    bg-arc-500/20 border border-arc-500/40 text-accent-text
                    hover:bg-arc-500/25 disabled:opacity-40 disabled:cursor-not-allowed
                    transition-colors duration-200"
                >
                  Use address
                </button>
              </div>
            </div>
          ) : (
            <>
              {address && (
                <div className="px-3 py-2.5 border-b border-hairline">
                  <div className="flex items-center gap-2">
                    {walletIcon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={walletIcon}
                        alt=""
                        className="w-5 h-5 rounded-md shrink-0"
                      />
                    ) : (
                      <StatusDot kind={kind} />
                    )}
                    <span className="text-xs font-mono truncate">{shortAddress(address)}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-muted">
                    {kind === 'connected' ? (
                      <>Connected{walletName ? ` · ${walletName}` : ''} · can sign</>
                    ) : (
                      <>Viewing only · cannot sign</>
                    )}
                  </p>
                </div>
              )}

              {/*
               * Goes through WalletProvider.connect, the same path the header's
               * connect button uses. With several wallets discovered, each is
               * listed by name: "connect a new wallet" is only meaningful if
               * you can say which one.
               */}
              {wallets.length > 1 ? (
                <div className="py-1">
                  <p className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wide text-ink-muted">
                    Connect a new wallet
                  </p>
                  {wallets.map((w) => (
                    <MenuItem
                      key={w.uuid}
                      onClick={() => {
                        onConnect(w.uuid);
                        close();
                      }}
                    >
                      {w.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={w.icon} alt="" className="w-4 h-4 rounded shrink-0" />
                      ) : (
                        <WalletGlyph />
                      )}
                      <span className="truncate">{w.name}</span>
                    </MenuItem>
                  ))}
                </div>
              ) : (
                <MenuItem
                  onClick={() => {
                    onConnect();
                    close();
                  }}
                >
                  <WalletGlyph />
                  Connect a new wallet
                </MenuItem>
              )}

              <div className="border-t border-hairline">
                <MenuItem onClick={() => setPasting(true)}>
                  <PasteGlyph />
                  Paste wallet address
                </MenuItem>

                {/* Only offered when there is something to undo. */}
                {kind === 'viewing' && (
                  <MenuItem
                    onClick={() => {
                      onClearViewingAddress();
                      close();
                    }}
                  >
                    <CloseGlyph />
                    Stop viewing this address
                  </MenuItem>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Connection state as a colour.
 *
 * Green reads as "live and usable" throughout this app, so a read-only address
 * deliberately does not get it — an amber dot says "look closer", which is
 * exactly right for an account that cannot sign.
 */
function StatusDot({ kind }: { kind: SelectionKind }) {
  if (kind === 'connected') {
    return <span className="w-1.5 h-1.5 rounded-full bg-mint-400 shrink-0" />;
  }
  if (kind === 'viewing') {
    return <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />;
  }
  return <span className="w-1.5 h-1.5 rounded-full bg-ink-muted/40 shrink-0" />;
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left text-ink-secondary
        hover:bg-surface-hover/[0.06] hover:text-ink-primary transition-colors duration-150"
    >
      {children}
    </button>
  );
}

function WalletGlyph() {
  return (
    <svg className="w-4 h-4 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10h18M3 10a2 2 0 012-2h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7zm13 4h.01"
      />
    </svg>
  );
}

function PasteGlyph() {
  return (
    <svg className="w-4 h-4 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
      />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg className="w-4 h-4 shrink-0 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
