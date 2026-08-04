/**
 * Network mode (mainnet vs testnet), selected by the user at runtime.
 *
 * This is deliberately not a build-time constant: a single deployment must let
 * a user move between real funds and test funds without a rebuild. The choice
 * persists across reloads because silently reverting to a different network
 * after a refresh is how people send real money to a test address.
 *
 * Testnet and mainnet are never mixed. Circle's routes settle within one
 * network type, so a cross-network transfer cannot complete; keeping the two
 * lists disjoint means the UI can never offer such a route.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';

export type NetworkMode = 'mainnet' | 'testnet';

const STORAGE_KEY = 'arcflow.networkMode';

/**
 * Initial mode when the user has not chosen one. Testnet by default because
 * Arc — the flagship chain — currently exists only as a testnet, so a
 * mainnet-first default would hide it.
 */
export const DEFAULT_MODE: NetworkMode =
  process.env.NEXT_PUBLIC_DEFAULT_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';

function isMode(value: unknown): value is NetworkMode {
  return value === 'mainnet' || value === 'testnet';
}

/** Read the persisted mode. Returns null when absent or unreadable. */
function readStored(): NetworkMode | null {
  // Guard both SSR (no window) and privacy modes where storage access throws.
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Subscribers, so every hook instance reacts to a mode change at once. */
const listeners = new Set<(mode: NetworkMode) => void>();

/**
 * Current mode as a plain value, for non-React callers such as the chain
 * registry. Kept in sync with the React state below.
 */
let currentMode: NetworkMode = DEFAULT_MODE;

export function getNetworkMode(): NetworkMode {
  return currentMode;
}

export function isTestnetMode(): boolean {
  return currentMode === 'testnet';
}

export function setNetworkMode(mode: NetworkMode): void {
  if (mode === currentMode) return;
  currentMode = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // A failed write only costs persistence; the switch still takes effect.
  }
  listeners.forEach((fn) => fn(mode));
}

/**
 * Subscribe to network mode.
 *
 * The stored value is applied in an effect rather than during render: reading
 * localStorage while rendering would make server and client markup differ and
 * trigger a hydration mismatch.
 */
export function useNetworkMode(): {
  mode: NetworkMode;
  setMode: (mode: NetworkMode) => void;
  isTestnet: boolean;
  /** False until the persisted choice has been applied. */
  ready: boolean;
} {
  const [mode, setLocal] = useState<NetworkMode>(currentMode);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored && stored !== currentMode) {
      currentMode = stored;
      setLocal(stored);
    }
    setReady(true);

    listeners.add(setLocal);
    return () => {
      listeners.delete(setLocal);
    };
  }, []);

  const setMode = useCallback((next: NetworkMode) => {
    setNetworkMode(next);
  }, []);

  return { mode, setMode, isTestnet: mode === 'testnet', ready };
}
