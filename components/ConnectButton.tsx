'use client';
/**
 * Wallet connect + network switch control.
 *
 * Lists every EIP-6963 wallet the browser announced rather than assuming
 * MetaMask, and lets the user move between any App Kit chain. Chains come from
 * the registry, so this list grows automatically.
 */
import { useEffect, useRef, useState } from 'react';
import { getEnvChains } from '@/lib/chains';
import { useWallet } from '@/lib/WalletProvider';

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectButton() {
  const {
    wallets,
    wallet,
    address,
    chain,
    chainId,
    isConnecting,
    isUnsupportedChain,
    error,
    connect,
    disconnect,
    switchChain,
  } = useWallet();

  const [showWallets, setShowWallets] = useState(false);
  const [showChains, setShowChains] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click; otherwise they linger over the page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShowWallets(false);
        setShowChains(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const chains = getEnvChains();

  if (!address) {
    return (
      <div ref={containerRef} className="relative">
        <button
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
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 text-sm"
              >
                {w.icon && <img src={w.icon} alt="" className="w-5 h-5 rounded" />}
                <span>{w.name}</span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="absolute right-0 top-full mt-2 w-64 glass p-3 text-xs text-red-300 z-50">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <button
        onClick={() => setShowChains((v) => !v)}
        className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
          isUnsupportedChain
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
            : 'border-white/10 bg-white/5 hover:bg-white/10'
        }`}
      >
        {/* Naming the unsupported network beats a generic "wrong network". */}
        {isUnsupportedChain ? `Unsupported (${chainId})` : chain?.label ?? 'Select network'}
      </button>

      <button
        onClick={disconnect}
        title="Click to disconnect"
        className="px-3 py-2 rounded-xl text-sm bg-white/5 border border-white/10 hover:bg-white/10 font-mono"
      >
        {shorten(address)}
      </button>

      {showChains && (
        <div className="absolute right-0 top-full mt-2 w-60 glass p-2 z-50 max-h-80 overflow-y-auto">
          {chains.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setShowChains(false);
                void switchChain(c);
              }}
              disabled={c.type !== 'evm'}
              className={`w-full flex items-center justify-between p-2 rounded-lg text-sm hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed ${
                c.id === chain?.id ? 'bg-white/10' : ''
              }`}
            >
              <span>{c.label}</span>
              {/* Solana needs a different adapter, so flag it rather than fail silently. */}
              {c.type !== 'evm' && <span className="text-[10px] text-slate-500">non-EVM</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
