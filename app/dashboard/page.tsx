'use client';
import Link from 'next/link';

const quickActions = [
  { icon: '💸', label: 'Send', href: '/send', color: 'from-arc-500 to-arc-600' },
  { icon: '🔄', label: 'Swap', href: '/swap', color: 'from-mint-500 to-mint-600' },
  { icon: '🌉', label: 'Bridge', href: '/bridge', color: 'from-blue-500 to-blue-600' },
  { icon: '💳', label: 'Pay', href: '/merchant', color: 'from-amber-500 to-amber-600' },
];

const recentActivity = [
  { type: 'Sent', to: '0x1a2b...3c4d', amount: '250 USDC', time: '2 min ago', status: 'Confirmed' },
  { type: 'Received', from: '0x5e6f...7g8h', amount: '1,000 USDC', time: '1 hour ago', status: 'Confirmed' },
  { type: 'Swap', pair: 'USDC → EURC', amount: '500 USDC', time: '3 hours ago', status: 'Confirmed' },
  { type: 'Bridge', chain: 'Ethereum → ARC', amount: '2,000 USDC', time: 'Yesterday', status: 'Confirmed' },
];

const assets = [
  { symbol: 'USDC', name: 'USD Coin', balance: '8,425.50', value: '$8,425.50', change: '+0.01%' },
  { symbol: 'EURC', name: 'Euro Coin', balance: '1,200.00', value: '$1,308.00', change: '+0.15%' },
  { symbol: 'USDT', name: 'Tether', balance: '500.00', value: '$500.00', change: '-0.02%' },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen py-8 animate-in">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Welcome back 👋</h1>
          <p className="text-slate-400">Here&apos;s your financial overview</p>
        </div>

        {/* Balance Card */}
        <div className="glass glow-teal p-8 mb-8">
          <div className="text-slate-400 text-sm mb-2">Total Balance</div>
          <div className="text-4xl md:text-5xl font-extrabold text-gradient mb-1">$10,233.50</div>
          <div className="text-sm text-mint-400">+$342.20 this month (+3.5%)</div>

          {/* Quick Actions */}
          <div className="grid grid-cols-4 gap-4 mt-8">
            {quickActions.map((a) => (
              <Link key={a.label} href={a.href} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${a.color} flex items-center justify-center text-xl`}>
                  {a.icon}
                </div>
                <span className="text-sm font-medium">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Assets */}
          <div className="lg:col-span-2">
            <div className="glass p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold">Your Assets</h2>
                <Link href="/portfolio" className="text-sm text-arc-400 hover:text-arc-300">View All →</Link>
              </div>

              <div className="space-y-3">
                {assets.map((a) => (
                  <div key={a.symbol} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-arc-500 to-mint-500 flex items-center justify-center text-xs font-bold">
                        {a.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-semibold">{a.symbol}</div>
                        <div className="text-slate-500 text-sm">{a.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{a.balance}</div>
                      <div className="text-slate-400 text-sm">{a.value}</div>
                    </div>
                    <div className={`text-sm font-medium ${a.change.startsWith('+') ? 'text-mint-400' : 'text-red-400'}`}>
                      {a.change}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-1">
            <div className="glass p-6">
              <h2 className="text-lg font-bold mb-6">Recent Activity</h2>

              <div className="space-y-4">
                {recentActivity.map((tx, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-sm mt-0.5">
                      {tx.type === 'Sent' ? '↑' : tx.type === 'Received' ? '↓' : tx.type === 'Swap' ? '↔' : '🌉'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between">
                        <span className="font-medium text-sm">{tx.type}</span>
                        <span className="text-sm">{tx.amount}</span>
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-slate-500 text-xs">{tx.to || tx.from || tx.pair || tx.chain}</span>
                        <span className="text-slate-500 text-xs">{tx.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Insight */}
            <div className="glass p-6 mt-6 border-arc-500/20">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🤖</span>
                <span className="font-semibold text-sm">AI Insight</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Your spending is 12% lower than last month. You could move $2,000 USDC to a savings vault for 8.5% APR.
              </p>
              <Link href="/assistant" className="text-sm text-arc-400 hover:text-arc-300 mt-3 inline-block">
                Open AI Assistant →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
