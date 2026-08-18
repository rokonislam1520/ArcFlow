'use client';
/**
 * The wallet provider picker — the app's single list of connectable wallets.
 *
 * This is the existing connect flow, lifted out of `ConnectButton` so the Swap
 * cards can open the same list instead of growing a second one. It owns no
 * connection logic of its own: `WalletProvider.connect(uuid)` does the work, as
 * it did before.
 *
 * Every entry comes from EIP-6963 announcements, which is why there is no
 * mention of MetaMask, Rabby, OKX or any other brand anywhere in this file. The
 * name and icon are whatever the installed extension published about itself, so
 * the list is exactly the set of wallets present in this browser — not a
 * hardcoded menu that offers wallets the user does not have and omits the one
 * they do.
 */
import { useEffect } from 'react';
import { useWallet } from '@/lib/WalletProvider';

export function WalletPicker({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  // Mounted only while open; nothing here should listen for keys behind a
  // dialog nobody can see.
  if (!isOpen) return null;
  return <WalletPickerBody onClose={onClose} />;
}

function WalletPickerBody({ onClose }: { onClose: () => void }) {
  const { wallets, wallet, isConnecting, error, connect } = useWallet();

  // Escape closes, matching TokenSelector and AccountMenu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm animate-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Connect a wallet"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-surface-card/95 backdrop-blur-2xl border border-hairline
          rounded-t-3xl sm:rounded-3xl shadow-float overflow-hidden animate-scale-in"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-hairline">
          <h2 className="text-base font-bold tracking-tight">Connect a wallet</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-ink-muted
              hover:text-ink-primary hover:bg-surface-hover/[0.06] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="p-2 max-h-[60vh] overflow-y-auto">
          {wallets.length === 0 ? (
            /*
             * No announcements means no wallet extension is installed, or one is
             * installed that does not implement EIP-6963. Saying so is more use
             * than listing wallets that cannot be connected from here.
             */
            <p className="px-3 py-6 text-sm text-ink-muted text-center leading-relaxed">
              No wallet extension announced itself to this page. Install a browser wallet, or
              unlock the one you have, then try again.
            </p>
          ) : (
            wallets.map((w) => {
              const isCurrent = wallet?.uuid === w.uuid;
              return (
                <button
                  key={w.uuid}
                  onClick={async () => {
                    await connect(w.uuid);
                    onClose();
                  }}
                  disabled={isConnecting}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl text-left
                    hover:bg-surface-hover/[0.06] disabled:opacity-60 transition-colors"
                >
                  <WalletIcon icon={w.icon} name={w.name} size={32} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{w.name}</span>
                    {isCurrent && (
                      <span className="block text-[11px] text-ink-muted">Currently connected</span>
                    )}
                  </span>
                  <svg
                    className="w-4 h-4 text-ink-muted shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })
          )}
        </div>

        {error && (
          <p className="px-5 py-3 text-xs text-danger border-t border-hairline">{error}</p>
        )}
      </div>
    </div>
  );
}

/**
 * A wallet's own icon, as announced.
 *
 * Icons arrive as data URIs from the extension, so there is nothing for
 * next/image to fetch or optimise. When a wallet published no icon — the
 * `window.ethereum` fallback in `WalletProvider` is one such case — this draws a
 * neutral mark rather than borrowing another wallet's logo, which would name the
 * wrong provider.
 */
export function WalletIcon({
  icon,
  name,
  size = 20,
}: {
  icon?: string;
  name?: string;
  size?: number;
}) {
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt={name ? `${name} icon` : ''}
        width={size}
        height={size}
        className="rounded-full shrink-0 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="shrink-0 rounded-full bg-surface-input border border-hairline
        flex items-center justify-center text-ink-muted"
      style={{ width: size, height: size }}
    >
      <svg
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        style={{ width: size * 0.58, height: size * 0.58 }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 8.5A2.5 2.5 0 015.5 6h13A2.5 2.5 0 0121 8.5v7a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 15.5v-7z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12h.75" />
      </svg>
    </span>
  );
}
