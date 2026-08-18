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
 */
import { useState } from 'react';
import { useWallet } from '@/lib/WalletProvider';
import { WalletPicker } from '@/components/WalletPicker';

export function ConnectButton() {
  const { wallets, isConnecting, error, connect } = useWallet();
  const [picking, setPicking] = useState(false);

  return (
    <div className="relative">
      <button
        // With one wallet the picker would be a dialog over a single item, so go
        // straight to connecting.
        onClick={() => (wallets.length === 1 ? void connect() : setPicking(true))}
        disabled={isConnecting}
        className="btn-arc px-5 py-2 text-sm disabled:opacity-60"
      >
        {isConnecting ? 'Connecting…' : 'Connect Wallet'}
      </button>

      <WalletPicker isOpen={picking} onClose={() => setPicking(false)} />

      {/* Errors from the single-wallet path above; the dialog shows its own. */}
      {error && !picking && (
        <div className="absolute right-0 top-full mt-2 w-64 glass p-3 text-xs text-danger z-50">
          {error}
        </div>
      )}
    </div>
  );
}
