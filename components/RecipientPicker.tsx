'use client';
/**
 * Recipient picker — choose a saved contact, or a counterparty already seen
 * on-chain, instead of pasting an address.
 *
 * Two sources, kept visually distinct because they carry different weight:
 *
 * - Saved contacts are addresses the user deliberately named. They are the
 *   trusted list and lead the dialog.
 * - Recent counterparties come from `useHistory`'s log scan. They are evidence
 *   of a real prior transfer, which is a genuine signal, but the user never
 *   confirmed the address means what they think — so they sit in a separate
 *   section and are labelled as history, not as contacts.
 *
 * The scan-window caveat is inherited from `useHistory` and surfaced here
 * rather than hidden: a counterparty older than the scanned window will not
 * appear, and implying the list is exhaustive would make its absence read as
 * "we have never transacted", which is a claim this data cannot support.
 *
 * Modal shape, escape-to-close and backdrop behaviour follow `TokenSelector`,
 * so a picker feels the same wherever it opens.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAddress } from 'viem';
import {
  MAX_LABEL_LENGTH,
  MAX_NOTE_LENGTH,
  searchContacts,
  type Contact,
} from '@/lib/addressBook';
import { shortAddress } from '@/lib/swapTokens';

/** A counterparty drawn from scanned history, offered alongside contacts. */
export interface RecentRecipient {
  address: string;
  /** Chain label where the transfer was seen, for context. */
  chainLabel: string;
  /** Unix seconds of the transfer. Null when the block timestamp was unavailable. */
  timestamp: number | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (address: string) => void;
  contacts: Contact[];
  /** Counterparties from history, newest first. Already excludes the user. */
  recents?: RecentRecipient[];
  /** True while history is still scanning, so an empty list is not called empty. */
  recentsLoading?: boolean;
  /** Save handler, so a new address can be named without leaving the dialog. */
  onSave: (input: { address: string; label: string; note?: string }) => unknown;
  onRemove: (address: string) => void;
}

/** Relative age, for a list where exact timestamps add noise. */
function timeAgo(seconds: number | null): string {
  if (seconds === null) return '';
  const delta = Date.now() / 1000 - seconds;
  if (delta < 3600) return `${Math.max(1, Math.floor(delta / 60))}m ago`;
  if (delta < 86_400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86_400)}d ago`;
}

/**
 * A deterministic accent per address, so a contact keeps one colour everywhere.
 *
 * Hashing the address rather than storing a colour means the palette needs no
 * migration and two contacts never collide inconsistently between sessions.
 */
function addressAccent(address: string): string {
  let hash = 0;
  for (let i = 2; i < address.length; i += 1) {
    hash = (hash * 31 + address.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 65% 52%)`;
}

/** Initials from a label, for the avatar disc. */
function initials(label: string): string {
  const parts = label.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/** Mounts the body only while open, so nothing renders behind a closed dialog. */
export function RecipientPicker(props: Props) {
  if (!props.isOpen) return null;
  return <RecipientPickerBody {...props} />;
}

function RecipientPickerBody({
  onClose,
  onSelect,
  contacts,
  recents = [],
  recentsLoading = false,
  onSave,
  onRemove,
}: Props) {
  const [query, setQuery] = useState('');
  /** The address being named, or null when not adding. */
  const [draftAddress, setDraftAddress] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filteredContacts = useMemo(() => searchContacts(contacts, query), [contacts, query]);

  const savedSet = useMemo(
    () => new Set(contacts.map((c) => c.address.toLowerCase())),
    [contacts]
  );

  /**
   * History counterparties that are not already saved.
   *
   * Showing an address in both sections would ask the user to choose between
   * two rows for one destination, where the contact row is strictly more
   * informative.
   */
  const filteredRecents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recents
      .filter((r) => !savedSet.has(r.address.toLowerCase()))
      .filter((r) => (q ? r.address.toLowerCase().startsWith(q) : true));
  }, [recents, savedSet, query]);

  /** A pasted address in the search box is directly usable. */
  const pastedAddress = useMemo(() => {
    const q = query.trim();
    return isAddress(q) && !savedSet.has(q.toLowerCase()) ? q : null;
  }, [query, savedSet]);

  const choose = useCallback(
    (address: string) => {
      onSelect(address);
      onClose();
    },
    [onSelect, onClose]
  );

  /** Begin naming an address, prefilled from the row that triggered it. */
  const beginSave = useCallback((address: string) => {
    setDraftAddress(address);
    setDraftLabel('');
    setDraftNote('');
    setAdding(true);
  }, []);

  const commitSave = useCallback(() => {
    if (!isAddress(draftAddress) || !draftLabel.trim()) return;
    onSave({ address: draftAddress, label: draftLabel, note: draftNote });
    setAdding(false);
    setDraftAddress('');
    setDraftLabel('');
    setDraftNote('');
    // Clear the query too: it usually holds the address just saved, which
    // would otherwise filter the list down to the single new contact.
    setQuery('');
  }, [draftAddress, draftLabel, draftNote, onSave]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 animate-in"

      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Select recipient"
    >
      <div
        className="w-full max-w-md h-[88vh] sm:h-[600px] bg-surface-card border-2 border-hairline

          rounded-t-3xl sm:rounded-4xl shadow-float flex flex-col overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-hairline shrink-0">
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight">Recipient</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-surface-hover/[0.06]
              active:scale-95 flex items-center justify-center transition-all duration-200"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {adding ? (
          /* Naming form. Replaces the list rather than stacking a second dialog
             on top of it, which on a phone-sized sheet would leave neither
             usable. */
          <div className="flex-1 flex flex-col p-4 sm:p-5 gap-4 overflow-y-auto">
            <div>
              <label className="block text-sm text-ink-secondary mb-2">Address</label>
              <input
                value={draftAddress}
                onChange={(e) => setDraftAddress(e.target.value.trim())}
                placeholder="0x…"
                spellCheck={false}
                className="w-full bg-surface-input border border-hairline rounded-xl px-4 py-3 font-mono text-xs focus:border-arc-500 outline-none"
              />
              {draftAddress && !isAddress(draftAddress) && (
                <p className="mt-2 text-xs text-warning">That is not a valid address.</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-ink-secondary mb-2">Name</label>
              <input
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value.slice(0, MAX_LABEL_LENGTH))}
                placeholder="e.g. Payroll wallet"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the address is prefilled; the name is what needs typing
                autoFocus
                className="w-full bg-surface-input border border-hairline rounded-xl px-4 py-3 text-sm focus:border-arc-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-ink-secondary mb-2">
                Note <span className="text-ink-muted">(optional)</span>
              </label>
              <input
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                placeholder="What this address is for"
                className="w-full bg-surface-input border border-hairline rounded-xl px-4 py-3 text-sm focus:border-arc-500 outline-none"
              />
            </div>

            <p className="text-xs text-ink-muted">
              Saved in this browser only, under your connected wallet. It is never sent to a server.
            </p>

            <div className="flex gap-2 mt-auto pt-2">
              <button
                onClick={commitSave}
                disabled={!isAddress(draftAddress) || !draftLabel.trim()}
                className="btn-arc flex-1 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save contact
              </button>
              <button
                onClick={() => setAdding(false)}
                className="px-4 py-2.5 rounded-xl text-sm bg-surface-input border border-hairline hover:bg-surface-hover/[0.06]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3 sm:p-4 border-b border-hairline shrink-0 space-y-2">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                </svg>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search names or paste an address"
                  spellCheck={false}
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- focus belongs in the search field of a search dialog
                  autoFocus
                  className="w-full pl-9 pr-3 py-2.5 bg-black/25 border border-hairline rounded-xl text-sm text-ink-primary outline-none
                    focus:border-arc-500 placeholder:text-ink-muted"
                />
              </div>

              {/* A pasted address is immediately actionable, with the option to
                  name it in the same gesture. */}
              {pastedAddress && (
                <div className="flex items-center gap-2 rounded-xl border border-arc-500/30 bg-arc-500/5 px-3 py-2">
                  <span className="font-mono text-xs text-ink-secondary truncate flex-1">
                    {shortAddress(pastedAddress, 10, 8)}
                  </span>
                  <button
                    onClick={() => beginSave(pastedAddress)}
                    className="text-xs text-accent-text hover:underline shrink-0"
                  >
                    Name it
                  </button>
                  <button
                    onClick={() => choose(pastedAddress)}
                    className="btn-arc px-3 py-1.5 text-xs shrink-0"
                  >
                    Use
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Saved contacts */}
              <div className="px-3 sm:px-4 pt-3">
                <div className="flex items-center justify-between px-1 pb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
                    Saved
                  </span>
                  <button
                    onClick={() => beginSave('')}
                    className="text-xs text-accent-text hover:underline"
                  >
                    + Add
                  </button>
                </div>

                {filteredContacts.length === 0 ? (
                  <p className="px-1 pb-3 text-xs text-ink-muted">
                    {contacts.length === 0
                      ? 'No saved recipients yet. Add one, or send a transfer and save the address afterwards.'
                      : 'No contact matches that search.'}
                  </p>
                ) : (
                  <div className="space-y-1 pb-2">
                    {filteredContacts.map((c) => (
                      <div
                        key={c.address}
                        className="group flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface-hover/[0.06] transition-colors duration-200"
                      >
                        <button
                          onClick={() => choose(c.address)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <span
                            className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 ring-1 ring-inset ring-white/20"
                            style={{ background: addressAccent(c.address) }}
                            aria-hidden
                          >
                            {initials(c.label)}
                          </span>
                          <span className="min-w-0 leading-tight">
                            <span className="block text-sm font-semibold truncate">{c.label}</span>
                            <span className="block text-[11px] text-ink-muted font-mono truncate">
                              {shortAddress(c.address, 8, 6)}
                              {c.useCount > 0 && (
                                <span className="font-sans">
                                  {' · '}
                                  {c.useCount} sent
                                </span>
                              )}
                            </span>
                            {c.note && (
                              <span className="block text-[11px] text-ink-muted truncate">
                                {c.note}
                              </span>
                            )}
                          </span>
                        </button>
                        <button
                          onClick={() => onRemove(c.address)}
                          aria-label={`Remove ${c.label}`}
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0
                            text-ink-muted hover:text-danger hover:bg-surface-hover/[0.06]
                            opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* History counterparties */}
              <div className="px-3 sm:px-4 pt-2 pb-4 border-t border-hairline mt-2">
                <div className="px-1 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
                    From your history
                  </span>
                </div>

                {recentsLoading ? (
                  <p className="px-1 text-xs text-ink-muted">Scanning recent blocks…</p>
                ) : filteredRecents.length === 0 ? (
                  <p className="px-1 text-xs text-ink-muted">
                    No other counterparties in the scanned block range.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {filteredRecents.slice(0, 12).map((r) => (
                      <div
                        key={`${r.address}-${r.chainLabel}`}
                        className="group flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface-hover/[0.06] transition-colors duration-200"
                      >
                        <button
                          onClick={() => choose(r.address)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <span
                            className="w-9 h-9 rounded-full shrink-0 ring-1 ring-inset ring-white/10 opacity-70"
                            style={{ background: addressAccent(r.address) }}
                            aria-hidden
                          />
                          <span className="min-w-0 leading-tight">
                            <span className="block text-sm font-mono truncate">
                              {shortAddress(r.address, 10, 8)}
                            </span>
                            <span className="block text-[11px] text-ink-muted truncate">
                              {r.chainLabel}
                              {r.timestamp ? ` · ${timeAgo(r.timestamp)}` : ''}
                            </span>
                          </span>
                        </button>
                        <button
                          onClick={() => beginSave(r.address)}
                          className="text-xs text-accent-text hover:underline shrink-0
                            opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-200"
                        >
                          Save
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/*
                  Stated because the list is bounded by what an RPC will return
                  for eth_getLogs, not by everyone you have ever paid. Presenting
                  it as complete would let a missing entry be read as proof of no
                  prior transfer.
                */}
                <p className="px-1 pt-3 text-[11px] text-ink-muted">
                  Read from recent blocks only. Older counterparties may not appear.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
