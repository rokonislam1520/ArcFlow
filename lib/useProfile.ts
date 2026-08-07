'use client';
/**
 * Loads and saves the signed-in user's profile.
 *
 * The profile is tied to the SIWE session rather than the connected wallet:
 * connecting a wallet only reveals an address, which anyone could claim. So
 * this hook waits for authentication and clears its state on sign-out — a
 * stale profile left on screen after signing out would suggest the data is
 * still available when the next request would be rejected.
 *
 * This holds real state and fetches on mount, so it is called once by
 * `ProfileProvider` and read everywhere else through that context. Calling it
 * directly from several components would issue a `/api/profile` request per
 * caller and let the header show a stale name after the profile page saved.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSession } from './SessionProvider';
import { EMPTY_PROFILE, toFields, type Profile, type ProfileFields } from './profile';

export interface ProfileState {
  /** Editable field values, always strings and never null. */
  fields: ProfileFields;
  /** Whether a stored profile exists yet. False for a first-time visitor. */
  exists: boolean;
  loading: boolean;
  saving: boolean;
  /** Top-level failure, e.g. the network or the server. */
  error: string | null;
  /** Per-field messages returned by the server. */
  fieldErrors: Partial<Record<keyof ProfileFields, string>>;
  /** Set after a successful save so the UI can confirm it. */
  savedAt: number | null;
  save: (next: ProfileFields) => Promise<boolean>;
  reload: () => Promise<void>;
  clearStatus: () => void;
}

export function useProfileState(): ProfileState {
  const { status, address } = useSession();
  const authenticated = status === 'signed-in';

  const [fields, setFields] = useState<ProfileFields>({ ...EMPTY_PROFILE });
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ProfileFields, string>>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    // 'unknown' means the session check is still in flight. Fetching now would
    // return 401 and render an empty profile for a moment before the real one
    // arrives, so wait rather than showing something briefly wrong.
    if (status === 'unknown') return;

    if (!authenticated) {
      // Not an error state: signed out simply has no profile to show.
      setFields({ ...EMPTY_PROFILE });
      setExists(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/profile', { credentials: 'same-origin' });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error ?? 'Could not load your profile.');
        return;
      }

      setExists(Boolean(data.exists));
      setFields(toFields(data.profile as Profile | null));
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [authenticated, status]);

  // Reloads when the session changes. Including `address` matters: switching
  // accounts must not leave the previous account's profile on screen.
  useEffect(() => {
    void load();
  }, [load, address]);

  const save = useCallback(
    async (next: ProfileFields): Promise<boolean> => {
      if (!authenticated) {
        setError('Sign in before saving.');
        return false;
      }

      setSaving(true);
      setError(null);
      setFieldErrors({});

      try {
        const response = await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(next),
        });
        const data = await response.json();

        if (!response.ok) {
          setError(data?.error ?? 'Could not save your profile.');
          if (data?.fields) setFieldErrors(data.fields);
          return false;
        }

        // Adopt the server's copy rather than the submitted values: it has
        // applied trimming and null-clearing, and showing anything else would
        // misreport what was actually stored.
        setFields(toFields(data.profile as Profile));
        setExists(true);
        setSavedAt(Date.now());
        return true;
      } catch {
        setError('Could not reach the server.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [authenticated]
  );

  const clearStatus = useCallback(() => {
    setError(null);
    setFieldErrors({});
    setSavedAt(null);
  }, []);

  return {
    fields,
    exists,
    loading,
    saving,
    error,
    fieldErrors,
    savedAt,
    save,
    reload: load,
    clearStatus,
  };
}
