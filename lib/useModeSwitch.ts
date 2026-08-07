'use client';
/**
 * One-tap mainnet/testnet switching.
 *
 * Changing the mode used to only change the app's idea of the network: the
 * wallet stayed where it was, and every screen kept the balances, tokens and
 * history of the network the user had just left. The mismatch surfaced later as
 * a "wrong network" banner the user had to act on again, which made a single
 * intent ("show me mainnet") take three steps.
 *
 * So a mode change is treated as one operation with three parts, in this order:
 *
 *  1. Set the mode, so `getEnvChains` and everything derived from it flips.
 *  2. Move the wallet to that mode's default chain. `switchChain` already asks
 *     for `wallet_switchEthereumChain` first and only falls back to
 *     `wallet_addEthereumChain` when the wallet answers 4902 (unrecognised
 *     chain), so an unknown network is added rather than erroring.
 *  3. Publish the app-wide refresh signal, which every chain-dependent hook
 *     already subscribes to — balances, tokens, swap, bridge, portfolio,
 *     dashboard and history all reload without needing to know about modes.
 *
 * The refresh is published even when the wallet declines or is absent. The app
 * has already moved to the new mode at that point, so the screens must re-read
 * against it; skipping the refresh would leave the previous network's numbers
 * on display under the new mode's label, which is the exact confusion this is
 * meant to remove.
 */
import { useCallback, useState } from 'react';
import { getDefaultChain } from '@/lib/chains';
import { useNetworkMode, type NetworkMode } from '@/lib/network';
import { publishRefresh } from '@/lib/refresh';
import { useWallet } from '@/lib/WalletProvider';

export function useModeSwitch(): {
  mode: NetworkMode;
  isTestnet: boolean;
  ready: boolean;
  /** True while the wallet is being asked to move. */
  switching: boolean;
  /** Switch modes. A no-op when already in the requested mode. */
  switchMode: (next: NetworkMode) => Promise<void>;
} {
  const { mode, setMode, isTestnet, ready } = useNetworkMode();
  const { address, switchChain } = useWallet();
  const [switching, setSwitching] = useState(false);

  const switchMode = useCallback(
    async (next: NetworkMode) => {
      if (next === mode) return;

      // Mode first: the UI should reflect the tap immediately, not after a
      // wallet round-trip the user may take seconds to answer.
      setMode(next);
      setSwitching(true);

      try {
        // Nothing to move when no wallet is connected — the mode alone is the
        // whole change, and the refresh below still applies it everywhere.
        if (address) {
          const target = getDefaultChain(next === 'testnet');
          // A rejected or failed switch is not escalated: the wallet already
          // told the user, and `useChainMismatch` will offer the fix in context.
          // Throwing here would only replace their choice with a stack trace.
          await switchChain(target).catch(() => false);
        }
      } finally {
        setSwitching(false);
        publishRefresh();
      }
    },
    [mode, setMode, address, switchChain]
  );

  return { mode, isTestnet, ready, switching, switchMode };
}
