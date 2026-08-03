'use client';
import { useState, useEffect, useCallback } from 'react';
import { isAddress, parseUnits } from 'viem';
import { useWallet, publicClient } from '@/lib/useWallet';
import { useUsdcBalance, formatAmount } from '@/lib/useTokenBalance';
import { useTransaction } from '@/lib/useTransaction';
import { WalletGuard } from '@/components/WalletGuard';
import { TxStatus } from '@/components/TxStatus';
import { ADDRESSES, USDC_DECIMALS, arcFlowRecurringAbi, isConfigured } from '@/lib/config';

/** Matches `enum Frequency { Weekly, Monthly, Quarterly, Yearly }`. */
const FREQUENCIES = [
  { label: 'Weekly', value: 0 },
  { label: 'Monthly', value: 1 },
  { label: 'Quarterly', value: 2 },
  { label: 'Yearly', value: 3 },
] as const;

interface Payment {
  id: bigint;
  payee: `0x${string}`;
  amount: bigint;
  frequency: number;
  nextPayment: bigint;
  totalPaid: bigint;
  executions: number;
  active: boolean;
  name: string;
}

function formatDate(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function RecurringView() {
  const { address, walletClient } = useWallet();
  const { formatted, refresh: refreshBalance } = useUsdcBalance(address);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    if (!address || !ADDRESSES.recurring) {
      setPayments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const ids = (await publicClient.readContract({
        address: ADDRESSES.recurring,
        abi: arcFlowRecurringAbi,
        functionName: 'getUserPayments',
        args: [address],
      })) as bigint[];

      const loaded = await Promise.all(
        ids.map(async (id) => {
          const p = (await publicClient.readContract({
            address: ADDRESSES.recurring!,
            abi: arcFlowRecurringAbi,
            functionName: 'getPayment',
            args: [id],
          })) as readonly [
            string, string, bigint, number, bigint, bigint, number, boolean, string,
          ];
          return {
            id,
            payee: p[1] as `0x${string}`,
            amount: p[2],
            frequency: Number(p[3]),
            nextPayment: p[4],
            totalPaid: p[5],
            executions: Number(p[6]),
            active: p[7],
            name: p[8],
          } satisfies Payment;
        })
      );
      setPayments(loaded);
    } catch (err) {
      console.error('Failed to load recurring payments:', err);
      setLoadError('Could not load your recurring payments from chain.');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const onDone = useCallback(() => {
    void loadPayments();
    void refreshBalance();
  }, [loadPayments, refreshBalance]);

  const createTx = useTransaction(onDone);
  const cancelTx = useTransaction(onDone);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState(1);
  const [executions, setExecutions] = useState('12');
  const [formError, setFormError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<bigint | null>(null);

  const active = payments.filter((p) => p.active);
  const totalPerCycle = active.reduce((sum, p) => sum + p.amount, 0n);

  const handleCreate = async () => {
    if (!ADDRESSES.recurring || !ADDRESSES.usdc) return;
    setFormError(null);

    if (!name.trim()) return setFormError('Enter a name.');
    if (!isAddress(payee)) return setFormError('Enter a valid recipient address.');

    let amountUnits: bigint;
    try {
      amountUnits = parseUnits(amount as `${number}`, USDC_DECIMALS);
    } catch {
      return setFormError('Enter a valid amount.');
    }
    if (amountUnits <= 0n) return setFormError('Amount must be greater than zero.');

    const count = Number(executions);
    if (!Number.isInteger(count) || count < 1 || count > 4_294_967_295) {
      return setFormError('Number of payments must be a whole number of at least 1.');
    }

    // The keeper pulls each installment later via transferFrom, so approve the
    // full run up front. Without this, executions revert once the allowance
    // runs out.
    await createTx.execute(walletClient, address, {
      address: ADDRESSES.recurring,
      abi: arcFlowRecurringAbi,
      functionName: 'createRecurring',
      args: [payee as `0x${string}`, amountUnits, frequency, count, name],
      approval: {
        token: ADDRESSES.usdc,
        spender: ADDRESSES.recurring,
        amount: amountUnits * BigInt(count),
      },
    });

    setShowCreate(false);
    setName('');
    setPayee('');
    setAmount('');
  };

  const handleCancel = async (id: bigint) => {
    if (!ADDRESSES.recurring) return;
    setCancellingId(id);
    await cancelTx.execute(walletClient, address, {
      address: ADDRESSES.recurring,
      abi: arcFlowRecurringAbi,
      functionName: 'cancelRecurring',
      args: [id],
    });
    setCancellingId(null);
  };

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

        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="glass p-4 text-center">
            <div className="text-slate-400 text-xs mb-1">Per Cycle</div>
            <div className="text-xl font-bold">
              {formatAmount(totalPerCycle, USDC_DECIMALS)}
            </div>
          </div>
          <div className="glass p-4 text-center">
            <div className="text-slate-400 text-xs mb-1">Active</div>
            <div className="text-xl font-bold text-arc-400">{active.length}</div>
          </div>
          <div className="glass p-4 text-center">
            <div className="text-slate-400 text-xs mb-1">USDC Balance</div>
            <div className="text-xl font-bold text-mint-400">{formatted ?? '—'}</div>
          </div>
        </div>

        {showCreate && (
          <div className="glass p-6 mb-6">
            <h3 className="font-semibold mb-4">Create Recurring Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Netflix"
                  className="input-arc"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Recipient Address</label>
                <input
                  type="text"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="0x…"
                  className="input-arc font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-400 mb-2 block">Amount (USDC)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="input-arc"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-400 mb-2 block">Frequency</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(Number(e.target.value))}
                    className="w-full input-arc cursor-pointer"
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Number of Payments</label>
                <input
                  type="number"
                  value={executions}
                  onChange={(e) => setExecutions(e.target.value)}
                  min={1}
                  className="input-arc"
                />
                <p className="text-xs text-slate-500 mt-2">
                  You will approve {amount || '0'} × {executions || '0'} USDC so each
                  installment can be collected on schedule.
                </p>
              </div>

              {formError && <p className="text-sm text-red-400">{formError}</p>}

              <div className="flex gap-3">
                <button className="flex-1 btn-outline py-3" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button
                  className="flex-1 btn-arc py-3"
                  disabled={createTx.isBusy}
                  onClick={handleCreate}
                >
                  {createTx.isBusy ? 'Processing…' : 'Create Payment'}
                </button>
              </div>

              <TxStatus state={createTx.state} />
            </div>
          </div>
        )}

        <div className="glass p-6">
          <h2 className="font-semibold mb-4">Your Payments</h2>

          {loading && <p className="text-slate-400 text-sm">Loading from chain…</p>}
          {loadError && <p className="text-red-400 text-sm">{loadError}</p>}
          {!loading && !loadError && payments.length === 0 && (
            <p className="text-slate-400 text-sm">
              No recurring payments yet. Create one to get started.
            </p>
          )}

          <div className="space-y-3">
            {payments.map((p) => (
              <div key={p.id.toString()} className="p-4 rounded-xl bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-slate-500 text-xs">
                      {FREQUENCIES.find((f) => f.value === p.frequency)?.label ?? 'Custom'} · Next:{' '}
                      {formatDate(p.nextPayment)}
                    </div>
                    <div className="text-slate-600 text-xs font-mono mt-1 truncate">{p.payee}</div>
                    <div className="text-slate-500 text-xs mt-1">
                      Paid {formatAmount(p.totalPaid, USDC_DECIMALS)} USDC over {p.executions}{' '}
                      {p.executions === 1 ? 'payment' : 'payments'}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="font-semibold">
                      {formatAmount(p.amount, USDC_DECIMALS)}
                    </div>
                    <div className={p.active ? 'badge-success text-xs' : 'text-slate-500 text-xs'}>
                      {p.active ? 'Active' : 'Cancelled'}
                    </div>
                  </div>
                </div>

                {p.active && (
                  <button
                    className="w-full btn-outline py-2 mt-3 text-sm"
                    disabled={cancelTx.isBusy}
                    onClick={() => handleCancel(p.id)}
                  >
                    {cancelTx.isBusy && cancellingId === p.id ? 'Processing…' : 'Cancel Payment'}
                  </button>
                )}

                {cancellingId === p.id && <TxStatus state={cancelTx.state} />}
              </div>
            ))}
          </div>

          {cancellingId === null && cancelTx.state.phase !== 'idle' && (
            <TxStatus state={cancelTx.state} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function RecurringPage() {
  return (
    <WalletGuard configured={isConfigured.recurring} featureName="Recurring Payments">
      <RecurringView />
    </WalletGuard>
  );
}
