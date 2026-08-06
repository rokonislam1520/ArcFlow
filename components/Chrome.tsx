'use client';
/**
 * Chooses which page chrome to render.
 *
 * Most pages use the horizontal Navbar. The dashboard brings its own sidebar
 * and header, so rendering the Navbar there would stack two navigations and
 * two wallet controls on top of each other.
 *
 * This also owns the `<main>` wrapper. DashboardShell declares its own, and
 * nesting one `<main>` inside another is invalid HTML that confuses assistive
 * technology about where the primary content begins.
 */
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Navbar } from '@/components/Navbar';

/** Routes that supply their own full-page chrome. */
const SELF_CHROMED = ['/dashboard'];

export function Chrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const selfChromed = SELF_CHROMED.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (selfChromed) return <>{children}</>;

  return (
    <>
      <Navbar />
      <main>{children}</main>
    </>
  );
}
