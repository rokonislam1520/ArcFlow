'use client';
import { useState } from 'react';

const activePayments = [
  { name: 'Netflix', icon: '🎬', amount: '15.99', frequency: 'Monthly', nextDate: 'Aug 15, 2026', status: 'Active' },
  { name: 'Gym Membership', icon: '🏋️', amount: '49.99', frequency: 'Monthly', nextDate: 'Aug 1, 2026', status: 'Active' },
  { name: 'Cloud Storage', icon: '☁️', amount: '9.99', frequency: 'Monthly', nextDate: 'Aug 22, 2026', status: 'Active' },
  { name: 'Rent Payment', icon: '🏠', amount: '1,200.00', frequency: 'Monthly', nextDate: 'Sep 1, 2026', status: 'Active' },
];

const history = [
  { name: 'Netflix', amount: '15.99', date: 'Jul 15, 2026', status: 'Paid' },
  { name: 'Gym Membership', amount: '49.99', date: 'Jul 1, 2026', status: 'Paid' },
  { name: 'Cloud Storage', amount: '9.99', date: 'Jul 22, 2026', status: 'Paid' },
  { name: 'Rent Payment', amount: '1,200.00', date: 'Jul 1, 2026', status: 'Paid' },
];

export default function RecurringPage() {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="min-h-screen py-8 animate-in">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Recurring Payments</h1>
            <p className="text-slate-400">Auto-pay subscriptions, rent & salaries in USDC</p>
          </div>
          <button className="btn-arc px-4 py-2 text-sm" onClick={() => setShowCreate(!showCreate)}>
            + New
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="glass p-4 text-center"><div className="text-slate-400 text-xs mb-1">Monthly Total</div><div className="text-xl font-bold">$1,275.97</div></div>
          <div className="glass p-4 text-center"><div className="text-slate-400 text-xs mb-1">Active</div><div className="text-xl font-bold text-arc-400">4</div></div>
          <div className="glass p-4 text-center"><div className="text-slate-400 text-xs mb-1">Next Payment</div><div className="text-xl font-bold text-mint-400">Aug 1</div></div>
        </div>

        {/* Create Form */}
        {showCreate && (
          <div className="glass p-6 mb-6">
            <h3 className="font-semibold mb-4">Create Recurring Payment</h3>
            <div className="space-y-4">
              <div><label className="text-sm text-slate-400 mb-2 block">Name</label><input type="text" placeholder="e.g. Netflix" className="input-arc" /></div>
              <div><label className="text-sm text-slate-400 mb-2 block">Recipient Address</label><input type="text" placeholder="0x..." className="input-arc" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm text-slate-400 mb-2 block">Amount (USDC)</label><input type="number" placeholder="0.00" className="input-arc" /></div>
                <div><label className="text-sm text-slate-400 mb-2 block">Frequency</label>
                  <select className="w-full input-arc appearance-none cursor-pointer">
                    <option>Weekly</option><option>Monthly</option><option>Quarterly</option><option>Yearly</option>
                  </select>
                </div>
              </div>
              <div><label className="text-sm text-slate-400 mb-2 block">Start Date</label><input type="date" className="input-arc" /></div>
              <div className="flex gap-3">
                <button className="flex-1 btn-outline py-3" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="flex-1 btn-arc py-3">Create Payment</button>
              </div>
            </div>
          </div>
        )}

        {/* Active Payments */}
        <div className="glass p-6 mb-6">
          <h2 className="font-semibold mb-4">Active Payments</h2>
          <div className="space-y-3">
            {activePayments.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-xl">{p.icon}</div>
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-slate-500 text-xs">{p.frequency} • Next: {p.nextDate}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">${p.amount}</div>
                  <div className="badge-success text-xs">{p.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* History */}
        <div className="glass p-6">
          <h2 className="font-semibold mb-4">Payment History</h2>
          <div className="space-y-3">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] text-sm">
                <span className="font-medium">{h.name}</span>
                <span className="text-slate-400">{h.date}</span>
                <span className="text-red-400 font-medium">-${h.amount}</span>
                <span className="badge-success">{h.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
