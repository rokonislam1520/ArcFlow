'use client';
/**
 * Notifications driven by real blockchain events.
 *
 * Two genuine sources, no synthetic ones:
 *
 *  1. Transactions this app submitted. `watch()` polls for the receipt and
 *     resolves to confirmed or failed based on `receipt.status`. A reverted
 *     transaction is reported as failed — silently treating a revert as success
 *     is how a wallet tells someone their money moved when it did not.
 *
 *  2. Incoming transfers discovered in logs. The first history load establishes
 *     a baseline of already-known transaction hashes rather than announcing
 *     them: a notification means "this happened just now", and firing twenty on
 *     page load for week-old transfers would make the feature noise to be
 *     dismissed rather than read.
 *
 * Read state persists per address so a reload does not resurrect dismissed
 * items. The notification bodies themselves are re-derived from chain data on
 * each load and never persisted — stored copies would drift from the chain and
 * could outlive a reorg.
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
import type { Address, Hash } from 'viem';
import type { ArcChain } from './chains';
import { getPublicClient } from './clients';
import { publishRefresh } from './refresh';
import { useWallet, useActiveChain } from './WalletProvider';
import { useTransfers } from './useTransfers';

export type NotificationKind = 'pending' | 'confirmed' | 'failed' | 'received';

export interface AppNotification {
  /** Stable across re-derivation: `${chainId}:${txHash}`. */
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  chainId: string;
  chainLabel: string;
  txHash: Hash;
  /** Milliseconds. For pending items this is submission time, not block time. */
  at: number;
  read: boolean;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  /**
   * Track a transaction this app just submitted through to its receipt.
   * Resolves once the outcome is known.
   */
  watch: (args: {
    chain: ArcChain;
    txHash: Hash;
    title: string;
    body: string;
  }) => Promise<'confirmed' | 'failed' | 'unknown'>;
  /** Announce transfers found in logs that were not present at baseline. */
  announceIncoming: (items: Array<Omit<AppNotification, 'read' | 'kind'>>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

/** Read-state key, scoped per address so switching accounts is a clean slate. */
const readKey = (address: string | null) =>
  address ? `arcflow.notifications.read.${address.toLowerCase()}` : null;

function loadReadIds(address: string | null): Set<string> {
  const key = readKey(address);
  if (!key || typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? new Set<string>(JSON.parse(raw)) : new Set();
  } catch {
    // Corrupt or unavailable storage is not worth failing over; the cost is
    // one already-read item reappearing as unread.
    return new Set();
  }
}

function persistReadIds(address: string | null, ids: Set<string>): void {
  const key = readKey(address);
  if (!key || typeof window === 'undefined') return;
  try {
    // Bounded so a long-lived wallet cannot grow this without limit.
    window.localStorage.setItem(key, JSON.stringify([...ids].slice(-500)));
  } catch {
    // Private mode or a full quota; losing read state is survivable.
  }
}

/** Poll interval and ceiling for receipt confirmation. */
const RECEIPT_POLL_MS = 3_000;
const RECEIPT_TIMEOUT_MS = 180_000;

export function NotificationProvider({
  address,
  children,
}: {
  address: string | null;
  children: ReactNode;
}) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const readIds = useRef<Set<string>>(new Set());
  const dismissed = useRef<Set<string>>(new Set());

  // Reset when the account changes: another address's activity is not this
  // user's, and carrying it over would misattribute someone else's transfers.
  useEffect(() => {
    readIds.current = loadReadIds(address);
    dismissed.current = new Set();
    setNotifications([]);
  }, [address]);

  const upsert = useCallback((next: AppNotification) => {
    if (dismissed.current.has(next.id)) return;
    setNotifications((prev) => {
      const existing = prev.findIndex((n) => n.id === next.id);
      const withRead = { ...next, read: readIds.current.has(next.id) };
      if (existing === -1) return [withRead, ...prev].slice(0, 100);
      // Replace in place so a pending item becomes confirmed without jumping
      // to the top and without losing its position in the list.
      const copy = [...prev];
      copy[existing] = { ...withRead, read: prev[existing].read };
      return copy;
    });
  }, []);

  const watch = useCallback(
    async ({
      chain,
      txHash,
      title,
      body,
    }: {
      chain: ArcChain;
      txHash: Hash;
      title: string;
      body: string;
    }): Promise<'confirmed' | 'failed' | 'unknown'> => {
      const id = `${chain.id}:${txHash}`;
      const base = {
        id,
        chainId: chain.id,
        chainLabel: chain.label,
        txHash,
        at: Date.now(),
      };

      upsert({ ...base, kind: 'pending', title, body, read: false });

      const client = getPublicClient(chain);
      if (!client) {
        // Without an RPC the outcome is genuinely unknown. Saying "confirmed"
        // would be a guess presented as fact — but so would "failed", which is
        // why this stays pending rather than colouring itself red.
        upsert({
          ...base,
          kind: 'pending',
          title: `${title} — status unknown`,
          body: `No RPC endpoint for ${chain.label}, so this could not be verified on chain.`,
          read: false,
        });
        return 'unknown';
      }

      try {
        const receipt = await client.waitForTransactionReceipt({
          hash: txHash,
          pollingInterval: RECEIPT_POLL_MS,
          timeout: RECEIPT_TIMEOUT_MS,
        });

        const ok = receipt.status === 'success';
        upsert({
          ...base,
          kind: ok ? 'confirmed' : 'failed',
          title: ok ? title : `${title} failed`,
          body: ok
            ? body
            : `Reverted on chain in block ${receipt.blockNumber}. No funds were transferred.`,
          at: Date.now(),
          read: false,
        });

        // Balances and history are stale the moment this lands.
        if (ok) publishRefresh();
        return ok ? 'confirmed' : 'failed';
      } catch (err) {
        // A timeout is not a failure: the transaction may still be in the
        // mempool. Reporting it as failed would be wrong, so this says exactly
        // what is known.
        upsert({
          ...base,
          kind: 'pending',
          title: `${title} — still pending`,
          body:
            err instanceof Error && /timed out/i.test(err.message)
              ? 'Not yet included in a block. It may still confirm.'
              : 'Could not read the receipt. The transaction may still confirm.',
          at: Date.now(),
          read: false,
        });
        return 'unknown';
      }
    },
    [upsert]
  );

  const announceIncoming = useCallback(
    (items: Array<Omit<AppNotification, 'read' | 'kind'>>) => {
      for (const item of items) upsert({ ...item, kind: 'received', read: false });
    },
    [upsert]
  );

  const markRead = useCallback(
    (id: string) => {
      readIds.current.add(id);
      persistReadIds(address, readIds.current);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    },
    [address]
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      for (const n of prev) readIds.current.add(n.id);
      persistReadIds(address, readIds.current);
      return prev.map((n) => ({ ...n, read: true }));
    });
  }, [address]);

  const dismiss = useCallback((id: string) => {
    dismissed.current.add(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications((prev) => {
      for (const n of prev) dismissed.current.add(n.id);
      return [];
    });
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      watch,
      announceIncoming,
      markRead,
      markAllRead,
      dismiss,
      clearAll,
    }),
    [notifications, watch, announceIncoming, markRead, markAllRead, dismiss, clearAll]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
}

/**
 * Binds the provider to the connected wallet.
 *
 * Exists so the root layout can stay a server component: it cannot call
 * `useWallet` itself to learn which address the notifications belong to.
 */
export function WalletNotificationProvider({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  return <NotificationProvider address={address}>{children}</NotificationProvider>;
}

/**
 * Watches the active chain for incoming transfers on every page.
 *
 * Renders nothing. Mounted once at the root so a transfer that arrives while
 * the user is on, say, the Swap page still surfaces — notifications that only
 * work on the page already showing the data are not much use.
 *
 * Scoped to the active chain rather than all of them: a full multichain poll on
 * every page would mean dozens of RPC calls a minute for a background feature.
 * The History page reads every chain when it is actually open.
 */
export function ActivityWatcher() {
  const { address } = useWallet();
  const chain = useActiveChain();
  const { transfers } = useTransfers(chain, (address ?? null) as Address | null, 25);

  // `useTransfers` names this field `symbol`; the watcher wants `tokenSymbol`.
  const normalized = useMemo(
    () =>
      transfers.map((t) => ({
        direction: t.direction,
        txHash: t.txHash,
        chainId: chain?.id ?? '',
        chainLabel: chain?.label ?? '',
        amount: t.amount,
        tokenSymbol: t.symbol,
        counterparty: t.counterparty,
        timestamp: t.timestamp,
      })),
    [transfers, chain]
  );

  useIncomingWatcher(normalized, address ?? null);
  return null;
}

/**
 * Records transactions submitted through App Kit as notifications.
 *
 * App Kit resolves only after its own confirmation, so by the time a hash
 * appears the transfer has usually landed. `watch()` still re-reads the receipt
 * rather than trusting that: the receipt is what proves the transaction
 * succeeded rather than reverted, and it is cheap to check.
 *
 * Each hash is watched once. Without that guard every re-render of a page
 * sitting on a success state would re-announce the same transaction.
 */
export function useOpNotifications(
  state: { stage: string; hashes: string[]; kind: string | null },
  chain: ArcChain | null
): void {
  const { watch } = useNotifications();
  const watched = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!chain || state.hashes.length === 0) return;
    // Only once the operation has actually been broadcast.
    if (state.stage !== 'success' && state.stage !== 'pending') return;

    for (const hash of state.hashes) {
      const key = `${chain.id}:${hash}`;
      if (watched.current.has(key)) continue;
      watched.current.add(key);

      const label =
        state.kind === 'bridge' ? 'Bridge' : state.kind === 'swap' ? 'Swap' : 'Transfer';

      void watch({
        chain,
        txHash: hash as Hash,
        title: `${label} submitted`,
        body: `${label} confirmed on ${chain.label}.`,
      });
    }
  }, [state.stage, state.hashes, state.kind, chain, watch]);
}

/**
 * Turn newly observed incoming transfers into notifications.
 *
 * The first run only records what is already there. Without that baseline,
 * opening the app would announce every historical transfer as though it had
 * just arrived.
 */
export function useIncomingWatcher(
  transfers: Array<{
    direction: 'sent' | 'received';
    txHash: Hash;
    chainId: string;
    chainLabel: string;
    amount: string;
    tokenSymbol: string;
    counterparty: Address;
    timestamp: number | null;
  }>,
  owner: string | null
) {
  const { announceIncoming } = useNotifications();
  const seen = useRef<Set<string> | null>(null);

  // A new account means a new baseline.
  useEffect(() => {
    seen.current = null;
  }, [owner]);

  useEffect(() => {
    if (!owner || transfers.length === 0) return;

    const incoming = transfers.filter((t) => t.direction === 'received');

    if (seen.current === null) {
      seen.current = new Set(incoming.map((t) => `${t.chainId}:${t.txHash}`));
      return;
    }

    const fresh = incoming.filter((t) => !seen.current!.has(`${t.chainId}:${t.txHash}`));
    if (fresh.length === 0) return;

    for (const t of fresh) seen.current.add(`${t.chainId}:${t.txHash}`);

    announceIncoming(
      fresh.map((t) => ({
        id: `${t.chainId}:${t.txHash}`,
        title: `Received ${Number(t.amount).toLocaleString('en-US', {
          maximumFractionDigits: 6,
        })} ${t.tokenSymbol}`,
        body: `From ${t.counterparty.slice(0, 6)}…${t.counterparty.slice(-4)} on ${t.chainLabel}`,
        chainId: t.chainId,
        chainLabel: t.chainLabel,
        txHash: t.txHash,
        // Block time when known; otherwise discovery time, which is close for
        // a transfer that has only just appeared.
        at: t.timestamp !== null ? t.timestamp * 1000 : Date.now(),
      }))
    );
  }, [transfers, owner, announceIncoming]);
}
