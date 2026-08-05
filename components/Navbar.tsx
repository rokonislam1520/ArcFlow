'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ConnectButton } from '@/components/ConnectButton';
import { NetworkSwitcher } from '@/components/NetworkSwitcher';
import { NotificationBell } from '@/components/NotificationBell';

const links = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Send', href: '/send' },
  { name: 'Receive', href: '/receive' },
  { name: 'Swap', href: '/swap' },
  { name: 'Bridge', href: '/bridge' },
  { name: 'Split', href: '/split' },
  { name: 'Recurring', href: '/recurring' },
  { name: 'Portfolio', href: '/portfolio' },
  { name: 'History', href: '/history' },
  { name: 'Pay', href: '/merchant' },
  { name: 'Profile', href: '/profile' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 glass border-b border-arc-500/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-arc-500 to-mint-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-gradient">ArcFlow</span>
          </Link>

          <div className="hidden lg:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.name}
                href={l.href}
                className="px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all"
              >
                {l.name}
              </Link>
            ))}
          </div>

          {/* Wallet + network selection live in one shared control so every
              page sees the same session. The mainnet/testnet switch sits
              alongside it because it changes what every other control means. */}
          <div className="hidden lg:flex items-center gap-3">
            <NotificationBell />
            <NetworkSwitcher />
            <ConnectButton />
          </div>

          <button onClick={() => setOpen(!open)} className="lg:hidden p-2 rounded-lg hover:bg-white/5">
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
              className="block px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
            >
              {l.name}
            </Link>
          ))}
          <div className="pt-3 border-t border-white/10 space-y-3">
            <NotificationBell />
            <NetworkSwitcher />
            <ConnectButton />
          </div>
        </div>
      )}
    </nav>
  );
}
