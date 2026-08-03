'use client';
import { useState } from 'react';

const tokens = [
  { symbol: 'USDC', name: 'USD Coin', balance: '8,425.50', price: 1.00 },
  { symbol: 'EURC', name: 'Euro Coin', balance: '1,200.00', price: 1.09 },
  { symbol: 'USDT', name: 'Tether', balance: '500.00', price: 1.00 },
  { symbol: 'DAI', name: 'Dai', balance: '320.00', price: 1.00 },
];

export default function SwapPage() {
  const [from, setFrom] = useState(tokens[0]);
  const [to, setTo] = useState(tokens[1]);
  const [fromAmt, setFromAmt] = useState('');
  const [slippage, setSlippage] = useState(0.5);

  const flipTokens = () => { const t = from; setFrom(to); setTo(t); };

  const toAmt = fromAmt ? (parseFloat(fromAmt) * from.price / to.price).toFixed(6) : '';

  return (
    <div className="min-h-screen py-8 animate-in">
      <div className="max-w-lg mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Smart Swap</h1>
          <p className="text-slate-400">AI-powered routing for the best stablecoin rates</p>
        </div>

        <div className="glass p-6">
          {/* Slippage */}
          <div className="flex justify-between items-center mb-6">
            <span className="text-sm text-slate-400">Slippage</span>
            <div className="flex gap-2">
              {[0.1, 0.5, 1.0].map((v) => (
                <button key={v} onClick={() => setSlippage(v)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${slippage === v ? 'bg-arc-500 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
                  {v}%
                </button>
              ))}
            </div>
          </div>

          {/* From */}
          <div className="rounded-2xl bg-white/[0.03] p-4 mb-2">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-slate-400">You Pay</span>
              <span className="text-sm text-slate-500">Balance: {from.balance}</span>
            </div>
            <div className="flex items-center gap-4">
              <input type="number" value={fromAmt} onChange={(e) => setFromAmt(e.target.value)} placeholder="0.0"
                className="bg-transparent text-3xl font-bold outline-none flex-1 min-w-0 text-white" />
              <select value={from.symbol} onChange={(e) => setFrom(tokens.find(t => t.symbol === e.target.value)!)}
                className="bg-white/10 text-white rounded-xl px-4 py-2 font-semibold outline-none cursor-pointer appearance-none pr-8"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2314b8a6'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundSize: '1.2em' }}>
                {tokens.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
              </select>
            </div>
            <div className="text-sm text-slate-500 mt-2">≈ ${(parseFloat(fromAmt || '0') * from.price).toFixed(2)}</div>
          </div>

          {/* Flip */}
          <div className="flex justify-center -my-3 relative z-10">
            <button onClick={flipTokens} className="bg-slate-850 border-4 border-slate-950 rounded-xl p-2 hover:bg-arc-500/20 transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* To */}
          <div className="rounded-2xl bg-white/[0.03] p-4 mt-2 mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-slate-400">You Receive</span>
              <span className="text-sm text-slate-500">Balance: {to.balance}</span>
            </div>
            <div className="flex items-center gap-4">
              <input type="text" value={toAmt} readOnly placeholder="0.0"
                className="bg-transparent text-3xl font-bold outline-none flex-1 min-w-0 text-white" />
              <select value={to.symbol} onChange={(e) => setTo(tokens.find(t => t.symbol === e.target.value)!)}
                className="bg-white/10 text-white rounded-xl px-4 py-2 font-semibold outline-none cursor-pointer appearance-none pr-8"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2314b8a6'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundSize: '1.2em' }}>
                {tokens.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
              </select>
            </div>
            <div className="text-sm text-slate-500 mt-2">≈ ${(parseFloat(toAmt || '0') * to.price).toFixed(2)}</div>
          </div>

          {/* Route */}
          <div className="space-y-2 mb-6 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Route</span><span>{from.symbol} → {to.symbol} <span className="text-mint-400 text-xs ml-1">Best Rate</span></span></div>
            <div className="flex justify-between"><span className="text-slate-400">Price Impact</span><span className="text-mint-400">&lt;0.01%</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Network Fee</span><span className="text-mint-400">$0.00</span></div>
          </div>

          <button className="w-full btn-arc py-4 text-lg" disabled={!fromAmt}>
            {!fromAmt ? 'Enter Amount' : 'Swap'}
          </button>
        </div>
      </div>
    </div>
  );
}
