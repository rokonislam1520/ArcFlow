/**
 * Read and write the signed-in user's profile.
 *
 * Authorization is the whole point of this file: the address written to is
 * taken from the server-side session, never from the request body. A caller can
 * say anything they like in JSON, but they can only ever modify the profile
 * belonging to the address they proved control of via SIWE. There is
 * deliberately no `address` parameter — adding one would reintroduce exactly
 * the spoofing this design prevents.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { readSession } from '@/lib/sessionStore';
import { SESSION_COOKIE } from '@/lib/siwe';
import { EMPTY_PROFILE, validateField, type ProfileFields } from '@/lib/profile';

export const dynamic = 'force-dynamic';

/** Resolve the caller's address, or null when not signed in. */
function currentAddress(): string | null {
  const sid = cookies().get(SESSION_COOKIE)?.value;
  return readSession(sid)?.address ?? null;
}

/**
 * Serialise a database row for the client.
 *
 * Nulls become empty strings so the form can bind directly, and `id` is
 * dropped: it is an internal key with no meaning outside the database.
 */
function serialise(user: Record<string, unknown>) {
  const out: Record<string, unknown> = {
    address: user.address,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
  for (const key of Object.keys(EMPTY_PROFILE)) {
    out[key] = (user[key] as string | null) ?? '';
  }
  return out;
}

export async function GET() {
  const address = currentAddress();
  if (!address) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { address } });

    // No row yet is a normal state, not an error: every address is a valid
    // visitor before it has ever saved anything.
    if (!user) {
      return NextResponse.json({ exists: false, address, profile: null });
    }

    return NextResponse.json({ exists: true, address, profile: serialise(user) });
  } catch (error) {
    console.error('Profile read failed:', error);
    return NextResponse.json({ error: 'Could not load profile.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const address = currentAddress();
  if (!address) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  let body: Partial<ProfileFields>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  // Only known fields are read, so an unexpected key in the payload — including
  // `address` or `id` — cannot reach the database.
  const fields: Partial<ProfileFields> = {};
  const errors: Record<string, string> = {};

  for (const key of Object.keys(EMPTY_PROFILE) as (keyof ProfileFields)[]) {
    const raw = body[key];
    if (raw === undefined) continue; // omitted means "leave unchanged"

    if (typeof raw !== 'string') {
      errors[key] = 'Must be text.';
      continue;
    }

    const value = raw.trim();
    const error = validateField(key, value);
    if (error) errors[key] = error;
    else fields[key] = value;
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: 'Some fields need attention.', fields: errors }, { status: 400 });
  }

  // Empty string means "clear this field", which is null in the database.
  const data: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    data[key] = value === '' ? null : (value as string);
  }

  try {
    const user = await prisma.user.upsert({
      where: { address },
      create: { address, ...data },
      update: data,
    });

    return NextResponse.json({ ok: true, profile: serialise(user) });
  } catch (error) {
    // A unique-constraint failure on username is a race: two people can pass
    // an availability check at the same time and only one can win. The database
    // is the only place that can settle it, so the error is translated rather
    // than pre-empted.
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'That username is taken.', fields: { username: 'Already taken.' } },
        { status: 409 }
      );
    }

    console.error('Profile write failed:', error);
    return NextResponse.json({ error: 'Could not save profile.' }, { status: 500 });
  }
}
