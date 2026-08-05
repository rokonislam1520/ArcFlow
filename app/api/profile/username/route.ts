/**
 * Username availability check.
 *
 * A convenience for the settings form so a user learns their choice is taken
 * while typing rather than after submitting. This is advisory only: the answer
 * can be stale by the time the profile is saved, and the unique index in the
 * database remains the actual arbiter. Treating this endpoint as authoritative
 * would introduce a race where two people both see "available".
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { readSession } from '@/lib/sessionStore';
import { SESSION_COOKIE } from '@/lib/siwe';
import { validateField } from '@/lib/profile';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Sign-in is required so this cannot be used to enumerate which usernames
  // exist without ever holding a wallet.
  const sid = cookies().get(SESSION_COOKIE)?.value;
  const session = readSession(sid);
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const username = (new URL(request.url).searchParams.get('username') ?? '').trim();
  if (!username) {
    return NextResponse.json({ available: false, reason: 'Enter a username.' });
  }

  const invalid = validateField('username', username);
  if (invalid) {
    return NextResponse.json({ available: false, reason: invalid });
  }

  try {
    const existing = await prisma.user.findUnique({
      where: { username },
      select: { address: true },
    });

    // Your own current username is "available" to you, otherwise re-saving an
    // unchanged profile would report a conflict with yourself.
    const available = !existing || existing.address === session.address;

    return NextResponse.json({
      available,
      reason: available ? null : 'Already taken.',
    });
  } catch (error) {
    console.error('Username check failed:', error);
    return NextResponse.json({ error: 'Could not check username.' }, { status: 500 });
  }
}
