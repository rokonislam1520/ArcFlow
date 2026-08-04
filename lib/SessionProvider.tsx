'use client';
/**
 * Shares one SIWE session across the app.
 *
 * `useSiwe` holds real state, so calling it from several components would
 * create several independent sessions — the navbar could show signed-in while
 * a page still believed otherwise. One instance at the root avoids that, and
 * means only one `/api/siwe/session` check runs on load.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useSiwe, type SiweState } from './useSiwe';

const SessionContext = createContext<SiweState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSiwe();
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): SiweState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
