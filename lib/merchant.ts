'use client';
/**
 * Merchant Pay — merchant profile and shareable payment requests.
 *
 * A payment request carries everything a customer needs inside the link
 * itself: recipient, chain, token, amount and reference. Nothing is held on a
 * server, so a request works the moment it is copied and keeps working with no
 * backend to run, no database to migrate and no service that can expire it.
 *
 * The settlement is an ordinary on-chain token transfer performed by App Kit —
 * the same path Send uses. There is no escrow and no custom contract in the
 * middle, which means a request cannot be "cancelled" once paid, and the funds
 * arrive directly in the merchant's wallet rather than passing through us.
 *
 * The profile is deliberately local to the browser. It only supplies defaults
 * when composing a request; the link is the source of truth, so a merchant who
 * clears their browser loses a convenience, never a payment.
 */
import { isAddress } from 'viem';

export interface MerchantProfile {
  /** Business name shown to the customer on the checkout screen. */
  name: string;
  /** Optional descriptor, e.g. "Coffee" or "Consulting". */
  category: string;
  /** Wallet that receives payments. */
  wallet: string;
}

/** Versioned so a future shape change cannot be read as if it were current. */
const STORAGE_KEY = 'arcflow.merchant.profile.v1';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadProfile(): MerchantProfile | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const { name, category, wallet } = parsed as Record<string, unknown>;
    // A stored wallet that is not an address would silently misdirect funds,
    // so an unusable record is discarded rather than partially trusted.
    if (typeof name !== 'string' || typeof wallet !== 'string') return null;
    if (!isAddress(wallet)) return null;

    return {
      name,
      category: typeof category === 'string' ? category : '',
      wallet,
    };
  } catch {
    // Corrupt or unreadable storage is treated as "no profile yet".
    return null;
  }
}

export function saveProfile(profile: MerchantProfile): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage can be full or blocked; the in-memory profile still works for
    // this session, so failing to persist must not break the flow.
  }
}

export function clearProfile(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing actionable */
  }
}

export interface PaymentRequest {
  /** Recipient wallet. */
  to: string;
  /** Merchant display name, carried so the customer sees who they are paying. */
  name: string;
  /** Human amount, e.g. "12.50". Empty means the customer chooses. */
  amount: string;
  /** App Kit token alias, e.g. "USDC". */
  token: string;
  /** App Kit chain id, e.g. "Arc_Testnet". */
  chain: string;
  /** Optional note, e.g. an invoice number. */
  memo: string;
  /** Short reference so a merchant can match a payment to an order. */
  ref: string;
}

/**
 * Short, collision-resistant enough to distinguish a merchant's own orders.
 * This is a human reference, not a security token — it never authorises
 * anything, so it does not need to be unguessable.
 */
export function newReference(): string {
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  const time = Date.now().toString(36).slice(-4).toUpperCase();
  return `${time}${random}`;
}

/** Serialise a request into a query string. Empty fields are omitted. */
export function encodeRequest(request: PaymentRequest): string {
  const params = new URLSearchParams();
  params.set('to', request.to);
  params.set('chain', request.chain);
  params.set('token', request.token);
  if (request.amount) params.set('amount', request.amount);
  if (request.name) params.set('name', request.name);
  if (request.memo) params.set('memo', request.memo);
  if (request.ref) params.set('ref', request.ref);
  return params.toString();
}

/**
 * Parse a request from a URL.
 *
 * Returns null unless the recipient is a real address and a chain is named:
 * without both, a checkout screen could send funds to nowhere, so it is better
 * to show "this link is not valid" than to render a payable form.
 */
export function decodeRequest(params: URLSearchParams): PaymentRequest | null {
  const to = params.get('to')?.trim() ?? '';
  const chain = params.get('chain')?.trim() ?? '';
  if (!to || !isAddress(to) || !chain) return null;

  const amount = (params.get('amount') ?? '').trim();
  // A malformed amount is dropped rather than shown, so the customer is never
  // asked to confirm a figure the transfer would reject.
  const validAmount = /^\d*\.?\d*$/.test(amount) && amount !== '.' ? amount : '';

  return {
    to,
    chain,
    token: params.get('token')?.trim() || 'USDC',
    amount: validAmount,
    name: (params.get('name') ?? '').trim().slice(0, 60),
    memo: (params.get('memo') ?? '').trim().slice(0, 120),
    ref: (params.get('ref') ?? '').trim().slice(0, 24),
  };
}

/** Path of the checkout, exported so callers link to one place. */
export const PAY_PATH = '/pay';

/** Absolute checkout URL for sharing. Falls back to a path during SSR. */
export function requestUrl(request: PaymentRequest): string {
  const query = encodeRequest(request);
  const path = `${PAY_PATH}?${query}`;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}
