/**
 * Verifies an EIP-4361 signature and opens a session.
 *
 * The message is rebuilt server-side from the submitted fields and checked
 * against the nonce this server issued, so neither the message text nor the
 * address can be forged by the client.
 */
import { NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { isAddress } from 'viem';
import { consumeNonce, createSession, peekNonce } from '@/lib/sessionStore';
import { SESSION_TTL_MS, verifySiwe, type SiweFields } from '@/lib/siwe';

export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'arcflow.sid';

export async function POST(request: Request) {
  const sid = cookies().get(SESSION_COOKIE)?.value;
  if (!sid) {
    return NextResponse.json(
      { ok: false, error: 'No session. Request a nonce first.' },
      { status: 400 }
    );
  }

  const expectedNonce = peekNonce(sid);
  if (!expectedNonce) {
    return NextResponse.json(
      { ok: false, error: 'Nonce expired. Try signing in again.' },
      { status: 400 }
    );
  }

  let body: { fields?: SiweFields; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 });
  }

  const { fields, signature } = body;
  if (!fields || typeof signature !== 'string' || !signature.startsWith('0x')) {
    return NextResponse.json({ ok: false, error: 'Missing signature.' }, { status: 400 });
  }
  if (!isAddress(fields.address ?? '')) {
    return NextResponse.json({ ok: false, error: 'Invalid address.' }, { status: 400 });
  }

  // Domain is taken from the request host, not from the body: a client-supplied
  // domain would let a signature minted elsewhere be presented here.
  const host = headers().get('host') ?? '';

  const result = await verifySiwe({
    fields,
    signature: signature as `0x${string}`,
    expectedNonce,
    expectedDomain: host,
  });

  if (!result.ok) {
    // Burn the nonce on failure too, so a bad signature cannot be retried
    // against the same challenge.
    consumeNonce(sid);
    return NextResponse.json({ ok: false, error: result.reason }, { status: 401 });
  }

  consumeNonce(sid);
  createSession(sid, fields.address, fields.chainId);

  return NextResponse.json({
    ok: true,
    address: fields.address,
    chainId: fields.chainId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
}
