'use client';

const assets = [
  { symbol: 'USDC', name: 'USD Coin', amount: '8,425.50', value: '$8,425.50', chain: 'ARC', pnl: '+$12.50' },
  { symbol: 'EURC', name: 'Euro Coin', amount: '1,200.00', value: '$1,308.00', chain: 'ARC', pnl: '+$45.20' },
  { symbol: 'USDC', name: 'USD Coin', amount: '2,100.00', value: '$2,100.00', chain: 'Ethereum', pnl: '+$3.10' },
  { symbol: 'USDT', name: 'Tether', amount: '500.00', value: '$500.00', chain: 'Polygon', pnl: '-$0.50' },
  { symbol: 'DAI', name: 'Dai', amount: '320.00', value: '$320.00', chain: 'Arbitrum', pnl: '+$1.20' },
];

const chainData = [
  { name: 'ARC', value: '$9,733.50', pct: 76, color: 'bg-arc-500' },
  { name: 'Ethereum', value: '$2,100.00', pct: 16, color: 'bg-blue-500' },
  { name: 'Polygon', value: '$500.00', pct: 4, color: 'bg-purple-500' },
  { name: 'Arbitrum', value: '$320.00', pct: 2.5, color: 'bg-cyan-500' },
];

const txHistory = [
  { type: 'Received', desc: 'From Alice', amount: '+1,000 USDC', time: '2h ago' },
  { type: 'Sent', desc: 'To Bob', amount: '-250 USDC', time: '5h ago' },
  { type: 'Swap', desc: 'USDC → EURC', amount: '500 USDC', time: '1d ago' },
  { type: 'Bridge', desc: 'ETH → ARC', amount: '2,000 USDC', time: '3d ago' },
  { type: 'Merchant', desc: 'Coffee Shop', amount: '-12.50 USDC', time: '4d ago' },
];

export default function PortfolioPage() {
  return (
    <div className="min-h-screen py-8 animate-in">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Portfolio</h1>
          <p className="text-slate-400">Track your stablecoin holdings across all chains</p>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="glass p-6"><div className="text-slate-400 text-sm mb-1">Total Value</div><div className="text-3xl font-bold text-gradient">$12,653.50</div></div>
          <div className="glass p-6"><div className="text-slate-400 text-sm mb-1">Total PnL</div><div className="text-3xl font-bold text-mint-400">+$61.50</div></div>
          <div className="glass p-6"><div className="text-slate-400 text-sm mb-1">Chains</div><div className="text-3xl font-bold">4</div></div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Assets Table */}
          <div className="lg:col-span-2">
            <div className="glass p-6">
              <h2 className="text-lg font-bold mb-4">Assets</h2>
              <div className="space-y-3">
                {assets.map((a, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-all">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-arc-500 to-mint-500 flex items-center justify-center text-xs font-bold">{a.symbol.slice(0, 2)}</div>
                      <div><div className="font-semibold">{a.symbol}</div><div className="text-slate-500 text-sm">{a.chain}</div></div>
                    </div>
                    <div className="text-right"><div className="font-semibold">{a.amount}</div><div className="text-slate-400 text-sm">{a.value}</div></div>
                    <div className={`text-sm font-medium ${a.pnl.startsWith('+') ? 'text-mint-400' : 'text-red-400'}`}>{a.pnl}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Chain Distribution */}
            <div className="glass p-6">
              <h3 className="font-semibold mb-4">Chain Distribution</h3>
              <div className="space-y-4">
                {chainData.map((c) => (
                  <div key={c.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="flex items-center gap-2"><span className={`w-3 h-3 rounded-full ${c.color}`} />{c.name}</span>
                      <span>{c.value}</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2"><div className={`h-2 rounded-full ${c.color}`} style={{ width: `${c.pct}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>

            {/* History */}
            <div className="glass p-6">
              <h3 className="font-semibold mb-4">History</h3>
              <div className="space-y-3">
                {txHistory.map((tx, i) => (
                  <div key={i} className="flex items-center justify-between text-sm p-3 rounded-lg bg-white/[0.03]">
                    <div><div className="font-medium">{tx.type}</div><div className="text-slate-500 text-xs">{tx.desc}</div></div>
                    <div className="text-right"><div className={tx.amount.startsWith('+') ? 'text-mint-400' : tx.amount.startsWith('-') ? 'text-red-400' : ''}>{tx.amount}</div><div className="text-slate-500 text-xs">{tx.time}</div></div>
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
