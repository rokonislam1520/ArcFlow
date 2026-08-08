'use client';
/**
 * Wallet connect button, for the disconnected state only.
 *
 * Lists every EIP-6963 wallet the browser announced rather than assuming
 * MetaMask, so whatever the user actually installed is what they are offered.
 *
 * Once an address is connected, callers render `AccountMenu` instead: the
 * address, network, mode and disconnect all belong together in one place, and
 * this component used to carry a second copy of them. Two controls that both
 * claimed to show the current chain could disagree, so only one owns that now.
 */
import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@/lib/WalletProvider';

export function ConnectButton() {
  const { wallets, isConnecting, error, connect } = useWallet();
  const [showWallets, setShowWallets] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the picker on outside click; otherwise it lingers over the page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setShowWallets(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        // With one wallet the picker would be a menu of a single item, so go
        // straight to connecting.
        onClick={() => (wallets.length > 1 ? setShowWallets((v) => !v) : void connect())}
        disabled={isConnecting}
        className="btn-arc px-5 py-2 text-sm disabled:opacity-60"
      >
        {isConnecting ? 'Connecting…' : 'Connect Wallet'}
      </button>

      {showWallets && wallets.length > 0 && (
        <div className="absolute right-0 top-full mt-2 w-56 glass p-2 z-50">
          {wallets.map((w) => (
            <button
              key={w.uuid}
              onClick={() => {
                setShowWallets(false);
                void connect(w.uuid);
              }}
              className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-surface-hover/[0.06] text-sm"
            >
              {/* Wallet icons arrive as data URIs from the extension itself,
                  so there is nothing for next/image to optimise. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {w.icon && <img src={w.icon} alt="" className="w-5 h-5 rounded" />}
              <span>{w.name}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="absolute right-0 top-full mt-2 w-64 glass p-3 text-xs text-danger z-50">
          {error}
        </div>
      )}
    </div>
  );
}
