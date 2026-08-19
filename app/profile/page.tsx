'use client';
/**
 * Profile: view and edit.
 *
 * View and edit live on one page rather than two routes. A profile has a
 * handful of fields, and bouncing between /profile and /profile/edit for a
 * one-line bio change is more navigation than the task deserves.
 *
 * Editing works on a local draft and only writes on save, so an accidental
 * keystroke is never persisted and "Discard" is always honest.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WalletGuard } from '@/components/WalletGuard';
import { AvatarPicker } from '@/components/AvatarPicker';
import { useSession } from '@/lib/SessionProvider';
import { useProfile } from '@/lib/ProfileProvider';
import {
  LIMITS,
  completionPercent,
  missingFields,
  shortAddress,
  validateField,
  type ProfileFields,
} from '@/lib/profile';

/** Human labels for the fields the completion meter tracks. */
const FIELD_LABELS: Partial<Record<keyof ProfileFields, string>> = {
  username: 'username',
  displayName: 'display name',
  avatar: 'avatar',
  bio: 'bio',
  country: 'country',
};

const SOCIALS: { key: keyof ProfileFields; label: string; placeholder: string }[] = [
  { key: 'twitter', label: 'X (Twitter)', placeholder: '@handle' },
  { key: 'telegram', label: 'Telegram', placeholder: '@handle' },
  { key: 'discord', label: 'Discord', placeholder: 'name#0000' },
  { key: 'github', label: 'GitHub', placeholder: 'username' },
  { key: 'website', label: 'Website', placeholder: 'https://example.com' },
];

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  maxLength,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  hint?: string;
}) {
  const base =
    'w-full rounded-xl bg-surface-input border px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted outline-none transition focus:border-arc-500';
  const border = error ? 'border-red-500/60' : 'border-hairline';

  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm text-ink-secondary">{label}</span>
        {maxLength && (
          <span className="text-xs text-ink-muted">
            {value.length}/{maxLength}
          </span>
        )}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={4}
          className={`${base} ${border} resize-y`}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`${base} ${border}`}
        />
      )}
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}

function CompletionMeter({ fields }: { fields: ProfileFields }) {
  const percent = completionPercent(fields);
  const missing = missingFields(fields);

  return (
    <div className="glass p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-ink-secondary">Profile completion</span>
        <span className="text-sm font-semibold text-accent-text">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
        <div
          className="h-full rounded-full bg-gradient-to-r from-arc-500 to-mint-500 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      {missing.length > 0 && (
        <p className="mt-3 text-xs text-ink-muted">
          Add your {missing.map((k) => FIELD_LABELS[k] ?? k).join(', ')} to finish.
        </p>
      )}
    </div>
  );
}

/** Copy-to-clipboard that confirms, then quietly reverts. */
function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address);
          setCopied(true);
        } catch {
          // Clipboard access can be denied; the address is shown either way.
        }
      }}
      className="group inline-flex items-center gap-2 rounded-lg bg-surface-input px-3 py-1.5 font-mono text-xs text-ink-secondary transition hover:text-ink-primary"
      title={address}
    >
      {shortAddress(address)}
      <span className={copied ? 'text-success' : 'text-ink-muted group-hover:text-ink-secondary'}>
        {copied ? 'copied' : 'copy'}
      </span>
    </button>
  );
}

function ProfileInner() {
  const { address, status, signIn } = useSession();
  const { fields, exists, loading, saving, error, fieldErrors, savedAt, save, reload } = useProfile();

  const [draft, setDraft] = useState<ProfileFields>(fields);
  const [editing, setEditing] = useState(false);
  const [localErrors, setLocalErrors] = useState<Partial<Record<keyof ProfileFields, string>>>({});

  // Adopt server state whenever it changes, except mid-edit: overwriting a
  // half-typed form because a refetch landed would discard the user's work.
  useEffect(() => {
    if (!editing) setDraft(fields);
  }, [fields, editing]);

  const set = useCallback(
    (key: keyof ProfileFields) => (value: string) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
      setLocalErrors((prev) => ({ ...prev, [key]: validateField(key, value) ?? undefined }));
    },
    []
  );

  // Server-reported problems (e.g. a taken username) outrank local ones: they
  // reflect what actually happened on save.
  const errorFor = (key: keyof ProfileFields) => fieldErrors[key] ?? localErrors[key] ?? null;

  const dirty = useMemo(
    () => (Object.keys(draft) as (keyof ProfileFields)[]).some((k) => draft[k] !== fields[k]),
    [draft, fields]
  );

  const hasErrors = Object.values(localErrors).some(Boolean);

  const onSave = async () => {
    const ok = await save(draft);
    if (ok) setEditing(false);
  };

  const onDiscard = () => {
    setDraft(fields);
    setLocalErrors({});
    setEditing(false);
  };

  // A profile belongs to a proven address, so signing is required before the
  // page can show or store anything.
  if (status !== 'signed-in') {
    return (
      <div className="mx-auto max-w-lg">
        <div className="glass p-8 text-center">
          <div className="mb-4 text-5xl">✍️</div>
          <h2 className="mb-2 text-2xl font-bold">Sign in to continue</h2>
          <p className="mb-4 text-ink-secondary">
            Your profile is tied to your address. Sign a message to prove it is yours — this costs no
            gas and authorizes no transactions.
          </p>
          <button
            onClick={() => void signIn()}
            disabled={status === 'awaiting-signature' || status === 'verifying'}
            className="btn-arc px-8 py-3 text-lg"
          >
            {status === 'awaiting-signature'
              ? 'Check your wallet…'
              : status === 'verifying'
                ? 'Verifying…'
                : 'Sign in'}
          </button>
        </div>
      </div>
    );
  }

  const initials =
    (draft.displayName || draft.username || '').trim().slice(0, 2).toUpperCase() ||
    (address ? address.slice(2, 4).toUpperCase() : '??');

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-in">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Profile</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Stored off-chain and linked to your address. Nothing here is published on-chain.
          </p>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="btn-arc px-5 py-2.5">
            {exists ? 'Edit profile' : 'Create profile'}
          </button>
        )}
      </header>

      {loading && <div className="glass p-5 text-sm text-ink-secondary">Loading your profile…</div>}

      {error && (
        <div className="glass border border-red-500/30 p-4">
          <p className="text-sm text-danger">{error}</p>
          <button onClick={() => void reload()} className="mt-2 text-xs text-ink-secondary underline">
            Try again
          </button>
        </div>
      )}

      {savedAt && !editing && !error && (
        <div className="glass border border-mint-500/30 p-4 text-sm text-success">
          Profile saved.
        </div>
      )}

      <div className="glass p-5">
        <div className="flex flex-wrap items-center gap-4">
          {editing ? (
            <AvatarPicker
              value={draft.avatar}
              onChange={set('avatar')}
              fallback={initials}
              disabled={saving}
            />
          ) : (
            <>
              <div className="h-24 w-24 overflow-hidden rounded-full bg-surface-raised ring-2 ring-white/10">
                {draft.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URI
                  <img src={draft.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-ink-muted">
                    {initials}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-ink-primary">
                  {draft.displayName || draft.username || 'Unnamed'}
                </h2>
                {draft.username && <p className="text-sm text-accent-text">@{draft.username}</p>}
                {address && (
                  <div className="mt-2">
                    <CopyAddress address={address} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {!editing && draft.bio && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">
            {draft.bio}
          </p>
        )}

        {!editing && (draft.country || draft.email) && (
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-secondary">
            {draft.country && <span>📍 {draft.country}</span>}
            {draft.email && <span>✉️ {draft.email}</span>}
          </div>
        )}

        {!editing && SOCIALS.some((s) => draft[s.key]) && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-4">
            {SOCIALS.filter((s) => draft[s.key]).map((s) => {
              const value = draft[s.key];
              // Only the website field is turned into a link, and only after
              // validation confirmed an http(s) scheme. The handle fields are
              // free text — rendering them as links would mean guessing a URL
              // and could send someone somewhere they did not intend.
              return s.key === 'website' ? (
                <a
                  key={s.key}
                  href={value}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="rounded-lg bg-surface-input px-3 py-1.5 text-xs text-accent-text transition hover:text-accent-text"
                >
                  {s.label}
                </a>
              ) : (
                <span
                  key={s.key}
                  className="rounded-lg bg-surface-input px-3 py-1.5 text-xs text-ink-secondary"
                >
                  {s.label}: <span className="text-ink-secondary">{value}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {!editing && <CompletionMeter fields={draft} />}

      {editing && (
        <>
          <div className="glass space-y-4 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Identity</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Username"
                value={draft.username}
                onChange={set('username')}
                error={errorFor('username')}
                placeholder="satoshi"
                maxLength={LIMITS.username}
                hint="Letters, numbers and underscore. Must be unique."
              />
              <Field
                label="Display name"
                value={draft.displayName}
                onChange={set('displayName')}
                error={errorFor('displayName')}
                placeholder="Satoshi Nakamoto"
                maxLength={LIMITS.displayName}
              />
              <Field
                label="Email"
                value={draft.email}
                onChange={set('email')}
                error={errorFor('email')}
                placeholder="you@example.com"
                maxLength={LIMITS.email}
                hint="Never shown publicly."
              />
              <Field
                label="Country"
                value={draft.country}
                onChange={set('country')}
                error={errorFor('country')}
                placeholder="Bangladesh"
                maxLength={LIMITS.country}
              />
            </div>
            <Field
              label="Bio"
              value={draft.bio}
              onChange={set('bio')}
              error={errorFor('bio')}
              placeholder="A short line about you."
              maxLength={LIMITS.bio}
              multiline
            />
          </div>

          <div className="glass space-y-4 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Links</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {SOCIALS.map((s) => (
                <Field
                  key={s.key}
                  label={s.label}
                  value={draft[s.key]}
                  onChange={set(s.key)}
                  error={errorFor(s.key)}
                  placeholder={s.placeholder}
                  maxLength={LIMITS.social}
                />
              ))}
            </div>
          </div>

          <CompletionMeter fields={draft} />

          <div className="sticky bottom-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => void onSave()}
              disabled={saving || hasErrors || !dirty}
              className="btn-arc px-6 py-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              onClick={onDiscard}
              disabled={saving}
              className="rounded-xl border border-hairline px-5 py-3 text-sm text-ink-secondary transition hover:bg-surface-hover/[0.06] disabled:opacity-50"
            >
              {dirty ? 'Discard changes' : 'Done'}
            </button>
            {hasErrors && <span className="text-xs text-danger">Fix the highlighted fields.</span>}
            {!dirty && !hasErrors && <span className="text-xs text-ink-muted">No changes yet.</span>}
          </div>
        </>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <WalletGuard featureName="Profiles">
      <ProfileInner />
    </WalletGuard>
  );
}
