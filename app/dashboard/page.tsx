'use client';
import Link from 'next/link';
import { useWallet } from '@/lib/useWallet';
import { useTokenBalances, formatAmount } from '@/lib/useTokenBalance';
import { useActivity, shortenAddress } from '@/lib/useActivity';
import { WalletGuard } from '@/components/WalletGuard';
import { AVAILABLE_TOKENS, USDC_DECIMALS } from '@/lib/config';

const quickActions = [
  { icon: '💸', label: 'Send', href: '/send', color: 'from-arc-500 to-arc-600' },
  { icon: '🔄', label: 'Swap', href: '/swap', color: 'from-mint-500 to-mint-600' },
  { icon: '🧾', label: 'Split', href: '/split', color: 'from-blue-500 to-blue-600' },
  { icon: '💳', label: 'Pay', href: '/merchant', color: 'from-amber-500 to-amber-600' },
];

function DashboardView() {
  const { address } = useWallet();
  const { balances, isLoading, error } = useTokenBalances(address, AVAILABLE_TOKENS);
  const { activity, isLoading: activityLoading, error: activityError } = useActivity(address, 6);

  const assets = AVAILABLE_TOKENS.map((t) => ({
    ...t,
    raw: balances[t.symbol] ?? null,
  }));

  return (
    <div className="min-h-screen py-8 animate-in">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Welcome back 👋</h1>
          <p className="text-slate-400 font-mono text-sm">{address}</p>
        </div>

        <div className="glass glow-teal p-8 mb-8">
          <div className="text-slate-400 text-sm mb-2">USDC Balance</div>
          <div className="text-4xl md:text-5xl font-extrabold text-gradient mb-1">
            {isLoading
              ? '…'
              : balances['USDC'] !== undefined
                ? formatAmount(balances['USDC'], USDC_DECIMALS, 2)
                : '—'}
          </div>
          <div className="text-sm text-slate-500">On {AVAILABLE_TOKENS.length} tracked tokens</div>

          <div className="grid grid-cols-4 gap-4 mt-8">
            {quickActions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-all"
              >
                <div
                  className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${a.color} flex items-center justify-center text-xl`}
                >
                  {a.icon}
                </div>
                <span className="text-sm font-medium">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="glass p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold">Your Assets</h2>
                <Link href="/portfolio" className="text-sm text-arc-400 hover:text-arc-300">
                  View All →
                </Link>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}
              {isLoading && <p className="text-slate-400 text-sm">Reading balances…</p>}

              <div className="space-y-3">
                {assets.map((a) => (
                  <div
                    key={a.symbol}
                    className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-arc-500 to-mint-500 flex items-center justify-center text-xs font-bold">
                        {a.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-semibold">{a.symbol}</div>
                        <div className="text-slate-500 text-sm">{a.name}</div>
                      </div>
                    </div>
                    <div className="text-right font-semibold">
                      {a.raw === null ? '—' : formatAmount(a.raw, a.decimals)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="glass p-6">
              <h2 className="text-lg font-bold mb-6">Recent Activity</h2>

              {activityLoading && <p className="text-slate-400 text-sm">Loading from chain…</p>}
              {activityError && <p className="text-red-400 text-sm">{activityError}</p>}
              {!activityLoading && !activityError && activity.length === 0 && (
                <p className="text-slate-400 text-sm">No transfers yet.</p>
              )}

              <div className="space-y-4">
                {activity.map((tx) => (
                  <div key={tx.txHash} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-sm mt-0.5">
                      {tx.direction === 'sent' ? '↑' : '↓'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between">
                        <span className="font-medium text-sm capitalize">{tx.direction}</span>
                        <span
                          className={`text-sm ${
                            tx.direction === 'received' ? 'text-mint-400' : ''
                          }`}
                        >
                          {tx.direction === 'sent' ? '-' : '+'}
                          {formatAmount(tx.amount, USDC_DECIMALS)} USDC
                        </span>
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-slate-500 text-xs font-mono">
                          {shortenAddress(tx.counterparty)}
                        </span>
                        <span className="text-slate-500 text-xs">
                          block {tx.blockNumber.toString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <WalletGuard featureName="Dashboard">
      <DashboardView />
    </WalletGuard>
  );
}
