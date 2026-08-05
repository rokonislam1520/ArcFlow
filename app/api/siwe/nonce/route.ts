/**
 * Issues a single-use nonce and, if needed, an opaque session id.
 *
 * The nonce is what makes the later signature unrepeatable: it is bound to this
 * browser's session cookie, expires quickly, and is consumed on verification.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { issueNonce, newId } from '@/lib/sessionStore';
import { SESSION_COOKIE } from '@/lib/siwe';

// Nonces are per-request state; caching this route would hand the same nonce
// to everyone and defeat replay protection entirely.
export const dynamic = 'force-dynamic';

export async function GET() {
  const existing = cookies().get(SESSION_COOKIE)?.value;
  const sid = existing ?? newId();
  const nonce = issueNonce(sid);

  const response = NextResponse.json({ nonce });

  // Only set the cookie when minting a new id, so an in-flight sign-in is not
  // handed a different session id mid-flow (which would orphan its nonce).
  if (!existing) {
    response.cookies.set(SESSION_COOKIE, sid, {
      httpOnly: true, // not readable by scripts, so XSS cannot lift the session
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
  }

  return response;
}
