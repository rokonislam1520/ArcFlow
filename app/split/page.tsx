'use client';
import { useState } from 'react';

const activeGroups = [
  {
    name: 'Dinner Friday',
    members: ['Alice', 'Bob', 'Carol', 'You'],
    total: '120.00',
    yourShare: '30.00',
    status: 'Pending',
  },
  {
    name: 'Apartment Rent',
    members: ['You', 'Dave', 'Eve'],
    total: '3,000.00',
    yourShare: '1,000.00',
    status: 'Settled',
  },
  {
    name: 'Weekend Trip',
    members: ['Alice', 'Bob', 'You', 'Frank', 'Grace'],
    total: '850.00',
    yourShare: '170.00',
    status: 'Partial',
  },
];

const recentSettlements = [
  { from: 'Alice', amount: '30.00', group: 'Dinner Friday', time: '2h ago' },
  { from: 'Bob', amount: '30.00', group: 'Dinner Friday', time: '3h ago' },
  { from: 'You', amount: '1,000.00', group: 'Apartment Rent', time: '1d ago' },
];

export default function SplitPage() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="min-h-screen py-8 animate-in">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Split Bills</h1>
            <p className="text-slate-400">Split expenses with friends — settle in one tap</p>
          </div>
          <button className="btn-arc px-4 py-2 text-sm" onClick={() => setShowCreate(!showCreate)}>
            + New Split
          </button>
        </div>

        {/* Create Form */}
        {showCreate && (
          <div className="glass p-6 mb-6">
            <h3 className="font-semibold mb-4">Create New Split</h3>
            <div className="space-y-4">
              <div><label className="text-sm text-slate-400 mb-2 block">Event Name</label><input type="text" placeholder="e.g. Dinner Friday" className="input-arc" /></div>
              <div><label className="text-sm text-slate-400 mb-2 block">Total Amount (USDC)</label><input type="number" placeholder="0.00" className="input-arc" /></div>
              <div><label className="text-sm text-slate-400 mb-2 block">Add Members</label>
                <div className="flex gap-2">
                  <input type="text" placeholder="Wallet address or name" className="input-arc flex-1" />
                  <button className="btn-arc px-4">Add</button>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {['Alice', 'Bob', 'Carol'].map((m) => (
                  <span key={m} className="px-3 py-1 rounded-full bg-arc-500/20 text-arc-400 text-sm flex items-center gap-1">
                    {m} <button className="hover:text-white">×</button>
                  </span>
                ))}
              </div>
              <div><label className="text-sm text-slate-400 mb-2 block">Split Method</label>
                <div className="flex gap-2">
                  <button className="flex-1 py-2 rounded-xl bg-arc-500 text-white text-sm font-semibold">Equal</button>
                  <button className="flex-1 py-2 rounded-xl bg-white/5 text-slate-400 text-sm hover:bg-white/10">Custom</button>
                </div>
              </div>
              <div className="flex gap-3">
                <button className="flex-1 btn-outline py-3" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="flex-1 btn-arc py-3">Create Split</button>
              </div>
            </div>
          </div>
        )}

        {/* Active Splits */}
        <div className="glass p-6 mb-6">
          <h2 className="font-semibold mb-4">Active Splits</h2>
          <div className="space-y-4">
            {activeGroups.map((g, i) => (
              <div key={i} className="p-4 rounded-xl bg-white/[0.03]">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-semibold">{g.name}</div>
                    <div className="text-slate-500 text-sm">{g.members.length} members</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    g.status === 'Settled' ? 'badge-success' : g.status === 'Pending' ? 'badge-warning' : 'bg-blue-500/15 text-blue-400'
                  }`}>{g.status}</span>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  {g.members.map((m, j) => (
                    <div key={j} className="w-7 h-7 rounded-full bg-gradient-to-br from-arc-500 to-mint-500 flex items-center justify-center text-xs font-bold -ml-1 first:ml-0 border-2 border-slate-900">
                      {m[0]}
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Total: ${g.total}</span>
                  <span className="font-medium">Your share: <span className="text-arc-400">${g.yourShare}</span></span>
                </div>

                {g.status !== 'Settled' && (
                  <button className="w-full btn-arc py-2.5 mt-3 text-sm">Settle My Share</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Settlements */}
        <div className="glass p-6">
          <h2 className="font-semibold mb-4">Recent Settlements</h2>
          <div className="space-y-3">
            {recentSettlements.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-mint-500/20 flex items-center justify-center text-mint-400 text-sm">✓</div>
                  <div>
                    <div className="font-medium text-sm">{s.from} paid</div>
                    <div className="text-slate-500 text-xs">{s.group} • {s.time}</div>
                  </div>
                </div>
                <div className="text-mint-400 font-semibold">${s.amount}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
