import type { Metadata } from 'next';
import './globals.css';
import { Chrome } from '@/components/Chrome';
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
    <html lang="en">
      {/* The ambient background lives entirely in `.bg-arc-dark` (globals.css):
          a deep-space base tint with four very low-opacity glow pools, fixed so
          it stays put while content scrolls. Defining it there rather than as
          overlay elements here means every route inherits the same depth, and
          there is no blurred layer for the browser to composite on scroll. */}
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
                {/* Chrome picks the navigation for the route: most pages get the
                    Navbar, the dashboard supplies its own sidebar and header. */}
                <Chrome>{children}</Chrome>
                {/* Asks a first-time user to set up their profile once sign-in
                    succeeds. Renders nothing in every other case. */}
                <ProfileOnboarding />
              </WalletNotificationProvider>
            </ProfileProvider>
          </SessionProvider>
        </WalletProvider>
      </body>
    </html>
  );
}