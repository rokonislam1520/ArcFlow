'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { isAddress, parseUnits } from 'viem';
import { useWallet, publicClient } from '@/lib/useWallet';
import { useUsdcBalance, formatAmount } from '@/lib/useTokenBalance';
import { useTransaction } from '@/lib/useTransaction';
import { WalletGuard } from '@/components/WalletGuard';
import { TxStatus } from '@/components/TxStatus';
import { ADDRESSES, USDC_DECIMALS, arcFlowPayAbi, isConfigured } from '@/lib/config';

interface Merchant {
  wallet: `0x${string}`;
  name: string;
  category: string;
  active: boolean;
  totalReceived: bigint;
  txCount: bigint;
}

function MerchantView() {
  const { address, walletClient } = useWallet();
  const { balance, formatted, refresh } = useUsdcBalance(address);

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Enumerates registered merchants from the contract's own registry. */
  const loadMerchants = useCallback(async () => {
    if (!ADDRESSES.pay) return;
    setLoading(true);
    setLoadError(null);
    try {
      const count = (await publicClient.readContract({
        address: ADDRESSES.pay,
        abi: arcFlowPayAbi,
        functionName: 'getMerchantCount',
        args: [],
      })) as bigint;

      const wallets = await Promise.all(
        Array.from({ length: Number(count) }, (_, i) =>
          publicClient.readContract({
            address: ADDRESSES.pay!,
            abi: arcFlowPayAbi,
            functionName: 'merchantList',
            args: [BigInt(i)],
          }) as Promise<`0x${string}`>
        )
      );

      const details = await Promise.all(
        wallets.map(async (wallet) => {
          const info = (await publicClient.readContract({
            address: ADDRESSES.pay!,
            abi: arcFlowPayAbi,
            functionName: 'getMerchant',
            args: [wallet],
          })) as readonly [string, string, boolean, bigint, bigint];
          return {
            wallet,
            name: info[0],
            category: info[1],
            active: info[2],
            totalReceived: info[3],
            txCount: info[4],
          } satisfies Merchant;
        })
      );

      setMerchants(details.filter((m) => m.active));
    } catch (err) {
      console.error('Failed to load merchants:', err);
      setLoadError('Could not load the merchant registry from chain.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMerchants();
  }, [loadMerchants]);

  const payTx = useTransaction(() => {
    void refresh();
    void loadMerchants();
  });

  const [tab, setTab] = useState<'pay' | 'merchants'>('pay');
  const [merchantAddr, setMerchantAddr] = useState('');
  const [amount, setAmount] = useState('');

  const parsedAmount = useMemo(() => {
    if (!amount.trim()) return null;
    try {
      const v = parseUnits(amount as `${number}`, USDC_DECIMALS);
      return v > 0n ? v : null;
    } catch {
      return null;
    }
  }, [amount]);

  const addrValid = isAddress(merchantAddr);
  const exceedsBalance = parsedAmount !== null && balance !== null && parsedAmount > balance;

  const validationError = merchantAddr && !addrValid
    ? 'Enter a valid merchant address.'
    : exceedsBalance
      ? 'Amount exceeds your USDC balance.'
      : null;

  const canPay = addrValid && parsedAmount !== null && !exceedsBalance && !payTx.isBusy;

  const handlePay = async () => {
    if (!canPay || !parsedAmount || !ADDRESSES.pay || !ADDRESSES.usdc) return;
    await payTx.execute(walletClient, address, {
      address: ADDRESSES.pay,
      abi: arcFlowPayAbi,
      functionName: 'pay',
      args: [merchantAddr as `0x${string}`, parsedAmount],
      approval: {
        token: ADDRESSES.usdc,
        spender: ADDRESSES.pay,
        amount: parsedAmount,
      },
    });
  };

  return (
    <div className="animate-in">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Pay Merchant</h1>
          <p className="text-ink-secondary">Pay any registered merchant in USDC</p>
        </div>

        <div className="flex gap-2 mb-6">
          {([['pay', 'Pay'], ['merchants', 'Registered']] as const).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              // A solid accent fill needs ink chosen against *it*, not against
              // the page — the theme's own ink is dark, which would vanish.
              className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                tab === k
                  ? 'bg-accent text-accent-contrast'
                  : 'bg-surface-input text-ink-secondary hover:bg-surface-hover/[0.06]'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {tab === 'pay' && (
          <div className="glass p-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm text-ink-secondary mb-2 block">Merchant Address</label>
                <input
                  type="text"
                  value={merchantAddr}
                  onChange={(e) => setMerchantAddr(e.target.value)}
                  placeholder="0x…"
                  disabled={payTx.isBusy}
                  className="input-arc font-mono text-sm"
                />
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm text-ink-secondary">Amount (USDC)</label>
                  <span className="text-sm text-ink-muted">Balance: {formatted ?? '—'} USDC</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={payTx.isBusy}
                    className="input-arc text-2xl font-bold pr-16"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-secondary font-semibold">
                    USDC
                  </span>
                </div>
              </div>

              {validationError && <p className="text-sm text-danger">{validationError}</p>}

              <button className="w-full btn-arc py-4 text-lg" disabled={!canPay} onClick={handlePay}>
                {payTx.isBusy ? 'Processing…' : 'Pay'}
              </button>

              <TxStatus state={payTx.state} />
            </div>
          </div>
        )}

        {tab === 'merchants' && (
          <div className="glass p-6">
            <h3 className="font-semibold mb-4">Registered Merchants</h3>
            {loading && <p className="text-ink-secondary text-sm">Loading from chain…</p>}
            {loadError && <p className="text-danger text-sm">{loadError}</p>}
            {!loading && !loadError && merchants.length === 0 && (
              <p className="text-ink-secondary text-sm">No merchants are registered yet.</p>
            )}
            <div className="space-y-3">
              {merchants.map((m) => (
                <div
                  key={m.wallet}
                  className="flex items-center justify-between p-4 rounded-xl bg-surface-input"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{m.name}</div>
                    <div className="text-ink-muted text-xs">{m.category}</div>
                    <div className="text-ink-muted text-xs font-mono mt-1 truncate">
                      {m.wallet}
                    </div>
                    <div className="text-ink-muted text-xs mt-1">
                      {formatAmount(m.totalReceived, USDC_DECIMALS)} USDC received ·{' '}
                      {m.txCount.toString()} payments
                    </div>
                  </div>
                  <button
                    className="btn-arc px-4 py-2 text-sm shrink-0 ml-3"
                    onClick={() => {
                      setMerchantAddr(m.wallet);
                      setTab('pay');
                    }}
                  >
                    Pay
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MerchantPage() {
  return (
    <WalletGuard configured={isConfigured.pay} featureName="Merchant Pay">
      <MerchantView />
    </WalletGuard>
  );
}
