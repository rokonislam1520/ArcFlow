'use client';
import { useState, useEffect, useCallback } from 'react';
import { isAddress, parseUnits } from 'viem';
import { useWallet, publicClient } from '@/lib/useWallet';
import { formatAmount } from '@/lib/useTokenBalance';
import { useTransaction } from '@/lib/useTransaction';
import { WalletGuard } from '@/components/WalletGuard';
import { TxStatus } from '@/components/TxStatus';
import { ADDRESSES, USDC_DECIMALS, arcFlowSplitAbi, isConfigured } from '@/lib/config';

const STATUS_LABEL = ['Active', 'Partial', 'Settled'] as const;

interface Group {
  id: bigint;
  name: string;
  totalAmount: bigint;
  memberCount: bigint;
  settledCount: bigint;
  status: number;
  yourShare: bigint;
  youPaid: boolean;
}

function SplitView() {
  const { address, walletClient } = useWallet();

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Loads the caller's split groups directly from the contract. */
  const loadGroups = useCallback(async () => {
    if (!address || !ADDRESSES.split) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const ids = (await publicClient.readContract({
        address: ADDRESSES.split,
        abi: arcFlowSplitAbi,
        functionName: 'getUserGroups',
        args: [address],
      })) as bigint[];

      const loaded = await Promise.all(
        ids.map(async (id) => {
          const [info, members, outstanding] = await Promise.all([
            publicClient.readContract({
              address: ADDRESSES.split!,
              abi: arcFlowSplitAbi,
              functionName: 'getGroup',
              args: [id],
            }) as Promise<readonly [string, string, bigint, bigint, bigint, number]>,
            publicClient.readContract({
              address: ADDRESSES.split!,
              abi: arcFlowSplitAbi,
              functionName: 'getGroupMembers',
              args: [id],
            }) as Promise<readonly [readonly string[], readonly bigint[], readonly boolean[]]>,
            publicClient.readContract({
              address: ADDRESSES.split!,
              abi: arcFlowSplitAbi,
              functionName: 'getOutstandingShare',
              args: [id, address],
            }) as Promise<bigint>,
          ]);

          const idx = members[0].findIndex(
            (w) => w.toLowerCase() === address.toLowerCase()
          );
          const youPaid = idx >= 0 ? members[2][idx] : false;
          const share = idx >= 0 ? members[1][idx] : 0n;

          return {
            id,
            name: info[1],
            totalAmount: info[2],
            memberCount: info[3],
            settledCount: info[4],
            status: Number(info[5]),
            yourShare: outstanding > 0n ? outstanding : share,
            youPaid,
          } satisfies Group;
        })
      );

      setGroups(loaded);
    } catch (err) {
      console.error('Failed to load splits:', err);
      setLoadError('Could not load your splits from chain.');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const settleTx = useTransaction(loadGroups);
  const createTx = useTransaction(loadGroups);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [memberInput, setMemberInput] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const [settlingId, setSettlingId] = useState<bigint | null>(null);

  const addMember = () => {
    const value = memberInput.trim();
    if (!isAddress(value)) {
      setFormError('Enter a valid wallet address.');
      return;
    }
    if (members.some((m) => m.toLowerCase() === value.toLowerCase())) {
      setFormError('That address is already a member.');
      return;
    }
    setMembers([...members, value]);
    setMemberInput('');
    setFormError(null);
  };

  const handleCreate = async () => {
    if (!ADDRESSES.split || !ADDRESSES.usdc) return;
    setFormError(null);

    if (!name.trim()) return setFormError('Enter an event name.');
    if (members.length === 0) return setFormError('Add at least one member.');

    let totalUnits: bigint;
    try {
      totalUnits = parseUnits(total as `${number}`, USDC_DECIMALS);
    } catch {
      return setFormError('Enter a valid total amount.');
    }
    if (totalUnits <= 0n) return setFormError('Total must be greater than zero.');

    // Split equally; the remainder goes to the first member so the shares sum
    // exactly to the total (the contract derives totalAmount from the shares).
    const each = totalUnits / BigInt(members.length);
    if (each === 0n) return setFormError('Total is too small to split between these members.');
    const remainder = totalUnits - each * BigInt(members.length);
    const shares = members.map((_, i) => (i === 0 ? each + remainder : each));

    await createTx.execute(walletClient, address, {
      address: ADDRESSES.split,
      abi: arcFlowSplitAbi,
      functionName: 'createSplit',
      args: [name, members as `0x${string}`[], shares, address],
    });

    setShowCreate(false);
    setName('');
    setTotal('');
    setMembers([]);
  };

  const handleSettle = async (group: Group) => {
    if (!ADDRESSES.split || !ADDRESSES.usdc) return;
    setSettlingId(group.id);
    await settleTx.execute(walletClient, address, {
      address: ADDRESSES.split,
      abi: arcFlowSplitAbi,
      functionName: 'settleShare',
      args: [group.id],
      approval: {
        token: ADDRESSES.usdc,
        spender: ADDRESSES.split,
        amount: group.yourShare,
      },
    });
    setSettlingId(null);
  };

  return (
    <div className="min-h-screen py-8 animate-in">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Split Bills</h1>
            <p className="text-slate-400">Split expenses and settle in USDC</p>
          </div>
          <button className="btn-arc px-4 py-2 text-sm" onClick={() => setShowCreate(!showCreate)}>
            + New Split
          </button>
        </div>

        {showCreate && (
          <div className="glass p-6 mb-6">
            <h3 className="font-semibold mb-4">Create New Split</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Event Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dinner Friday"
                  className="input-arc"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Total Amount (USDC)</label>
                <input
                  type="number"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder="0.00"
                  className="input-arc"
                />
              </div>
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Add Members</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={memberInput}
                    onChange={(e) => setMemberInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addMember()}
                    placeholder="0x…"
                    className="input-arc flex-1 font-mono text-sm"
                  />
                  <button className="btn-arc px-4" onClick={addMember}>
                    Add
                  </button>
                </div>
              </div>
              {members.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {members.map((m) => (
                    <span
                      key={m}
                      className="px-3 py-1 rounded-full bg-arc-500/20 text-arc-400 text-xs font-mono flex items-center gap-2"
                    >
                      {m.slice(0, 6)}…{m.slice(-4)}
                      <button
                        className="hover:text-white"
                        onClick={() => setMembers(members.filter((x) => x !== m))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

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
                  {createTx.isBusy ? 'Processing…' : 'Create Split'}
                </button>
              </div>

              <TxStatus state={createTx.state} />
            </div>
          </div>
        )}

        <div className="glass p-6">
          <h2 className="font-semibold mb-4">Your Splits</h2>

          {loading && <p className="text-slate-400 text-sm">Loading from chain…</p>}
          {loadError && <p className="text-red-400 text-sm">{loadError}</p>}
          {!loading && !loadError && groups.length === 0 && (
            <p className="text-slate-400 text-sm">
              You have no splits yet. Create one to get started.
            </p>
          )}

          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.id.toString()} className="p-4 rounded-xl bg-white/[0.03]">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-semibold">{g.name}</div>
                    <div className="text-slate-500 text-sm">
                      {g.settledCount.toString()}/{g.memberCount.toString()} settled
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      g.status === 2
                        ? 'badge-success'
                        : g.status === 0
                          ? 'badge-warning'
                          : 'bg-blue-500/15 text-blue-400'
                    }`}
                  >
                    {STATUS_LABEL[g.status] ?? 'Unknown'}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">
                    Total: {formatAmount(g.totalAmount, USDC_DECIMALS)} USDC
                  </span>
                  <span className="font-medium">
                    Your share:{' '}
                    <span className="text-arc-400">
                      {formatAmount(g.yourShare, USDC_DECIMALS)} USDC
                    </span>
                  </span>
                </div>

                {!g.youPaid && g.status !== 2 && (
                  <button
                    className="w-full btn-arc py-2.5 mt-3 text-sm"
                    disabled={settleTx.isBusy}
                    onClick={() => handleSettle(g)}
                  >
                    {settleTx.isBusy && settlingId === g.id ? 'Processing…' : 'Settle My Share'}
                  </button>
                )}
                {g.youPaid && (
                  <p className="text-mint-400 text-sm mt-3">✓ You have settled your share</p>
                )}

                {settlingId === g.id && <TxStatus state={settleTx.state} />}
              </div>
            ))}
          </div>

          {settlingId === null && settleTx.state.phase !== 'idle' && (
            <TxStatus state={settleTx.state} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function SplitPage() {
  return (
    <WalletGuard configured={isConfigured.split} featureName="Split Bills">
      <SplitView />
    </WalletGuard>
  );
}
