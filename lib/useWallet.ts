'use client';
/**
 * Compatibility layer for the contract-backed pages (Split / Merchant /
 * Recurring).
 *
 * Those pages call custom ArcFlow contracts, which App Kit does not cover, so
 * they still need a raw viem `WalletClient`. What they must NOT have is a
 * second, independent wallet connection: before this, the navbar and these
 * pages tracked separate state, so connecting in one place left the other
 * disconnected.
 *
 * Everything here now derives from the single `WalletProvider` session. This
 * module owns no connection state of its own.
 */
import { useMemo } from 'react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { getDefaultChain } from './chains';
import { getPublicClient, toViemChain } from './clients';
import { arcChain } from './config';
import { useWallet as useWalletContext, useActiveChain } from './WalletProvider';

/**
 * Read client for the chain the ArcFlow contracts are deployed on.
 *
 * This is deliberately pinned rather than following the wallet: Split, Merchant
 * and Recurring state lives in contracts at fixed addresses on one deployment
 * chain. Reading them through whatever network the wallet happens to be on
 * would query addresses that do not exist there.
 */
export const publicClient: PublicClient = createPublicClient({
  chain: arcChain,
  transport: http(),
});

/** Read client for the chain the user is currently on (token balances, etc). */
export function usePublicClient(): PublicClient | null {
  const chain = useActiveChain();
  return useMemo(() => getPublicClient(chain), [chain]);
}

/**
 * Legacy-shaped wallet hook, backed by the shared provider.
 *
 * `address` is `''` rather than `null` when disconnected, matching what the
 * existing pages check.
 */
export function useWallet() {
  const {
    address,
    chain,
    chainId,
    wallet,
    wallets,
    isConnecting,
    isUnsupportedChain,
    error,
    connect,
    disconnect,
    switchChain,
  } = useWalletContext();

  const activeChain = useActiveChain();
  const activeReadClient = useMemo(() => getPublicClient(activeChain), [activeChain]);

  /**
   * Wallet client bound to the connected provider and current chain.
   * Rebuilt on change so a write can never be signed against a stale network.
   */
  const walletClient: WalletClient | null = useMemo(() => {
    if (!wallet || !address || !chain || chain.chainId === undefined) return null;
    return createWalletClient({
      account: address,
      chain: toViemChain(chain),
      transport: custom(wallet.provider),
    });
  }, [wallet, address, chain]);

  const defaultChain = getDefaultChain();

  return {
    address: (address ?? '') as `0x${string}` | '',
    chainId,
    isConnected: Boolean(address),
    // "Correct" now means any chain App Kit supports, not one hardcoded id.
    isCorrectNetwork: Boolean(address) && !isUnsupportedChain,
    isConnecting,
    connectError: error,
    hasProvider: wallets.length > 0,
    connect: () => void connect(),
    disconnect,
    switchNetwork: () => void switchChain(chain ?? defaultChain),
    walletClient,
    // Contract reads use the deployment chain; balance reads use the live one.
    publicClient,
    activeReadClient,
    expectedChainId: (chain ?? defaultChain).chainId,
    expectedChainName: (chain ?? defaultChain).label,
  };
}
