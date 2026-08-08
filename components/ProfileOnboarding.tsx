'use client';
/**
 * "Complete your profile" — shown once, after the first successful sign-in.
 *
 * The trigger is the SIWE session rather than the wallet connection. A
 * connected wallet only reveals an address, which anyone can type; the profile
 * write is authenticated, so asking before the signature would present a form
 * whose save could only fail.
 *
 * Only a username is required. This appears uninvited, and an uninvited form
 * that cannot be dismissed is a wall — so it can always be skipped, and asks
 * once rather than on every visit.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AvatarPicker } from '@/components/AvatarPicker';
import { useSession } from '@/lib/SessionProvider';
import { useProfile } from '@/lib/ProfileProvider';
import {
  LIMITS,
  USERNAME_MIN,
  isProfileComplete,
  shortAddress,
  validateField,
  type ProfileFields,
} from '@/lib/profile';

/**
 * Addresses that declined, kept per-address in localStorage.
 *
 * Dismissal is a client-side preference, not profile data: the server stores
 * what a user chose to tell us, and "not now" is not that. Keying by address
 * means a second wallet on the same browser still gets asked once.
 */
const DISMISSED_KEY = 'arcflow.profileOnboarding.dismissed';

function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Unreadable or corrupt storage just means we ask again — harmless.
    return [];
  }
}

function markDismissed(address: string) {
  try {
    const next = new Set(readDismissed());
    next.add(address.toLowerCase());
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
  } catch {
    // Preference simply will not persist.
  }
}

/** Steps, so a nine-field form does not land in one intimidating block. */
const STEPS = ['identity', 'links'] as const;
type Step = (typeof STEPS)[number];

export function ProfileOnboarding() {
  const session = useSession();
  const profile = useProfile();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('identity');
  const [draft, setDraft] = useState<ProfileFields | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileFields, string>>>({});
  const [checkingName, setCheckingName] = useState(false);
  const [nameTaken, setNameTaken] = useState(false);

  const address = session.address;
  const signedIn = session.status === 'signed-in';
  const complete = isProfileComplete(profile.fields, profile.exists);

  // Decide whether to open, once the profile has actually loaded. Opening
  // while the fetch is in flight would flash the form at users who already
  // have a profile.
  useEffect(() => {
    if (!signedIn || !address || profile.loading) return;
    // A failed load says nothing about whether a profile exists; prompting on
    // a network error could push a duplicate profile on someone who has one.
    if (profile.error) return;
    if (complete) return;
    if (readDismissed().includes(address.toLowerCase())) return;

    setOpen(true);
  }, [signedIn, address, profile.loading, profile.error, complete]);

  // Close if the session ends, so the form cannot outlive the session that
  // authorises its save.
  useEffect(() => {
    if (!signedIn) setOpen(false);
  }, [signedIn]);

  // Seed the draft from whatever is stored: a partial profile should be
  // extended, not silently overwritten with blanks.
  useEffect(() => {
    if (open && draft === null) setDraft({ ...profile.fields });
  }, [open, draft, profile.fields]);

  const username = draft?.username ?? '';

  // Check availability as they type. The server enforces uniqueness on save;
  // this only avoids composing a whole profile around a taken name.
  useEffect(() => {
    const value = username.trim();
    if (!open || value.length < USERNAME_MIN || validateField('username', value)) {
      setNameTaken(false);
      return;
    }

    let cancelled = false;
    setCheckingName(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/profile/username?username=${encodeURIComponent(value)}`, {
          credentials: 'same-origin',
        });
        const data = await res.json();
        if (!cancelled) setNameTaken(res.ok && data?.available === false);
      } catch {
        // Availability is advisory. On failure stay quiet and let the save
        // decide, rather than blocking on a check that did not run.
        if (!cancelled) setNameTaken(false);
      } finally {
        if (!cancelled) setCheckingName(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      setCheckingName(false);
      window.clearTimeout(timer);
    };
  }, [username, open]);

  const setField = useCallback((key: keyof ProfileFields, value: string) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    setErrors((prev) => ({ ...prev, [key]: validateField(key, value) ?? undefined }));
  }, []);

  const dismiss = useCallback(() => {
    if (address) markDismissed(address);
    setOpen(false);
  }, [address]);

  const usernameError = useMemo(() => {
    const value = username.trim();
    if (!value) return null;
    return validateField('username', value);
  }, [username]);

  if (!open || !draft) return null;

  const canSubmit =
    username.trim().length >= USERNAME_MIN &&
    !usernameError &&
    !nameTaken &&
    !checkingName &&
    !profile.saving &&
    Object.values(errors).every((e) => !e);

  const submit = async () => {
    if (!canSubmit) return;
    const ok = await profile.save(draft);
    if (ok) {
      // Recorded as dismissed too: the profile is complete, but this keeps the
      // prompt closed even if the completeness rule later gains a field.
      if (address) markDismissed(address);
      setOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-lg glass max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-hairline">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="onboarding-title" className="text-xl font-bold">
                Complete your profile
              </h2>
              <p className="text-sm text-ink-secondary mt-1">
                {address ? (
                  <>
                    Signed in as{' '}
                    <span className="font-mono text-ink-secondary">{shortAddress(address)}</span>. A
                    name makes you recognisable to people you transact with.
                  </>
                ) : (
                  'A name makes you recognisable to people you transact with.'
                )}
              </p>
            </div>
            <button
              onClick={dismiss}
              className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-hover/[0.06] shrink-0"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-4 h-4">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex gap-1.5 mt-4" aria-hidden>
            {STEPS.map((s) => (
              <span
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  s === step || (step === 'links' && s === 'identity')
                    ? 'bg-arc-500'
                    : 'bg-surface-input'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {step === 'identity' ? (
            <>
              <AvatarPicker
                value={draft.avatar}
                onChange={(v) => setField('avatar', v)}
                fallback={address ? address.slice(2, 4).toUpperCase() : '··'}
                disabled={profile.saving}
              />

              <Field
                label="Username"
                required
                value={draft.username}
                onChange={(v) => setField('username', v)}
                placeholder="satoshi"
                maxLength={LIMITS.username}
                error={
                  usernameError ??
                  (nameTaken ? 'That username is taken.' : null)
                }
                hint={
                  checkingName
                    ? 'Checking availability…'
                    : 'Letters, numbers and underscore. Used in your public URL.'
                }
              />

              <Field
                label="Display name"
                value={draft.displayName}
                onChange={(v) => setField('displayName', v)}
                placeholder="Satoshi Nakamoto"
                maxLength={LIMITS.displayName}
                error={errors.displayName}
              />

              <Field
                label="Email"
                optional
                type="email"
                value={draft.email}
                onChange={(v) => setField('email', v)}
                placeholder="you@example.com"
                maxLength={LIMITS.email}
                error={errors.email}
                hint="Never shown publicly and never required."
              />
            </>
          ) : (
            <>
              <Field
                label="X (Twitter)"
                optional
                value={draft.twitter}
                onChange={(v) => setField('twitter', v)}
                placeholder="@handle"
                maxLength={LIMITS.social}
                error={errors.twitter}
              />

              <Field
                label="GitHub"
                optional
                value={draft.github}
                onChange={(v) => setField('github', v)}
                placeholder="username"
                maxLength={LIMITS.social}
                error={errors.github}
              />

              <Field
                label="Country"
                optional
                value={draft.country}
                onChange={(v) => setField('country', v)}
                placeholder="Bangladesh"
                maxLength={LIMITS.country}
                error={errors.country}
              />

              <Field
                label="Bio"
                optional
                multiline
                value={draft.bio}
                onChange={(v) => setField('bio', v)}
                placeholder="A sentence about you."
                maxLength={LIMITS.bio}
                error={errors.bio}
              />
            </>
          )}

          {profile.error && <p className="text-xs text-danger">{profile.error}</p>}
        </div>

        <div className="p-6 pt-0 flex items-center gap-3">
          <button
            onClick={dismiss}
            disabled={profile.saving}
            className="px-4 py-2.5 rounded-xl text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-hover/[0.06] disabled:opacity-50"
          >
            Skip for now
          </button>

          <div className="flex-1" />

          {step === 'links' && (
            <button
              onClick={() => setStep('identity')}
              disabled={profile.saving}
              className="px-4 py-2.5 rounded-xl text-sm border border-hairline bg-surface-input hover:bg-surface-hover/[0.06] disabled:opacity-50"
            >
              Back
            </button>
          )}

          {step === 'identity' ? (
            <button
              onClick={() => setStep('links')}
              disabled={!canSubmit}
              className="btn-arc px-5 py-2.5 text-sm disabled:opacity-50"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="btn-arc px-5 py-2.5 text-sm disabled:opacity-50"
            >
              {profile.saving ? 'Saving…' : 'Save profile'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  maxLength,
  multiline,
  hint,
  required,
  optional,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  hint?: string;
  required?: boolean;
  optional?: boolean;
  type?: string;
}) {
  const id = `onboarding-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  const className =
    'w-full px-3 py-2.5 rounded-xl bg-surface-input border text-sm placeholder:text-ink-muted outline-none transition-colors focus:bg-surface-input ' +
    (error ? 'border-red-500/50 focus:border-red-500/70' : 'border-hairline focus:border-arc-500/40');

  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-2 mb-1.5 text-xs font-medium text-ink-secondary">
        {label}
        {required && <span className="text-accent-text">required</span>}
        {optional && <span className="text-ink-muted">optional</span>}
      </label>

      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={3}
          aria-invalid={Boolean(error)}
          className={`${className} resize-none`}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-invalid={Boolean(error)}
          className={className}
        />
      )}

      {error ? (
        <p className="mt-1 text-[11px] text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
