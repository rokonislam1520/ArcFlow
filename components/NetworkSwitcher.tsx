'use client';
/**
 * Mainnet / testnet switch.
 *
 * Moving to mainnet means real money, so the control states plainly which mode
 * is active and requires a confirmation step in that direction. Switching back
 * to testnet needs no confirmation — that direction is always safe.
 */
import { useState } from 'react';
import { hasArcSupport, UNSUPPORTED_NETWORKS } from '@/lib/chains';
import { useNetworkMode } from '@/lib/network';

export function NetworkSwitcher() {
  const { mode, setMode, isTestnet, ready } = useNetworkMode();
  const [confirming, setConfirming] = useState(false);

  // Render a stable placeholder until the stored choice is applied, so the
  // markup matches on hydration and the label never flips after mount.
  if (!ready) {
    return <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-500">…</div>;
  }

  const arcMissingOnMainnet = !hasArcSupport(false);

  return (
    <div className="relative">
      <button
        onClick={() => (isTestnet ? setConfirming(true) : setMode('testnet'))}
        title={
          isTestnet
            ? 'Test funds only. Click to switch to mainnet.'
            : 'Real funds. Click to switch back to testnet.'
        }
        className={`px-3 py-2 rounded-xl text-sm border transition-colors flex items-center gap-2 ${
          isTestnet
            ? 'border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20'
            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full ${isTestnet ? 'bg-sky-400' : 'bg-emerald-400'}`}
          aria-hidden
        />
        {isTestnet ? 'Testnet' : 'Mainnet'}
      </button>

      {confirming && (
        <div className="absolute right-0 top-full mt-2 w-72 glass p-4 z-50 text-sm">
          <p className="font-semibold text-emerald-300 mb-2">Switch to mainnet?</p>
          <p className="text-slate-400 text-xs mb-3">
            Transactions will move real funds and cannot be reversed.
          </p>

          {/* Arc is testnet-only today, so say so rather than let the flagship
              chain quietly vanish from every selector. */}
          {arcMissingOnMainnet && (
            <p className="text-amber-300/90 text-xs mb-3">
              Note: Arc has no mainnet yet, so it will not appear in mainnet mode.
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => {
                setMode('mainnet');
                setConfirming(false);
              }}
              className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30 text-xs"
            >
              Use mainnet
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs"
            >
              Stay on testnet
            </button>
          </div>

          {UNSUPPORTED_NETWORKS.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-white/10">
              Not routable via Circle:{' '}
              {UNSUPPORTED_NETWORKS.map((n) => n.name).join(', ')}.
            </p>
          )}
        </div>
      )}

      {/* Mode is announced to assistive tech, not conveyed by colour alone. */}
      <span className="sr-only" role="status">
        {mode} mode active
      </span>
    </div>
  );
}
