'use client';
/**
 * The address whose balances are on screen.
 *
 * There are two kinds of address in this app and exactly one of them can move
 * money:
 *
 *  - The **connected wallet**, from `WalletProvider`. It has a provider and an
 *    adapter behind it, so it can sign.
 *  - A **viewing address**, pasted by hand. It is a 20-byte string and nothing
 *    more. Balances for it can be read, because reading is public; it cannot
 *    sign, approve, or submit anything.
 *
 * This hook resolves which of the two the read-only parts of a screen should
 * display, and it deliberately does *not* touch the signing path. Callers keep
 * using `address` and `adapter` from `WalletProvider` for anything that
 * produces a transaction, so pasting an address cannot widen what the app is
 * able to do — only what it is able to show.
 *
 * Deliberately not persisted. A pasted address is a glance at someone else's
 * position, and restoring it silently on the next visit would leave the page
 * showing balances that are not the user's own, above a confirm button that
 * spends funds that are.
 *
 * Cleared automatically when the connected account changes: after switching
 * wallets the intent is to look at the account just connected, not to stay
 * pinned to whatever was being inspected beforehand.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Address } from 'viem';

export interface ViewingAddressState {
  /** Address to read balances for, or null when nothing is connected or pasted. */
  displayAddress: Address | null;
  /** What `displayAddress` is, for labelling. */
  kind: 'connected' | 'viewing' | 'none';
  /** True when a pasted address is standing in for the connected wallet. */
  isViewingOnly: boolean;
  setViewingAddress: (address: Address) => void;
  clearViewingAddress: () => void;
}

export function useViewingAddress(connected: Address | null): ViewingAddressState {
  const [viewing, setViewing] = useState<Address | null>(null);

  useEffect(() => {
    setViewing(null);
    // Keyed on the connected address: a wallet switch is a change of subject.
  }, [connected]);

  const setViewingAddress = useCallback(
    (address: Address) => {
      // Pasting the address already connected is a no-op rather than a
      // downgrade — it would otherwise relabel a signing account as read-only
      // and hide the controls that account is entitled to.
      if (connected && address.toLowerCase() === connected.toLowerCase()) {
        setViewing(null);
        return;
      }
      setViewing(address);
    },
    [connected]
  );

  const clearViewingAddress = useCallback(() => setViewing(null), []);

  const displayAddress = viewing ?? connected;

  return {
    displayAddress,
    kind: viewing ? 'viewing' : connected ? 'connected' : 'none',
    isViewingOnly: viewing !== null,
    setViewingAddress,
    clearViewingAddress,
  };
}
