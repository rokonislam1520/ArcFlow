'use client';
import { useState } from 'react';

const merchants = [
  { name: 'Coffee House', category: 'Food & Drink', amount: '12.50', time: 'Today' },
  { name: 'Metro Transit', category: 'Transport', amount: '3.00', time: 'Today' },
  { name: 'BookStore BD', category: 'Shopping', amount: '45.00', time: 'Yesterday' },
  { name: 'Spotify', category: 'Subscription', amount: '9.99', time: '3 days ago' },
];

const savedMerchants = [
  { name: 'Coffee House', icon: '☕', address: '0xcoffee...1234' },
  { name: 'Metro Card', icon: '🚇', address: '0xmetro...5678' },
  { name: 'Gym Membership', icon: '🏋️', address: '0xgym...9012' },
  { name: 'Netflix', icon: '🎬', address: '0xnetflix...3456' },
];

export default function MerchantPage() {
  const [tab, setTab] = useState<'pay' | 'history' | 'merchants'>('pay');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');

  return (
    <div className="min-h-screen py-8 animate-in">
      <div className="max-w-lg mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Pay Merchant</h1>
          <p className="text-slate-400">Scan & pay at any merchant accepting stablecoins</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {([['pay', 'Pay'], ['history', 'History'], ['merchants', 'Saved']] as const).map(([k, v]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${tab === k ? 'bg-arc-500 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
              {v}
            </button>
          ))}
        </div>

        {tab === 'pay' && (
          <div className="space-y-6">
            {/* QR Scanner Area */}
            <div className="glass p-8 text-center">
              <div className="w-48 h-48 mx-auto rounded-2xl bg-white/[0.03] border-2 border-dashed border-arc-500/30 flex items-center justify-center mb-4">
                <div className="text-center">
                  <div className="text-4xl mb-2">📷</div>
                  <p className="text-sm text-slate-400">Scan QR Code</p>
                </div>
              </div>
              <p className="text-sm text-slate-500">Point camera at merchant QR code</p>
            </div>

            {/* Manual Pay */}
            <div className="glass p-6">
              <h3 className="font-semibold mb-4">Or Pay Manually</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-400 mb-2 block">Merchant</label>
                  <select value={merchant} onChange={(e) => setMerchant(e.target.value)}
                    className="w-full input-arc appearance-none cursor-pointer">
                    <option value="">Select merchant...</option>
                    {savedMerchants.map((m) => <option key={m.name} value={m.name}>{m.icon} {m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-400 mb-2 block">Amount (USDC)</label>
                  <div className="relative">
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                      className="input-arc text-2xl font-bold pr-16" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">USDC</span>
                  </div>
                </div>
                <button className="w-full btn-arc py-4 text-lg" disabled={!amount || !merchant}>
                  Pay ${parseFloat(amount || '0').toFixed(2)}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="glass p-6">
            <h3 className="font-semibold mb-4">Payment History</h3>
            <div className="space-y-3">
              {merchants.map((m, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-lg">💳</div>
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-slate-500 text-xs">{m.category} • {m.time}</div>
                    </div>
                  </div>
                  <div className="text-red-400 font-semibold">-${m.amount}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'merchants' && (
          <div className="glass p-6">
            <h3 className="font-semibold mb-4">Saved Merchants</h3>
            <div className="space-y-3">
              {savedMerchants.map((m, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-all cursor-pointer"
                  onClick={() => { setMerchant(m.name); setTab('pay'); }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-xl">{m.icon}</div>
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-slate-500 text-xs font-mono">{m.address}</div>
                    </div>
                  </div>
                  <button className="btn-arc px-4 py-2 text-sm">Pay</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
