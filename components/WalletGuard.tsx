'use client';

import type { ReactNode } from 'react';
import { useWallet } from '@/lib/useWallet';

interface Props {
  /** Rendered only when a wallet is connected, on the right chain, and configured. */
  children: ReactNode;
  /** False when the contract addresses this page needs are missing from env. */
  configured?: boolean;
  featureName?: string;
}

/**
 * Gate states are centred in the content area. No page padding here: the shell's
 * <main> already supplies the gutter, and adding more would indent these panels
 * further than the page content they stand in for.
 */
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-lg mx-auto animate-in">
      <div className="glass p-10 text-center">{children}</div>
    </div>
  );
}

/**
 * Gates a page behind: wallet installed -> connected -> correct network ->
 * contracts configured. Each failure state explains itself and offers the
 * action that resolves it.
 */
export function WalletGuard({ children, configured = true, featureName = 'This feature' }: Props) {
  const {
    hasProvider,
    isConnected,
    isCorrectNetwork,
    isConnecting,
    connectError,
    connect,
    switchNetwork,
    chainId,
    expectedChainName,
    expectedChainId,
  } = useWallet();

  if (!hasProvider) {
    return (
      <Panel>
        <div className="text-5xl mb-4">🦊</div>
        <h2 className="text-2xl font-bold mb-2">No Wallet Detected</h2>
        <p className="text-ink-secondary mb-6">
          Install MetaMask (or another EIP-1193 wallet) to use ArcFlow.
        </p>
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-arc px-8 py-3 text-lg inline-block"
        >
          Get MetaMask
        </a>
      </Panel>
    );
  }

  if (!isConnected) {
    return (
      <Panel>
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-2xl font-bold mb-2">Wallet Not Connected</h2>
        <p className="text-ink-secondary mb-6">Connect your wallet to continue.</p>
        <button onClick={connect} disabled={isConnecting} className="btn-arc px-8 py-3 text-lg">
          {isConnecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
        {connectError && <p className="text-danger text-sm mt-4">{connectError}</p>}
      </Panel>
    );
  }

  if (!isCorrectNetwork) {
    return (
      <Panel>
        <div className="text-5xl mb-4">🌐</div>
        <h2 className="text-2xl font-bold mb-2">Wrong Network</h2>
        <p className="text-ink-secondary mb-6">
          ArcFlow runs on <span className="text-accent-text font-semibold">{expectedChainName}</span>{' '}
          (chain {expectedChainId}). Your wallet is on chain {chainId ?? 'unknown'}.
        </p>
        <button onClick={switchNetwork} className="btn-arc px-8 py-3 text-lg">
          Switch Network
        </button>
      </Panel>
    );
  }

  if (!configured) {
    return (
      <Panel>
        <div className="text-5xl mb-4">⚙️</div>
        <h2 className="text-2xl font-bold mb-2">Not Configured</h2>
        <p className="text-ink-secondary">
          {featureName} needs its contract addresses set in <code className="text-accent-text">.env.local</code>.
          Deploy the contracts and copy the printed values across.
        </p>
      </Panel>
    );
  }

  return <>{children}</>;
}
