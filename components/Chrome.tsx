'use client';
/**
 * Chooses which page chrome to render.
 *
 * Every application route renders inside the same `AppShell`, so the sidebar
 * and header are identical everywhere and navigating only swaps the content.
 * This used to be the other way round — the dashboard opted in to the shell and
 * everything else got a horizontal navbar — which meant moving from Dashboard
 * to Send replaced the whole frame and made one app look like two.
 *
 * The list below is therefore an opt-*out*, and deliberately small. Adding a
 * route no longer requires touching this file to get the standard chrome: new
 * pages are shell pages by default, which is the outcome we want to be the easy
 * one.
 *
 * Whichever branch runs owns the `<main>` wrapper. Pages must not declare their
 * own, since nesting one `<main>` inside another is invalid HTML that confuses
 * assistive technology about where the primary content begins.
 */
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Navbar } from '@/components/Navbar';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * Routes that render outside the application shell.
 *
 * Only the marketing landing page. It has its own hero, feature grid and
 * footer, and a product sidebar beside a "Launch App" call to action would be
 * both redundant and confusing about whether you are already in the app. It
 * keeps the horizontal `Navbar`, which is now its sole remaining use: the page
 * has no top bar of its own, so dropping the component entirely would leave it
 * with no logo and no way to connect.
 */
const UNSHELLED = ['/'];

export function Chrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (UNSHELLED.includes(pathname)) {
    return (
      <>
        <Navbar />
        <main>{children}</main>
        {/* No sidebar, so no footer group to hold the theme switcher — it
            floats in the bottom-left corner here. Unscoped to breakpoint: on a
            phone the landing page has neither sidebar footer nor AppShell, so
            hiding it under `lg` would make the theme unreachable. */}
        <ThemeToggle />
      </>
    );
  }

  // Shell routes mount the switcher themselves, in the sidebar footer group.
  return <AppShell>{children}</AppShell>;
}
