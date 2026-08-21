'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AccountMenu } from '@/components/AccountMenu';
import { ConnectButton } from '@/components/ConnectButton';
import { Logo } from '@/components/Logo';
import { NotificationBell } from '@/components/NotificationBell';

import { useWallet } from '@/lib/WalletProvider';
import { useNetworkMode } from '@/lib/network';

const links = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Send', href: '/send' },
  { name: 'Receive', href: '/receive' },
  { name: 'Swap', href: '/swap' },
  { name: 'Bridge', href: '/bridge' },
  { name: 'Portfolio', href: '/portfolio' },
  { name: 'History', href: '/history' },
  // Business pair: Merchant raises a request, Pay settles one. Both are
  // top-level because a customer arriving from a link needs Pay to exist as a
  // place, not just as a URL someone sent them.
  { name: 'Merchant', href: '/merchant' },
  { name: 'Pay', href: '/pay' },
];

/**
 * Account destinations, kept out of the main row.
 *
 * Profile lives in the menu rather than the top-level nav, alongside the
 * dashboard sidebar's Account group. It is a settings page visited rarely, and
 * giving it equal billing with Send and Swap overstated how often anyone needs
 * it. The account menu covers the frequent actions — address, network,
 * disconnect — without leaving the page.
 */
const accountLinks = [
  { name: 'Profile', href: '/profile' },
  { name: 'Assistant', href: '/assistant' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { address } = useWallet();
  const { isTestnet, ready } = useNetworkMode();

  return (
    <nav className="sticky top-0 z-50 glass border-b border-arc-500/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3">
            {/* Flat accent under an ink rule. The mark was a purple-to-green
                gradient; two hues in a logo the size of a thumbnail read as
                muddy, and the app now has exactly one brand colour. */}
            <div className="w-9 h-9 rounded-xl bg-accent border-2 border-hairline flex items-center justify-center">
              {/* Ink, not white: the accent is a high-luminance chartreuse, and
                  a white glyph on it is close to invisible. */}
              <Logo className="w-[22px] h-[22px] text-accent-contrast" />
            </div>

            <span className="text-lg font-bold text-gradient">ArcFlow</span>
          </Link>

          <div className="hidden lg:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.name}
                href={l.href}
                className="px-3 py-2 rounded-xl text-sm text-ink-secondary hover:text-ink-primary hover:bg-surface-hover/[0.06] transition-all"
              >
                {l.name}
              </Link>
            ))}
          </div>

          {/* One mode badge, then the account menu. The chain name is not
              repeated here: it lives in the menu, next to the control that
              changes it. */}
          <div className="hidden lg:flex items-center gap-3">
            {ready && (
              <span
                className={[
                  'text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md border',
                  isTestnet
                    ? 'text-warning border-amber-500/30 bg-amber-500/10'
                    : 'text-success border-mint-500/25 bg-mint-500/10',
                ].join(' ')}
                title={isTestnet ? 'Testnet funds have no value' : 'Live network — real funds'}
              >
                {isTestnet ? 'Testnet' : 'Mainnet'}
              </span>
            )}
            <NotificationBell />
            {address ? <AccountMenu /> : <ConnectButton />}
          </div>

          <button onClick={() => setOpen(!open)} className="lg:hidden p-2 rounded-lg hover:bg-surface-hover/[0.06]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden glass border-t border-arc-500/10 px-4 py-4 space-y-2">
          {links.map((l) => (
            <Link
              key={l.name}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-3 rounded-xl text-ink-secondary hover:text-ink-primary hover:bg-surface-hover/[0.06]"
            >
              {l.name}
            </Link>
          ))}
          {/* Account section: the only route to Profile. */}
          <div className="pt-3 border-t border-hairline space-y-2">
            <div className="px-4 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
              Account
            </div>
            {accountLinks.map((l) => (
              <Link
                key={l.name}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-3 rounded-xl text-ink-secondary hover:text-ink-primary hover:bg-surface-hover/[0.06]"
              >
                {l.name}
              </Link>
            ))}
          </div>

          <div className="pt-3 border-t border-hairline flex items-center gap-3">
            <NotificationBell />
            {address ? <AccountMenu /> : <ConnectButton />}
          </div>
        </div>
      )}
    </nav>
  );
}
