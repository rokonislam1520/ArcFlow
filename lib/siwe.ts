/**
 * Sign-In With Ethereum (EIP-4361).
 *
 * Proves the user controls the address they claim, which a wallet connection
 * alone does not: `eth_requestAccounts` only shows an address, and anything
 * reading it could be a page that simply typed one in. A signature over a
 * server-issued nonce is the difference between "claims to be" and "is".
 *
 * Message construction and verification live here together, shared by the API
 * routes and the client, so the two can never drift into signing one format and
 * verifying another.
 */
import { verifyMessage, type Address } from 'viem';

/** Fields that make up an EIP-4361 message. */
export interface SiweFields {
  domain: string;
  address: Address;
  statement: string;
  uri: string;
  version: '1';
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
}

/**
 * Render fields as an EIP-4361 message.
 *
 * The format is byte-exact by specification — wallets display it verbatim, and
 * verification re-derives it from stored fields. Reordering or reflowing any
 * line changes the hash and breaks the signature.
 */
export function formatSiweMessage(f: SiweFields): string {
  const lines = [
    `${f.domain} wants you to sign in with your Ethereum account:`,
    f.address,
    '',
    f.statement,
    '',
    `URI: ${f.uri}`,
    `Version: ${f.version}`,
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
  ];
  if (f.expirationTime) lines.push(`Expiration Time: ${f.expirationTime}`);
  return lines.join('\n');
}

/** How long a signed session stays valid. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** How long an unused nonce stays claimable. Short: it only spans one signature. */
export const NONCE_TTL_MS = 10 * 60 * 1000;

export const SIWE_STATEMENT =
  'Sign in to ArcFlow. This proves you control this address. It costs no gas and authorizes no transactions.';

/**
 * Verify a signature against the stated fields.
 *
 * Rebuilds the message from the fields rather than trusting a client-supplied
 * string: otherwise a caller could sign something harmless and present it
 * alongside different claims.
 */
export async function verifySiwe(args: {
  fields: SiweFields;
  signature: `0x${string}`;
  expectedNonce: string;
  expectedDomain: string;
  now?: number;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { fields, signature, expectedNonce, expectedDomain } = args;
  const now = args.now ?? Date.now();

  // Nonce must match the one this server issued: that is what makes a captured
  // signature useless a second time.
  if (fields.nonce !== expectedNonce) return { ok: false, reason: 'Nonce mismatch.' };

  // Domain binding stops a signature gathered on another site being replayed here.
  if (fields.domain !== expectedDomain) return { ok: false, reason: 'Domain mismatch.' };

  const issuedAt = Date.parse(fields.issuedAt);
  if (!Number.isFinite(issuedAt)) return { ok: false, reason: 'Invalid issue time.' };
  // Small allowance for clock skew; a far-future timestamp is rejected.
  if (issuedAt > now + 5 * 60 * 1000) return { ok: false, reason: 'Issued in the future.' };

  if (fields.expirationTime) {
    const expires = Date.parse(fields.expirationTime);
    if (!Number.isFinite(expires)) return { ok: false, reason: 'Invalid expiry.' };
    if (expires <= now) return { ok: false, reason: 'Message expired.' };
  }

  const message = formatSiweMessage(fields);

  try {
    const valid = await verifyMessage({
      address: fields.address,
      message,
      signature,
    });
    if (!valid) return { ok: false, reason: 'Signature does not match address.' };
  } catch {
    return { ok: false, reason: 'Signature could not be verified.' };
  }

  return { ok: true };
}
