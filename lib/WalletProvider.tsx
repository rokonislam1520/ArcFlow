'use client';
/**
 * Multichain wallet layer.
 *
 * Responsibilities:
 *  - Discover wallets via EIP-6963 (the standard MetaMask and others announce
 *    on). `window.ethereum` is only a last-resort fallback because with several
 *    extensions installed it is whichever one won the race to patch it.
 *  - Build the App Kit viem adapter that every Send/Swap/Bridge call needs.
 *  - Track the connected account and chain, and switch/add networks on demand.
 *
 * The adapter is rebuilt whenever the account or chain changes; a stale adapter
 * would sign against the wrong network.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { EIP1193Provider } from 'viem';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import {
  getChainByEvmId,
  getDefaultChain,
  toAddChainParams,
  type ArcChain,
} from './chains';
import { useNetworkMode } from './network';

export interface DiscoveredWallet {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
  provider: EIP1193Provider;
}

type EIP6963Detail = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: EIP1193Provider;
};

declare global {
  interface WindowEventMap {
    'eip6963:announceProvider': CustomEvent<EIP6963Detail>;
  }
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

/** App Kit's adapter type is internal, so reference it structurally. */
export type ViemAdapter = Awaited<ReturnType<typeof createViemAdapterFromProvider>>;

interface WalletState {
  wallets: DiscoveredWallet[];
  wallet: DiscoveredWallet | null;
  address: `0x${string}` | null;
  /** Chain the wallet is on, if App Kit supports it. */
  chain: ArcChain | null;
  /** Raw wallet chain id, set even when the chain is unsupported. */
  chainId: number | null;
  adapter: ViemAdapter | null;
  isConnecting: boolean;
  error: string | null;
  /** True when connected to a network App Kit cannot operate on. */
  isUnsupportedChain: boolean;
  connect: (uuid?: string) => Promise<void>;
  disconnect: () => void;
  switchChain: (chain: ArcChain) => Promise<void>;
  clearError: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

/** Wallet errors arrive in several shapes; extract a code defensively. */
function errorCode(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (typeof e.code === 'number') return e.code;
  if (typeof e.cause?.code === 'number') return e.cause.code;
  return undefined;
}

function errorMessage(err: unknown): string {
  const code = errorCode(err);
  // 4001 (EIP-1193) and 4100 mean the user declined. Not a failure worth alarming about.
  if (code === 4001 || code === 4100) return 'Request rejected in wallet.';
  if (code === -32002) return 'A wallet request is already pending. Open your wallet.';
  if (err instanceof Error && err.message) return err.message;
  return 'Unexpected wallet error.';
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [wallet, setWallet] = useState<DiscoveredWallet | null>(null);
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [adapter, setAdapter] = useState<ViemAdapter | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avoids setState after unmount during the async connect flow.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // EIP-6963 discovery. Wallets may announce late, so we keep listening
  // instead of resolving after a fixed timeout.
  useEffect(() => {
    const found = new Map<string, DiscoveredWallet>();

    const onAnnounce = (event: WindowEventMap['eip6963:announceProvider']) => {
      const { info, provider } = event.detail;
      found.set(info.uuid, { ...info, provider });
      setWallets([...found.values()]);
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Fallback for wallets that never implemented EIP-6963.
    const timer = window.setTimeout(() => {
      if (found.size === 0 && window.ethereum) {
        found.set('injected', {
          uuid: 'injected',
          name: 'Browser Wallet',
          icon: '',
          rdns: 'injected',
          provider: window.ethereum,
        });
        setWallets([...found.values()]);
      }
    }, 400);

    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      window.clearTimeout(timer);
    };
  }, []);

  /** Rebuild the adapter so signing always targets the current chain. */
  const refreshAdapter = useCallback(async (provider: EIP1193Provider) => {
    try {
      const next = await createViemAdapterFromProvider({ provider });
      if (mounted.current) setAdapter(next);
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
    }
  }, []);

  const connect = useCallback(
    async (uuid?: string) => {
      setError(null);

      const target = uuid ? wallets.find((w) => w.uuid === uuid) : wallets[0];
      if (!target) {
        setError('No wallet detected. Install MetaMask or another EIP-6963 wallet.');
        return;
      }

      setIsConnecting(true);
      try {
        await target.provider.request({
          method: 'eth_requestAccounts',
          params: undefined,
        });
        const accounts = (await target.provider.request({
          method: 'eth_accounts',
          params: undefined,
        })) as string[];

        if (!accounts?.[0]) throw new Error('Wallet returned no accounts.');

        const hexChain = (await target.provider.request({
          method: 'eth_chainId',
          params: undefined,
        })) as string;

        if (!mounted.current) return;
        setWallet(target);
        setAddress(accounts[0] as `0x${string}`);
        setChainId(Number.parseInt(hexChain, 16));
        await refreshAdapter(target.provider);

        // Remember the choice so a refresh does not force reconnecting.
        window.localStorage.setItem('arcflow.wallet', target.rdns);
      } catch (err) {
        if (mounted.current) setError(errorMessage(err));
      } finally {
        if (mounted.current) setIsConnecting(false);
      }
    },
    [wallets, refreshAdapter]
  );

  const disconnect = useCallback(() => {
    setWallet(null);
    setAddress(null);
    setChainId(null);
    setAdapter(null);
    setError(null);
    window.localStorage.removeItem('arcflow.wallet');
  }, []);

  /** Switch networks, adding the chain first if the wallet lacks it. */
  const switchChain = useCallback(
    async (target: ArcChain) => {
      if (!wallet) {
        setError('Connect a wallet first.');
        return;
      }
      if (target.chainId === undefined) {
        setError(`${target.label} is not an EVM chain.`);
        return;
      }

      const hexId = `0x${target.chainId.toString(16)}`;
      setError(null);
      try {
        await wallet.provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: hexId }],
        });
      } catch (err) {
        // 4902 means the chain is unknown to the wallet. Arc Testnet will hit
        // this for most users, so add it then retry rather than dead-ending.
        if (errorCode(err) === 4902) {
          try {
            await wallet.provider.request({
              method: 'wallet_addEthereumChain',
              params: [toAddChainParams(target)],
            });
          } catch (addErr) {
            setError(errorMessage(addErr));
            return;
          }
        } else {
          setError(errorMessage(err));
          return;
        }
      }
      await refreshAdapter(wallet.provider);
    },
    [wallet, refreshAdapter]
  );

  // React to account/chain changes made inside the wallet UI. Without this the
  // app would keep showing a stale account and sign on the wrong network.
  useEffect(() => {
    if (!wallet) return;
    const provider = wallet.provider as EIP1193Provider & {
      on?: (e: string, h: (...args: never[]) => void) => void;
      removeListener?: (e: string, h: (...args: never[]) => void) => void;
    };

    const onAccounts = (...args: never[]) => {
      const accounts = args[0] as unknown as string[];
      if (!accounts?.length) {
        // User revoked access from inside the wallet.
        disconnect();
        return;
      }
      setAddress(accounts[0] as `0x${string}`);
    };

    const onChain = (...args: never[]) => {
      const hex = args[0] as unknown as string;
      setChainId(Number.parseInt(hex, 16));
      void refreshAdapter(wallet.provider);
    };

    provider.on?.('accountsChanged', onAccounts);
    provider.on?.('chainChanged', onChain);
    return () => {
      provider.removeListener?.('accountsChanged', onAccounts);
      provider.removeListener?.('chainChanged', onChain);
    };
  }, [wallet, disconnect, refreshAdapter]);

  // Silently restore a previous session without prompting the wallet.
  useEffect(() => {
    if (wallet || wallets.length === 0) return;
    const saved = window.localStorage.getItem('arcflow.wallet');
    if (!saved) return;
    const match = wallets.find((w) => w.rdns === saved);
    if (!match) return;

    void (async () => {
      const accounts = (await match.provider.request({
        method: 'eth_accounts',
        params: undefined,
      })) as string[];
      // Empty means the site is no longer authorized; stay disconnected.
      if (accounts?.[0]) void connect(match.uuid);
    })();
  }, [wallets, wallet, connect]);

  const chain = useMemo(
    () => (chainId === null ? null : getChainByEvmId(chainId) ?? null),
    [chainId]
  );

  const value = useMemo<WalletState>(
    () => ({
      wallets,
      wallet,
      address,
      chain,
      chainId,
      adapter,
      isConnecting,
      error,
      isUnsupportedChain: chainId !== null && chain === null,
      connect,
      disconnect,
      switchChain,
      clearError: () => setError(null),
    }),
    [
      wallets,
      wallet,
      address,
      chain,
      chainId,
      adapter,
      isConnecting,
      error,
      connect,
      disconnect,
      switchChain,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
}

/**
 * Chain to operate on: the wallet's chain when it is both supported and in the
 * selected network mode, otherwise that mode's default chain.
 *
 * The mode check matters. A wallet sitting on Ethereum mainnet while the app is
 * in testnet mode is on a chain App Kit supports, but acting on it would mean
 * quoting testnet routes against real funds. Treating that as a mismatch keeps
 * test money and real money strictly apart.
 */
export function useActiveChain(): ArcChain {
  const { chain } = useWallet();
  const { isTestnet } = useNetworkMode();

  if (chain && chain.isTestnet === isTestnet) return chain;
  return getDefaultChain(isTestnet);
}

/**
 * Whether the wallet needs to move networks before it can transact, and where.
 *
 * Returns null when the wallet is already on a usable chain. `target` is the
 * chain to switch to, so callers can offer a one-click fix rather than telling
 * the user to go hunting in their wallet.
 */
export function useChainMismatch(): {
  reason: 'unsupported' | 'wrong-network-mode';
  target: ArcChain;
} | null {
  const { chain, chainId, address } = useWallet();
  const { isTestnet } = useNetworkMode();

  // Nothing to fix before a wallet is connected.
  if (!address || chainId === null) return null;

  if (!chain) return { reason: 'unsupported', target: getDefaultChain(isTestnet) };
  if (chain.isTestnet !== isTestnet) {
    return { reason: 'wrong-network-mode', target: getDefaultChain(isTestnet) };
  }
  return null;
}
