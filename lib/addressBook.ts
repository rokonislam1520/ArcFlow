'use client';
/**
 * Address book — labelled recipients, stored per wallet in the browser.
 *
 * Why this exists: retyping or re-pasting a hex address is the most dangerous
 * manual step in the whole app. A mistyped amount costs a correction; a
 * mistyped recipient is unrecoverable. Naming an address once and picking it by
 * name afterwards removes that step from every subsequent transfer.
 *
 * Scope, stated plainly:
 *
 * - Local to the browser, keyed by the owning wallet. Two wallets on one
 *   machine keep separate books, and a book never leaks between accounts. It
 *   does not sync across devices; that would require the server to hold a map
 *   of who pays whom, which is a materially worse privacy trade than retyping
 *   an address on a second device.
 *
 * - Entries are convenience, never authority. The address the transaction uses
 *   is always the one displayed in the confirm step, and a stored value that no
 *   longer parses as an address is dropped on read rather than half-trusted —
 *   the same rule `merchant.ts` applies to a stored payout wallet.
 *
 * - Addresses are stored checksummed and compared lowercased. EIP-55 casing
 *   carries a typo-detecting checksum worth keeping, but two spellings of one
 *   address are one address and must never produce two entries.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAddress, isAddress, type Address } from 'viem';

/** A saved recipient. */
export interface Contact {
  /** Checksummed address. The stable identity of the entry. */
  address: Address;
  /** User-supplied name. Trimmed, length-capped, never empty. */
  label: string;
  /** Free-text note, e.g. "team payroll". Empty when unused. */
  note: string;
  /**
   * Chain this contact is normally paid on, as an App Kit chain id.
   *
   * Advisory only: an EVM address is valid on every EVM chain, so this is a
   * hint for prefilling, not a restriction. Empty when the contact is
   * chain-agnostic.
   */
  chainId: string;
  /** Unix ms when first saved. */
  createdAt: number;
  /** Unix ms of the last transfer sent to this address from this app. */
  lastUsedAt: number | null;
  /** Transfers sent to this contact through this app. Never decremented. */
  useCount: number;
}

/** Bounds. Storage is shared with every other key on the origin. */
const MAX_CONTACTS = 200;
export const MAX_LABEL_LENGTH = 40;
export const MAX_NOTE_LENGTH = 120;

/**
 * Versioned and namespaced per owner.
 *
 * Keyed by owner because a book belongs to the account that built it, following
 * `snapshots.ts` and `notifications.tsx`. Unlike those it is not split by
 * network mode: a person you pay on mainnet is the same person on testnet, and
 * duplicating the entry would invite editing one copy and trusting the other.
 */
function storageKey(owner: string): string {
  return `arcflow.contacts.v1.${owner.toLowerCase()}`;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** Normalize an untrusted record, or reject it. */
function parseContact(value: unknown): Contact | null {
  if (typeof value !== 'object' || value === null) return null;
  const bag = value as Record<string, unknown>;

  // An unparseable address would misdirect funds, so the entry is discarded
  // rather than shown with a broken target.
  if (typeof bag.address !== 'string' || !isAddress(bag.address)) return null;

  const label = typeof bag.label === 'string' ? bag.label.trim().slice(0, MAX_LABEL_LENGTH) : '';
  if (!label) return null;

  const createdAt = typeof bag.createdAt === 'number' ? bag.createdAt : Date.now();
  const lastUsedAt = typeof bag.lastUsedAt === 'number' ? bag.lastUsedAt : null;
  const useCount = typeof bag.useCount === 'number' && bag.useCount >= 0 ? bag.useCount : 0;

  return {
    address: getAddress(bag.address),
    label,
    note: typeof bag.note === 'string' ? bag.note.trim().slice(0, MAX_NOTE_LENGTH) : '',
    chainId: typeof bag.chainId === 'string' ? bag.chainId : '',
    createdAt,
    lastUsedAt,
    useCount,
  };
}

/**
 * Most useful first: how often, then how recently, then alphabetically.
 *
 * Frequency leads because the addresses worth one tap are the ones paid
 * repeatedly. Recency breaks ties so a new contact does not sink below stale
 * ones with the same count, and the label sort keeps order stable for the
 * untouched majority instead of letting it wobble between reads.
 */
function byUsefulness(a: Contact, b: Contact): number {
  if (b.useCount !== a.useCount) return b.useCount - a.useCount;
  if ((b.lastUsedAt ?? 0) !== (a.lastUsedAt ?? 0)) return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
  return a.label.localeCompare(b.label);
}

/** Read the book for an owner. Never throws; unreadable storage reads empty. */
export function loadContacts(owner: string | null): Contact[] {
  if (!owner || !canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(owner));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Deduplicate on read as well as write: storage may predate a bug fix, and
    // two rows for one address is the one inconsistency a picker cannot
    // present sensibly.
    const seen = new Set<string>();
    const out: Contact[] = [];
    for (const entry of parsed) {
      const contact = parseContact(entry);
      if (!contact) continue;
      const key = contact.address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(contact);
    }
    return out.sort(byUsefulness);
  } catch {
    return [];
  }
}

function saveContacts(owner: string, contacts: Contact[]): void {
  if (!canUseStorage()) return;
  try {
    // Trim the least useful when over budget, so a runaway book cannot fill
    // the origin's quota and break notifications or the portfolio history.
    const bounded = [...contacts].sort(byUsefulness).slice(0, MAX_CONTACTS);
    window.localStorage.setItem(storageKey(owner), JSON.stringify(bounded));
  } catch {
    // Quota or a blocked store: the in-memory list still serves this session.
  }
}

/** Case-insensitive lookup, because casing is presentation, not identity. */
export function findContact(contacts: Contact[], address: string): Contact | null {
  const needle = address.toLowerCase();
  return contacts.find((c) => c.address.toLowerCase() === needle) ?? null;
}

/** Match on label, note, or address prefix. */
export function searchContacts(contacts: Contact[], query: string): Contact[] {
  const q = query.trim().toLowerCase();
  if (!q) return contacts;
  return contacts.filter(
    (c) =>
      c.label.toLowerCase().includes(q) ||
      c.note.toLowerCase().includes(q) ||
      c.address.toLowerCase().startsWith(q)
  );
}

/**
 * The address book for one wallet.
 *
 * Reads run in an effect, not during render: touching localStorage inline would
 * make server and first client markup disagree and trigger a hydration
 * mismatch, the same reason `network.ts` and `theme.ts` defer their reads.
 */
export function useAddressBook(owner: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Reset before loading so switching accounts cannot show the previous
    // wallet's contacts for a frame.
    setContacts([]);
    setLoaded(false);
    setContacts(loadContacts(owner));
    setLoaded(true);
  }, [owner]);

  /** Apply a change and persist it under the current owner. */
  const commit = useCallback(
    (next: Contact[]) => {
      const sorted = [...next].sort(byUsefulness);
      setContacts(sorted);
      if (owner) saveContacts(owner, sorted);
      return sorted;
    },
    [owner]
  );

  /**
   * Add or update by address.
   *
   * Upsert rather than insert: saving an address already present means the user
   * is renaming it, and a second row for the same address would leave two
   * labels for one destination with no way to tell which is current.
   */
  const save = useCallback(
    (input: { address: string; label: string; note?: string; chainId?: string }) => {
      if (!isAddress(input.address)) return null;

      const address = getAddress(input.address);
      const label = input.label.trim().slice(0, MAX_LABEL_LENGTH);
      if (!label) return null;

      const existing = findContact(contacts, address);
      const contact: Contact = {
        address,
        label,
        note: (input.note ?? existing?.note ?? '').trim().slice(0, MAX_NOTE_LENGTH),
        chainId: input.chainId ?? existing?.chainId ?? '',
        // Preserve history across a rename: usage is a property of the
        // destination, not of the name currently attached to it.
        createdAt: existing?.createdAt ?? Date.now(),
        lastUsedAt: existing?.lastUsedAt ?? null,
        useCount: existing?.useCount ?? 0,
      };

      commit([contact, ...contacts.filter((c) => c.address.toLowerCase() !== address.toLowerCase())]);
      return contact;
    },
    [contacts, commit]
  );

  const remove = useCallback(
    (address: string) => {
      const needle = address.toLowerCase();
      commit(contacts.filter((c) => c.address.toLowerCase() !== needle));
    },
    [contacts, commit]
  );

  /**
   * Record a completed transfer to an address.
   *
   * Only called after the SDK resolves, so the counters reflect money that
   * actually moved rather than attempts. Unknown addresses are ignored: a
   * transfer is not consent to be remembered, and silently saving every
   * one-off recipient would fill the book with entries the user never named.
   */
  const recordUse = useCallback(
    (address: string) => {
      const needle = address.toLowerCase();
      const existing = contacts.find((c) => c.address.toLowerCase() === needle);
      if (!existing) return;
      commit(
        contacts.map((c) =>
          c.address.toLowerCase() === needle
            ? { ...c, lastUsedAt: Date.now(), useCount: c.useCount + 1 }
            : c
        )
      );
    },
    [contacts, commit]
  );

  /** Lowercased addresses, for O(1) "have I saved this?" checks. */
  const knownAddresses = useMemo(
    () => new Set(contacts.map((c) => c.address.toLowerCase())),
    [contacts]
  );

  return {
    contacts,
    /** False until the first read completes, so the UI can avoid a false "empty book". */
    loaded,
    knownAddresses,
    save,
    remove,
    recordUse,
    /** Resolve an address to its contact, or null when unsaved. */
    lookup: useCallback((address: string) => findContact(contacts, address), [contacts]),
  };
}
