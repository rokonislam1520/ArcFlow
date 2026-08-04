/**
 * Server-side nonce and session storage.
 *
 * In-memory on purpose, and honest about what that means: sessions do not
 * survive a restart and are not shared between instances. That is acceptable
 * here because a session only gates UI state, never funds — every transfer is
 * still authorized by a wallet signature at the moment it happens. A deployment
 * running more than one instance should swap this for Redis; the interface is
 * kept narrow so that is a single-file change.
 */
import { randomBytes } from 'node:crypto';
import { NONCE_TTL_MS, SESSION_TTL_MS } from './siwe';

interface NonceRecord {
  nonce: string;
  expiresAt: number;
}

interface SessionRecord {
  address: string;
  chainId: number;
  expiresAt: number;
}

// Keyed by session id (an opaque cookie value), not by address: one address may
// legitimately be signed in from several browsers.
const nonces = new Map<string, NonceRecord>();
const sessions = new Map<string, SessionRecord>();

/** Drop expired entries. Cheap, and keeps a long-lived process from growing. */
function sweep(now: number): void {
  for (const [key, record] of nonces) {
    if (record.expiresAt <= now) nonces.delete(key);
  }
  for (const [key, record] of sessions) {
    if (record.expiresAt <= now) sessions.delete(key);
  }
}

/** Cryptographically random id. `Math.random` would be guessable. */
export function newId(): string {
  return randomBytes(24).toString('base64url');
}

export function issueNonce(sessionId: string): string {
  const now = Date.now();
  sweep(now);
  const nonce = randomBytes(16).toString('base64url');
  nonces.set(sessionId, { nonce, expiresAt: now + NONCE_TTL_MS });
  return nonce;
}

export function peekNonce(sessionId: string): string | null {
  const record = nonces.get(sessionId);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    nonces.delete(sessionId);
    return null;
  }
  return record.nonce;
}

/**
 * Consume a nonce so it cannot be used twice.
 *
 * Single-use is the whole point: without this, a captured signature would keep
 * working for as long as the nonce lived.
 */
export function consumeNonce(sessionId: string): void {
  nonces.delete(sessionId);
}

export function createSession(sessionId: string, address: string, chainId: number): void {
  const now = Date.now();
  sweep(now);
  sessions.set(sessionId, {
    address: address.toLowerCase(),
    chainId,
    expiresAt: now + SESSION_TTL_MS,
  });
}

export function readSession(
  sessionId: string | undefined
): { address: string; chainId: number } | null {
  if (!sessionId) return null;
  const record = sessions.get(sessionId);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return { address: record.address, chainId: record.chainId };
}

export function destroySession(sessionId: string | undefined): void {
  if (!sessionId) return;
  sessions.delete(sessionId);
  nonces.delete(sessionId);
}
