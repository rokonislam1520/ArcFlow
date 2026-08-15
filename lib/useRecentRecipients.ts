'use client';
/**
 * Counterparties the wallet has actually sent to, derived from scanned history.
 *
 * Built on `useHistory` rather than a second scan: that hook already reads
 * ERC-20 Transfer logs across every chain in the current mode, so re-reading
 * them here would double the RPC load to learn nothing new.
 *
 * Only outgoing transfers count. An address that sent you funds is not
 * necessarily one you should send to — airdrop and dust senders are the common
 * case, and a "recipients" list seeded with them would be actively misleading.
 *
 * The `sentBefore` predicate this exposes is what makes the first-transfer
 * warning honest. It is deliberately tri-state: false means the scan completed
 * and found nothing, null means the scan cannot answer, and those must not be
 * confused. Treating null as false would raise a scary warning purely because
 * an RPC was slow.
 */
import { useMemo } from 'react';
import type { Address } from 'viem';
import { useHistory, mergeHistory } from './useHistory';
import type { RecentRecipient } from '@/components/RecipientPicker';

export function useRecentRecipients(owner: Address | null, isTestnet: boolean) {
  const history = useHistory(owner, isTestnet);

  /** Distinct outgoing counterparties, newest first. */
  const recipients = useMemo<RecentRecipient[]>(() => {
    const merged = mergeHistory(history.chains);
    const seen = new Set<string>();
    const out: RecentRecipient[] = [];

    for (const transfer of merged) {
      if (transfer.direction !== 'sent') continue;
      const key = transfer.counterparty.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        address: transfer.counterparty,
        chainLabel: transfer.chainLabel,
        timestamp: transfer.timestamp,
      });
    }
    return out;
  }, [history.chains]);

  const sentSet = useMemo(
    () => new Set(recipients.map((r) => r.address.toLowerCase())),
    [recipients]
  );

  /**
   * Whether a prior outgoing transfer to this address was found.
   *
   * Null while loading, and null when every chain failed: with no successful
   * scan there is no evidence either way, and inventing `false` would present
   * an RPC outage as a fact about the user's history.
   */
  const sentBefore = useMemo(() => {
    const answerable = !history.loading && history.healthy > 0;
    return (address: string): boolean | null => {
      if (sentSet.has(address.toLowerCase())) return true;
      return answerable ? false : null;
    };
  }, [history.loading, history.healthy, sentSet]);

  return {
    recipients,
    loading: history.loading,
    /** Chains that answered, so callers can judge how much the scan is worth. */
    healthy: history.healthy,
    sentBefore,
  };
}
