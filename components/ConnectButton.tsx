'use client';
/**
 * Wallet connect button, for the disconnected state only.
 *
 * The list of wallets now lives in `WalletPicker`, which the Swap cards open
 * too. It used to be inlined here, and duplicating it would have meant two
 * lists that could drift apart in what they show and how they connect.
 *
 * Once an address is connected, callers render `AccountMenu` instead: the
 * address, network, mode and disconnect all belong together in one place, and
 * this component used to carry a second copy of them. Two controls that both
 * claimed to show the current chain could disagree, so only one owns that now.
 *
 * The picker opens anchored to the button below, not centered on the page, so a
 * click here reads as this control's own menu rather than as a page-level
 * interruption over Swap or Bridge. The ref is what gives it something to anchor
 * to; the click behaviour and connect logic are unchanged.
 */
import { useRef, useState } from 'react';
import { useWallet } from '@/lib/WalletProvider';
import { WalletPicker } from '@/components/WalletPicker';

export function ConnectButton() {
  const { wallets, isConnecting, error, connect } = useWallet();
  const [picking, setPicking] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        // With one wallet the picker would be a menu over a single item, so go
        // straight to connecting.
        //
        // Toggles rather than only opening: the button is the popover's anchor,
        // and a second click on an open menu's own trigger is expected to shut
        // it.
        onClick={() =>
          wallets.length === 1 ? void connect() : setPicking((v) => !v)
        }
        disabled={isConnecting}
        aria-haspopup="menu"
        aria-expanded={picking}
        className="btn-arc px-5 py-2 text-sm disabled:opacity-60"
      >
        {isConnecting ? 'Connecting…' : 'Connect Wallet'}
      </button>

      <WalletPicker
        isOpen={picking}
        onClose={() => setPicking(false)}
        anchorRef={buttonRef}
      />


      {/* Errors from the single-wallet path above; the dialog shows its own. */}
      {error && !picking && (
        <div className="absolute right-0 top-full mt-2 w-64 glass p-3 text-xs text-danger z-50">
          {error}
        </div>
      )}
    </div>
  );
}
