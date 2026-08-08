import type { Metadata } from 'next';
import './globals.css';
import { Chrome } from '@/components/Chrome';
import { ThemeToggle } from '@/components/ThemeToggle';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { WalletProvider } from '@/lib/WalletProvider';
import { SessionProvider } from '@/lib/SessionProvider';
import { ProfileProvider } from '@/lib/ProfileProvider';
import { ProfileOnboarding } from '@/components/ProfileOnboarding';
import { WalletNotificationProvider, ActivityWatcher } from '@/lib/notifications';

export const metadata: Metadata = {
  title: 'ArcFlow — Multichain Stablecoin Platform',
  description:
    'Send, swap, bridge and pay with stablecoins across Arc and every chain supported by Circle App Kit.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` is required and is scoped to this element
    // alone: the script below sets `data-theme` before React hydrates, so the
    // attribute legitimately differs from the server-rendered markup. Without
    // it React would warn about a mismatch it cannot otherwise be told about.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint so the page is never briefly the wrong
            theme. It has to be inline and blocking — anything deferred, or any
            React effect, resolves only after the browser has already painted,
            which is exactly the flash we are avoiding. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/* `.bg-arc-dark` (globals.css) resolves to the themed page surface, so
          the background follows the active theme without this file knowing
          which one is active. */}
      <body className="bg-arc-dark min-h-screen">
        {/* One wallet session shared by every page, so switching networks in
            the navbar is immediately reflected everywhere. */}
        <WalletProvider>
          {/* Inside WalletProvider: the SIWE session signs with that wallet
              and must end when the account changes. */}
          <SessionProvider>
            {/* Inside SessionProvider: the profile is loaded for the signed-in
                address, and one instance here keeps the header, the account
                menu and the profile page reading the same record. */}
            <ProfileProvider>
              {/* Notifications bind to the connected address and watch for
                  incoming transfers and submitted-transaction confirmations. */}
              <WalletNotificationProvider>
                <ActivityWatcher />
                {/* Chrome applies the shared AppShell (sidebar + header) to every
                    application route, so navigation looks identical on all of
                    them. Only the marketing landing page renders outside it. */}
                <Chrome>{children}</Chrome>
                {/* Asks a first-time user to set up their profile once sign-in
                    succeeds. Renders nothing in every other case. */}
                <ProfileOnboarding />
                {/* Mounted once here, outside Chrome, so a single control serves
                    every route — including the landing page — and the choice
                    cannot vary from page to page. */}
                <ThemeToggle />
              </WalletNotificationProvider>
            </ProfileProvider>
          </SessionProvider>
        </WalletProvider>
      </body>
    </html>
  );
}