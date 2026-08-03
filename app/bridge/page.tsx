'use client';
import { useState } from 'react';

const chains = [
  { name: 'ARC', icon: '⚡', color: 'bg-arc-500' },
  { name: 'Ethereum', icon: '⟠', color: 'bg-blue-500' },
  { name: 'Polygon', icon: '⬟', color: 'bg-purple-500' },
  { name: 'Arbitrum', icon: '🔵', color: 'bg-cyan-500' },
  { name: 'Base', icon: '🔷', color: 'bg-blue-400' },
  { name: 'Optimism', icon: '🔴', color: 'bg-red-500' },
  { name: 'Avalanche', icon: '🔺', color: 'bg-red-400' },
  { name: 'Solana', icon: '◎', color: 'bg-green-500' },
  { name: 'Sui', icon: 'S', color: 'bg-cyan-400' },
];

export default function BridgePage() {
  const [from, setFrom] = useState(chains[1]);
  const [to, setTo] = useState(chains[0]);
  const [amount, setAmount] = useState('');
  const [showFrom, setShowFrom] = useState(false);
  const [showTo, setShowTo] = useState(false);

  const flip = () => { const t = from; setFrom(to); setTo(t); };

  return (
    <div className="min-h-screen py-8 animate-in">
      <div className="max-w-lg mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Bridge</h1>
          <p className="text-slate-400">Move USDC across 9 chains with Circle CCTP v2</p>
        </div>

        <div className="glass p-6">
          {/* From Chain */}
          <div className="rounded-2xl bg-white/[0.03] p-4 mb-2">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-slate-400">From</span>
              <span className="text-sm text-slate-500">Balance: 1,234.56 USDC</span>
            </div>
            <div className="flex items-center gap-4">
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0"
                className="bg-transparent text-3xl font-bold outline-none flex-1 min-w-0 text-white" />
              <div className="relative">
                <button onClick={() => { setShowFrom(!showFrom); setShowTo(false); }}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2 transition-all">
                  <span>{from.icon}</span>
                  <span className="font-semibold">{from.name}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showFrom && (
                  <div className="absolute top-full right-0 mt-2 w-48 glass p-2 z-10">
                    {chains.map((c) => (
                      <button key={c.name} onClick={() => { setFrom(c); setShowFrom(false); }}
                        className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 text-sm">
                        <span>{c.icon}</span><span>{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="text-sm text-slate-500 mt-2">≈ ${parseFloat(amount || '0').toFixed(2)}</div>
          </div>

          {/* Flip */}
          <div className="flex justify-center -my-3 relative z-10">
            <button onClick={flip} className="bg-slate-850 border-4 border-slate-950 rounded-xl p-2 hover:bg-arc-500/20 transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
            </button>
          </div>

          {/* To Chain */}
          <div className="rounded-2xl bg-white/[0.03] p-4 mt-2 mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-slate-400">To</span>
              <span className="text-sm text-slate-500">Balance: 500.00 USDC</span>
            </div>
            <div className="flex items-center gap-4">
              <input type="text" value={amount ? (parseFloat(amount) * 0.999).toFixed(2) : ''} readOnly placeholder="0.0"
                className="bg-transparent text-3xl font-bold outline-none flex-1 min-w-0 text-white" />
              <div className="relative">
                <button onClick={() => { setShowTo(!showTo); setShowFrom(false); }}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2 transition-all">
                  <span>{to.icon}</span>
                  <span className="font-semibold">{to.name}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showTo && (
                  <div className="absolute top-full right-0 mt-2 w-48 glass p-2 z-10">
                    {chains.map((c) => (
                      <button key={c.name} onClick={() => { setTo(c); setShowTo(false); }}
                        className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 text-sm">
                        <span>{c.icon}</span><span>{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="space-y-2 mb-6 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Route</span><span>{from.name} → {to.name}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Fee</span><span>0.1 USDC</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Est. Time</span><span className="text-mint-400">~2 min</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Powered By</span><span className="text-arc-400">Circle CCTP v2</span></div>
          </div>

          <button className="w-full btn-arc py-4 text-lg" disabled={!amount}>
            {!amount ? 'Enter Amount' : 'Bridge'}
          </button>
        </div>

        {/* Supported Chains */}
        <div className="glass p-6 mt-6">
          <h3 className="font-semibold mb-4">Supported Chains</h3>
          <div className="grid grid-cols-3 gap-3">
            {chains.map((c) => (
              <div key={c.name} className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.03] text-sm">
                <span className="text-lg">{c.icon}</span>
                <span>{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
