'use client';
/**
 * Dashboard shell: collapsible sidebar plus top header.
 *
 * The app's global Navbar is a horizontal bar suited to single-purpose pages.
 * The dashboard needs persistent navigation alongside dense panels, so this
 * provides its own chrome and the route hides the Navbar rather than stacking
 * two navigations.
 *
 * Collapse state persists in localStorage: a user who works collapsed should
 * not have to re-collapse on every visit.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { AccountMenu } from '@/components/AccountMenu';
import { ConnectButton } from '@/components/ConnectButton';
import { NotificationBell } from '@/components/NotificationBell';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { chainDisplayName } from '@/lib/chainBrand';
import { useNetworkMode } from '@/lib/network';
import { shortAddress } from '@/lib/useTransfers';
import { StatusDot } from '@/components/dashboard/Primitives';

/** Nav model. Grouped so the list stays scannable as it grows. */
const NAV_GROUPS: Array<{
  heading: string | null;
  items: Array<{ label: string; href: string; icon: ReactNode }>;
}> = [
  {
    heading: null,
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: <Icon d="M3 12h7V3H3v9zm11 9h7v-9h-7v9zM3 21h7v-6H3v6zM14 3v6h7V3h-7z" /> },
      { label: 'Portfolio', href: '/portfolio', icon: <Icon d="M3 3v18h18M7 15l4-4 3 3 5-6" /> },
    ],
  },
  {
    heading: 'Move money',
    items: [
      { label: 'Send', href: '/send', icon: <Icon d="M12 19V5M5 12l7-7 7 7" /> },
      { label: 'Receive', href: '/receive', icon: <Icon d="M12 5v14M5 12l7 7 7-7" /> },
      { label: 'Swap', href: '/swap', icon: <Icon d="M3 7h14M14 3l4 4-4 4M17 13H3M6 9l-4 4 4 4" /> },
      { label: 'Bridge', href: '/bridge', icon: <Icon d="M4 12h16M4 12a8 8 0 0116 0M7 12v6M17 12v6" /> },
      { label: 'Split', href: '/split', icon: <Icon d="M6 3v6a3 3 0 003 3h6a3 3 0 013 3v6M6 21V9" /> },
      { label: 'Recurring', href: '/recurring', icon: <Icon d="M3 12a9 9 0 019-9 9 9 0 018 5M21 12a9 9 0 01-9 9 9 9 0 01-8-5M17 8h4V4M7 16H3v4" /> },
    ],
  },
  {
    heading: 'Business',
    items: [
      { label: 'Merchant', href: '/merchant', icon: <Icon d="M3 9l1-5h16l1 5M4 9v11h16V9M9 20v-6h6v6" /> },
      { label: 'History', href: '/history', icon: <Icon d="M12 8v5l3 2M3 12a9 9 0 109-9 9 9 0 00-9 9zM3 12H1M3 12l2-2" /> },
    ],
  },
  {
    heading: 'Account',
    items: [
      { label: 'Profile', href: '/profile', icon: <Icon d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" /> },
      { label: 'Assistant', href: '/assistant', icon: <Icon d="M12 3a9 9 0 019 9v5a3 3 0 01-3 3H6a3 3 0 01-3-3v-5a9 9 0 019-9zM9 13h.01M15 13h.01" /> },
    ],
  },
];

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-[18px] h-[18px] shrink-0"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const COLLAPSE_KEY = 'arcflow.sidebar.collapsed';

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // Mobile uses an overlay drawer rather than an inline rail.
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // Storage unavailable; the default expanded state is fine.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Preference just won't persist.
      }
      return next;
    });
  };

  // Close the mobile drawer on navigation, or it covers the page you asked for.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen flex">
      {/* Mobile scrim */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        collapsed={collapsed}
        drawerOpen={drawerOpen}
        pathname={pathname}
        onToggleCollapse={toggleCollapsed}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopHeader onOpenDrawer={() => setDrawerOpen(true)} />
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({
  collapsed,
  drawerOpen,
  pathname,
  onToggleCollapse,
}: {
  collapsed: boolean;
  drawerOpen: boolean;
  pathname: string;
  onToggleCollapse: () => void;
}) {
  const { address, wallet, isConnecting } = useWallet();
  const chain = useActiveChain();

  const width = collapsed ? 'lg:w-[76px]' : 'lg:w-[248px]';

  return (
    <aside
      className={[
        'fixed lg:sticky top-0 z-50 h-screen shrink-0',
        'bg-[#0b1120]/95 lg:bg-[#0b1120]/70 backdrop-blur-xl',
        'border-r border-arc-500/10 flex flex-col',
        'transition-[width,transform] duration-300 ease-out',
        'w-[248px]',
        width,
        drawerOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}
    >
      {/* Brand */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-white/5 shrink-0">
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-arc-500 to-mint-500 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          {!collapsed && <span className="text-lg font-bold text-gradient truncate">ArcFlow</span>}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.heading ?? `group-${gi}`}>
            {group.heading && !collapsed && (
              <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                {group.heading}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm',
                      'transition-colors duration-150',
                      collapsed ? 'justify-center' : '',
                      active
                        ? 'bg-arc-500/12 text-arc-300 font-medium'
                        : 'text-slate-400 hover:text-white hover:bg-white/5',
                    ].join(' ')}
                  >
                    {/* Active marker doubles as the cue when collapsed hides labels. */}
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-arc-400" />
                    )}
                    {item.icon}
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Wallet status */}
      <div className="p-3 border-t border-white/5 shrink-0">
        {collapsed ? (
          <div className="flex justify-center py-2" title={address ? shortAddress(address) : 'Not connected'}>
            <StatusDot ok={address ? true : null} />
          </div>
        ) : (
          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <StatusDot ok={address ? true : null} />
              <span className="text-xs font-medium truncate">
                {isConnecting
                  ? 'Connecting…'
                  : address
                    ? (wallet?.name ?? 'Wallet')
                    : 'Not connected'}
              </span>
            </div>
            {address ? (
              <>
                <div className="font-mono text-[11px] text-slate-400 truncate">
                  {shortAddress(address)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 truncate">
                  {chainDisplayName(chain)}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-slate-500">
                Connect to see balances and act on them.
              </p>
            )}
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex mt-2 w-full items-center justify-center gap-2 rounded-lg py-2 text-xs text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-4 h-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

function TopHeader({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const { address } = useWallet();
  const { isTestnet, ready } = useNetworkMode();

  return (
    <header className="sticky top-0 z-30 h-16 flex items-center gap-3 px-4 sm:px-6 lg:px-8 border-b border-arc-500/10 bg-[#020617]/80 backdrop-blur-xl">
      {/* Mobile menu */}
      <button
        onClick={onOpenDrawer}
        className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-white/5 shrink-0"
        aria-label="Open navigation"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <GlobalSearch />

      <div className="flex-1" />

      {/* One mode indicator, and only the mode. The chain name used to sit
          beside it and again inside the network control, which said the same
          thing three times over; the chain now lives solely in the account
          menu. This badge stays because mistaking test funds for real ones is
          the expensive error, and it is deliberately loud in testnet mode.
          Rendered only once the stored choice is known, so it cannot claim
          "Mainnet" for a frame before flipping. */}
      {ready && (
        <span
          className={[
            'hidden sm:inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md border shrink-0',
            isTestnet
              ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
              : 'text-mint-300 border-mint-500/25 bg-mint-500/10',
          ].join(' ')}
          title={isTestnet ? 'Testnet funds have no value' : 'Live network — real funds'}
        >
          {isTestnet ? 'Testnet' : 'Mainnet'}
        </span>
      )}

      <NotificationBell />

      {/* Address opens the account menu, not the profile page: it describes the
          connection, and switching networks or disconnecting are what people
          actually come here to do. */}
      {address ? <AccountMenu /> : <ConnectButton />}
    </header>
  );
}

/**
 * Global search over the app's own destinations.
 *
 * Scoped to navigation on purpose: there is no index of tokens or transactions
 * to search, and a box that silently matched nothing but page names while
 * appearing to search everything would be misleading.
 */
function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const all = NAV_GROUPS.flatMap((g) => g.items);
  const matches = query
    ? all.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    : [];

  // Cmd/Ctrl-K focuses the box, matching the convention users expect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('arcflow-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative w-full max-w-xs sm:max-w-sm">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          id="arcflow-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // Delayed so a click on a result registers before the list unmounts.
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder="Search pages…"
          className="w-full h-9 pl-9 pr-12 rounded-xl bg-white/[0.04] border border-white/10 text-sm
                     placeholder:text-slate-600 focus:border-arc-500/40 focus:bg-white/[0.06]
                     outline-none transition-colors"
        />
        <kbd className="hidden sm:block absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 border border-white/10 rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
      </div>

      {open && query && (
        <div className="absolute top-11 left-0 right-0 glass p-1.5 z-50 max-h-72 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-slate-500">
              No page matches “{query}”. Search covers navigation only.
            </p>
          ) : (
            matches.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/5 hover:text-white"
              >
                {m.icon}
                {m.label}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
