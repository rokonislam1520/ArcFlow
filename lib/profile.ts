/**
 * Profile shape and validation, shared by the API route and the client.
 *
 * Both sides import from here so a field can never be accepted by one and
 * rejected by the other. The client validates to give immediate feedback; the
 * server validates because the client can be bypassed entirely — a profile
 * update is just an HTTP request, and nothing stops someone sending one by
 * hand. Client-side checks are a convenience, never the enforcement.
 */

/** Editable profile fields. `address` is excluded: it comes from the session. */
export interface ProfileFields {
  username: string;
  displayName: string;
  email: string;
  avatar: string;
  bio: string;
  country: string;
  twitter: string;
  telegram: string;
  discord: string;
  github: string;
  website: string;
}

/** A stored profile as returned by the API. */
export interface Profile extends ProfileFields {
  address: string;
  createdAt: string;
  updatedAt: string;
}

export const EMPTY_PROFILE: ProfileFields = {
  username: '',
  displayName: '',
  email: '',
  avatar: '',
  bio: '',
  country: '',
  twitter: '',
  telegram: '',
  discord: '',
  github: '',
  website: '',
};

/**
 * Length ceilings, mirrored by the database column types.
 *
 * Without these a single request could store a multi-megabyte bio and turn
 * every later profile read into a slow query.
 */
export const LIMITS = {
  username: 20,
  displayName: 50,
  email: 100,
  bio: 500,
  country: 100,
  social: 200,
  /** ~100KB of base64, which is roughly a 75KB image. */
  avatar: 100_000,
} as const;

export const USERNAME_MIN = 3;

/** Usernames appear in URLs and must stay unambiguous, so the set is narrow. */
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

/**
 * Deliberately permissive: the only claim being made is "this string looks like
 * an address". Ownership is never assumed from this field, and nothing is sent
 * to it, so rejecting unusual-but-valid addresses would cost more than it saves.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate one field.
 *
 * Returns an error string, or null when acceptable. Every field is optional —
 * an empty profile is valid, because requiring information as the price of
 * using a wallet would be the wrong trade.
 */
export function validateField(field: keyof ProfileFields, value: string): string | null {
  const v = value.trim();
  if (!v) return null; // empty always clears the field

  switch (field) {
    case 'username':
      if (v.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters.`;
      if (v.length > LIMITS.username) return `At most ${LIMITS.username} characters.`;
      if (!USERNAME_PATTERN.test(v)) return 'Letters, numbers and underscore only.';
      return null;

    case 'displayName':
      return v.length > LIMITS.displayName ? `At most ${LIMITS.displayName} characters.` : null;

    case 'email':
      if (v.length > LIMITS.email) return `At most ${LIMITS.email} characters.`;
      return EMAIL_PATTERN.test(v) ? null : 'Does not look like an email address.';

    case 'bio':
      return v.length > LIMITS.bio ? `At most ${LIMITS.bio} characters.` : null;

    case 'country':
      return v.length > LIMITS.country ? `At most ${LIMITS.country} characters.` : null;

    case 'avatar':
      return v.length > LIMITS.avatar ? 'Image is too large (max ~75KB).' : null;

    case 'website':
      if (v.length > LIMITS.social) return `At most ${LIMITS.social} characters.`;
      // Only http(s) is allowed: a `javascript:` URL rendered into an anchor
      // would execute when clicked, so the scheme is checked rather than
      // trusted.
      try {
        const url = new URL(v);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          return 'Must start with http:// or https://';
        }
        return null;
      } catch {
        return 'Must be a full URL, e.g. https://example.com';
      }

    case 'twitter':
    case 'telegram':
    case 'discord':
    case 'github':
      return v.length > LIMITS.social ? `At most ${LIMITS.social} characters.` : null;

    default:
      return null;
  }
}

/** Validate every field. Returns a map of field to error for those that fail. */
export function validateProfile(fields: ProfileFields): Partial<Record<keyof ProfileFields, string>> {
  const errors: Partial<Record<keyof ProfileFields, string>> = {};
  for (const key of Object.keys(fields) as (keyof ProfileFields)[]) {
    const error = validateField(key, fields[key] ?? '');
    if (error) errors[key] = error;
  }
  return errors;
}

/**
 * Fields that count toward the completion indicator.
 *
 * Avatar is included because it is the most visible part of a profile. Every
 * social link is not: a user with one link and a filled-in bio is not half a
 * user, and showing them 40% would imply otherwise.
 */
const COMPLETION_FIELDS: (keyof ProfileFields)[] = [
  'username',
  'displayName',
  'avatar',
  'bio',
  'country',
];

/** Percentage of the core fields that are filled in, 0-100. */
export function completionPercent(fields: ProfileFields): number {
  const filled = COMPLETION_FIELDS.filter((key) => (fields[key] ?? '').trim().length > 0).length;
  return Math.round((filled / COMPLETION_FIELDS.length) * 100);
}

/** Which core fields are still empty, for prompting the user. */
export function missingFields(fields: ProfileFields): (keyof ProfileFields)[] {
  return COMPLETION_FIELDS.filter((key) => !(fields[key] ?? '').trim());
}

/**
 * Fields the onboarding treats as the minimum to call a profile set up.
 *
 * Only the two that give an account a human identity. Onboarding exists to
 * stop the app addressing people as `0x1f4b…` — it is not a data collection
 * exercise, and gating it on an avatar or a bio would turn a courtesy into a
 * toll gate. Everything else in the form is genuinely optional.
 */
const REQUIRED_FOR_ONBOARDING: (keyof ProfileFields)[] = ['username', 'displayName'];

/**
 * Whether this profile is complete enough that onboarding should stay closed.
 *
 * Takes `exists` as well as the values because they answer different
 * questions: `exists` says a record was saved, the fields say it is usable.
 * A row created by some other path with no username would otherwise count as
 * done and leave the user permanently nameless.
 */
export function isProfileComplete(fields: ProfileFields, exists: boolean): boolean {
  if (!exists) return false;
  return REQUIRED_FOR_ONBOARDING.every((key) => (fields[key] ?? '').trim().length > 0);
}

/**
 * Normalise a stored profile into editable fields.
 *
 * The database stores absent values as null; form inputs need strings. Passing
 * null into a controlled input makes React switch it to uncontrolled and warn,
 * so the conversion happens once here rather than at each input.
 */
export function toFields(profile: Partial<Profile> | null | undefined): ProfileFields {
  if (!profile) return { ...EMPTY_PROFILE };
  const out = { ...EMPTY_PROFILE };
  for (const key of Object.keys(EMPTY_PROFILE) as (keyof ProfileFields)[]) {
    out[key] = (profile[key] as string | null | undefined) ?? '';
  }
  return out;
}

/** Shorten an address for display: 0x1234…abcd. */
export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
