/**
 * Colour theme (light vs dark), selected by the user at runtime.
 *
 * The theme lives on one attribute — `data-theme` on `<html>` — and every
 * colour in the app resolves from the CSS variables that attribute selects.
 * That is what makes the choice global by construction: there is no per-page
 * theme state to fall out of step, so navigating from Swap to Bridge cannot
 * change the appearance, because navigation does not touch the attribute.
 *
 * Structured to match lib/network.ts: module-level state plus a listener set,
 * so several components can read the theme and all of them react to a change at
 * once without a context re-render cascade.
 */
'use client';

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'arcflow.theme';

/** Dark is the product's default look; a first visit with no OS hint gets it. */
export const DEFAULT_THEME: Theme = 'dark';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/**
 * Script injected into the document head, before any painting happens.
 *
 * This is the only way to avoid a flash of the wrong theme. React cannot help:
 * the server has no access to localStorage, so server-rendered markup must
 * commit to a default, and by the time an effect could correct it the browser
 * has already painted. Setting the attribute synchronously in the head means
 * the very first paint is already in the right theme.
 *
 * Kept deliberately tiny and wrapped in try/catch, since it runs blocking and
 * storage access throws outright in some privacy modes.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'${DEFAULT_THEME}';}document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.setAttribute('data-theme','${DEFAULT_THEME}');}})();`;

/** Read the persisted choice. Returns null when absent or unreadable. */
function readStored(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** What the init script actually applied, which is the truth on the client. */
function readApplied(): Theme | null {
  if (typeof document === 'undefined') return null;
  const attr = document.documentElement.getAttribute('data-theme');
  return isTheme(attr) ? attr : null;
}

const listeners = new Set<(theme: Theme) => void>();

let currentTheme: Theme = DEFAULT_THEME;

export function getTheme(): Theme {
  return currentTheme;
}

export function setTheme(theme: Theme): void {
  if (theme === currentTheme) return;
  currentTheme = theme;

  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  // Tells the browser which way to render things we do not style ourselves:
  // form controls, the caret, and the scrollbar on platforms that use it.
  root.style.colorScheme = theme;

  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A failed write only costs persistence; the switch still takes effect.
  }

  listeners.forEach((fn) => fn(theme));
}

export function toggleTheme(): void {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

/**
 * Subscribe to the theme.
 *
 * `ready` is false for the first render on purpose. The server cannot know the
 * stored theme, so it renders the default; adopting the real value during
 * render would make client and server markup disagree and trigger a hydration
 * mismatch. Anything whose *markup* depends on the theme should wait for
 * `ready`, while anything that only needs the right colours needs nothing at
 * all — the CSS variables have been correct since the first paint.
 */
export function useTheme(): {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
  isDark: boolean;
  ready: boolean;
} {
  const [theme, setLocal] = useState<Theme>(currentTheme);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // The init script already resolved stored-choice-then-OS-preference and put
    // the answer on the element, so trust that first and fall back to storage.
    const applied = readApplied() ?? readStored();
    if (applied && applied !== currentTheme) {
      currentTheme = applied;
      setLocal(applied);
    }
    setReady(true);

    listeners.add(setLocal);
    return () => {
      listeners.delete(setLocal);
    };
  }, []);

  return {
    theme,
    setTheme,
    toggle: toggleTheme,
    isDark: theme === 'dark',
    ready,
  };
}
