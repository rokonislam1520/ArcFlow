'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useWallet } from '@/lib/useWallet';

const links = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Send', href: '/send' },
  { name: 'Swap', href: '/swap' },
  { name: 'Bridge', href: '/bridge' },
  { name: 'Portfolio', href: '/portfolio' },
  { name: 'Pay', href: '/merchant' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { address, isConnected, connect, disconnect } = useWallet();

  const shortAddr = address ? address.slice(0, 6) + '...' + address.slice(-4) : '';

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

          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link key={l.name} href={l.href} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all">
                {l.name}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {isConnected ? (
              <>
                <span className="px-3 py-1.5 rounded-lg bg-arc-500/10 text-arc-400 text-xs font-semibold">ARC Testnet</span>
                <div className="flex items-center gap-2 bg-white/5 border border-arc-500/20 rounded-xl px-4 py-2.5">
                  <div className="w-2 h-2 rounded-full bg-mint-400" />
                  <span className="font-mono text-sm">{shortAddr}</span>
                </div>
                <button onClick={disconnect} className="text-slate-500 hover:text-red-400 transition-all" title="Disconnect">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </>
            ) : (
              <button onClick={connect} className="btn-arc text-sm px-5 py-2.5">
                Connect Wallet
              </button>
            )}
          </div>

          <button onClick={() => setOpen(!open)} className="md:hidden p-2 rounded-lg hover:bg-white/5">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {open
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              }
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden glass border-t border-arc-500/10 px-4 py-4 space-y-2">
          {links.map((l) => (
            <Link key={l.name} href={l.href} onClick={() => setOpen(false)} className="block px-4 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-white/5">
              {l.name}
            </Link>
          ))}
          {isConnected ? (
            <div className="pt-2 border-t border-white/10 space-y-2">
              <div className="flex items-center gap-2 px-4 py-2">
                <div className="w-2 h-2 rounded-full bg-mint-400" />
                <span className="font-mono text-sm text-arc-400">{shortAddr}</span>
              </div>
              <button onClick={() => { disconnect(); setOpen(false); }} className="w-full text-left px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10">
                Disconnect
              </button>
            </div>
          ) : (
            <button onClick={() => { connect(); setOpen(false); }} className="w-full btn-arc text-sm py-3 mt-2">
              Connect Wallet
            </button>
          )}
        </div>
      )}
    </nav>
  );
}