/**
 * Current session, and sign-out.
 *
 * GET lets the client restore a signed-in state after a reload without
 * prompting for another signature. DELETE ends it.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroySession, readSession } from '@/lib/sessionStore';
import { SESSION_COOKIE } from '@/lib/siwe';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sid = cookies().get(SESSION_COOKIE)?.value;
  const session = readSession(sid);

  if (!session) return NextResponse.json({ authenticated: false });

  return NextResponse.json({
    authenticated: true,
    address: session.address,
    chainId: session.chainId,
  });
}

export async function DELETE() {
  const sid = cookies().get(SESSION_COOKIE)?.value;
  destroySession(sid);

  const response = NextResponse.json({ ok: true });
  // Clear the cookie as well as the record, so the next sign-in starts clean.
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
