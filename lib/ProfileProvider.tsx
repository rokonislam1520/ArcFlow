'use client';
/**
 * Shares one profile across the app.
 *
 * `useProfileState` fetches on mount and owns real state, so calling it from
 * several components would issue a `/api/profile` request per caller and let
 * them drift apart — the header could still show the old display name after
 * the profile page saved a new one. One instance at the root keeps every
 * reader on the same data and makes a save visible everywhere at once.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useProfileState, type ProfileState } from './useProfile';

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const profile = useProfileState();
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
