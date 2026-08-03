'use client';
import { useState } from 'react';
import { useWallet } from '@/lib/useWallet';
import { useUsdcBalance } from '@/lib/useUsdcBalance';

const recentContacts = [
  { name: 'Alice', address: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b', avatar: 'A' },
  { name: 'Bob',   address: '0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c', avatar: 'B' },
  { name: 'Carol', address: '0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d', avatar: 'C' },
  { name: 'Dave',  address: '0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e', avatar: 'D' },
];

export default function SendPage() {
  const { isConnected, connect, address } = useWallet();
  const { formatted: balance, isLoading: balanceLoading } = useUsdcBalance(address);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');

  // Wallet guard — show connect prompt instead of the form
  if (!isConnected) {
    return (
      <div className="min-h-screen py-8 animate-in">
        <div className="max-w-lg mx-auto px-4 text-center">
          <div className="glass p-10">
            <div className="text-5xl mb-4">🔒</div>
            <h2 className="text-2xl font-bold mb-2">Wallet Not Connected</h2>
            <p className="text-slate-400 mb-6">Connect your wallet to send USDC.</p>
            <button onClick={connect} className="btn-arc px-8 py-3 text-lg">Connect Wallet</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 animate-in">
      <div className="max-w-lg mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Send Money</h1>
          <p className="text-slate-400">Send USDC instantly — zero gas fees on ARC</p>
        </div>

        {step === 'form' && (
          <div className="glass p-6">
            {/* Recent Contacts */}
            <div className="mb-6">
              <div className="text-sm text-slate-400 mb-3">Recent</div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {recentContacts.map((c) => (
                  <button key={c.name} onClick={() => setRecipient(c.address)} className="flex flex-col items-center gap-1.5 min-w-[60px]">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-arc-500 to-mint-500 flex items-center justify-center font-bold text-lg">
                      {c.avatar}
                    </div>
                    <span className="text-xs text-slate-400">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient */}
            <div className="mb-4">
              <label className="text-sm text-slate-400 mb-2 block">To</label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Wallet address or ENS name"
                className="input-arc"
              />
            </div>

            {/* Amount */}
            <div className="mb-4">
              <div className="flex justify-between mb-2">
                <label className="text-sm text-slate-400">Amount</label>
                <span className="text-sm text-slate-500">
                  Balance: {balanceLoading ? '…' : (balance ?? '—')} USDC
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="input-arc text-3xl font-bold pr-20"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {balance !== null && (
                    <button
                      type="button"
                      onClick={() => setAmount(balance)}
                      className="text-xs text-arc-400 font-medium hover:text-arc-300"
                    >
                      MAX
                    </button>
                  )}
                  <span className="text-slate-400 font-semibold">USDC</span>
                </div>
              </div>
              <div className="text-sm text-slate-500 mt-2">≈ ${parseFloat(amount || '0').toFixed(2)} USD</div>
            </div>

            {/* Note */}
            <div className="mb-6">
              <label className="text-sm text-slate-400 mb-2 block">Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What&apos;s this for?"
                className="input-arc text-base"
              />
            </div>

            {/* Gas Info */}
            <div className="flex justify-between text-sm mb-6 p-3 rounded-xl bg-arc-500/5 border border-arc-500/10">
              <span className="text-slate-400">Network Fee</span>
              <span className="text-mint-400 font-semibold">$0.00 (Gasless)</span>
            </div>

            <button
              className="w-full btn-arc py-4 text-lg"
              disabled={!recipient || !amount}
              onClick={() => setStep('confirm')}
            >
              Review Transfer
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="glass p-6">
            <h2 className="text-xl font-bold mb-6 text-center">Confirm Transfer</h2>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between p-4 rounded-xl bg-white/[0.03]">
                <span className="text-slate-400">To</span>
                <span className="font-mono text-sm break-all">{recipient}</span>
              </div>
              <div className="flex justify-between p-4 rounded-xl bg-white/[0.03]">
                <span className="text-slate-400">Amount</span>
                <span className="font-bold text-xl">{amount} USDC</span>
              </div>
              {note && (
                <div className="flex justify-between p-4 rounded-xl bg-white/[0.03]">
                  <span className="text-slate-400">Note</span>
                  <span>{note}</span>
                </div>
              )}
              <div className="flex justify-between p-4 rounded-xl bg-white/[0.03]">
                <span className="text-slate-400">Fee</span>
                <span className="text-mint-400">$0.00</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button className="flex-1 btn-outline py-4" onClick={() => setStep('form')}>Back</button>
              <button className="flex-1 btn-arc py-4" onClick={() => setStep('done')}>Confirm & Send</button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="glass p-8 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold mb-2">Sent Successfully!</h2>
            <p className="text-slate-400 mb-2">{amount} USDC sent to</p>
            <p className="font-mono text-sm text-arc-400 mb-6 break-all">{recipient}</p>
            <div className="flex gap-3 justify-center">
              <button className="btn-outline px-6 py-3" onClick={() => { setStep('form'); setAmount(''); setRecipient(''); setNote(''); }}>Send Again</button>
              <a href="/dashboard" className="btn-arc px-6 py-3">Go to Dashboard</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
