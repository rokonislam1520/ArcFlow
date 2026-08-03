'use client';
import { useWallet } from '@/lib/useWallet';
import { useTokenBalances, formatAmount } from '@/lib/useTokenBalance';
import { useActivity, shortenAddress } from '@/lib/useActivity';
import { WalletGuard } from '@/components/WalletGuard';
import { AVAILABLE_TOKENS, USDC_DECIMALS, CHAIN_NAME } from '@/lib/config';

function PortfolioView() {
  const { address } = useWallet();
  const { balances, isLoading, error } = useTokenBalances(address, AVAILABLE_TOKENS);
  const { activity, isLoading: activityLoading, error: activityError } = useActivity(address, 15);

  const assets = AVAILABLE_TOKENS.map((t) => ({
    ...t,
    raw: balances[t.symbol] ?? null,
  }));

  const holdingsCount = assets.filter((a) => a.raw !== null && a.raw > 0n).length;

  return (
    <div className="min-h-screen py-8 animate-in">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Portfolio</h1>
          <p className="text-slate-400">
            Your stablecoin holdings on {CHAIN_NAME}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="glass p-6">
            <div className="text-slate-400 text-sm mb-1">USDC Balance</div>
            <div className="text-3xl font-bold text-gradient">
              {isLoading
                ? '…'
                : balances['USDC'] !== undefined
                  ? formatAmount(balances['USDC'], USDC_DECIMALS, 2)
                  : '—'}
            </div>
          </div>
          <div className="glass p-6">
            <div className="text-slate-400 text-sm mb-1">Tokens Held</div>
            <div className="text-3xl font-bold text-mint-400">{holdingsCount}</div>
          </div>
          <div className="glass p-6">
            <div className="text-slate-400 text-sm mb-1">Network</div>
            <div className="text-3xl font-bold">{CHAIN_NAME}</div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="glass p-6">
              <h2 className="text-lg font-bold mb-4">Assets</h2>

              {error && <p className="text-red-400 text-sm">{error}</p>}
              {isLoading && <p className="text-slate-400 text-sm">Reading balances…</p>}
              {!isLoading && assets.length === 0 && (
                <p className="text-slate-400 text-sm">
                  No tokens configured. Add token addresses to <code>.env.local</code>.
                </p>
              )}

              <div className="space-y-3">
                {assets.map((a) => (
                  <div
                    key={a.symbol}
                    className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-arc-500 to-mint-500 flex items-center justify-center text-xs font-bold">
                        {a.symbol.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold">{a.symbol}</div>
                        <div className="text-slate-500 text-xs font-mono truncate">
                          {a.address}
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-semibold shrink-0 ml-3">
                      {a.raw === null ? '—' : formatAmount(a.raw, a.decimals)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass p-6">
            <h3 className="font-semibold mb-4">Transfer History</h3>

            {activityLoading && <p className="text-slate-400 text-sm">Loading from chain…</p>}
            {activityError && <p className="text-red-400 text-sm">{activityError}</p>}
            {!activityLoading && !activityError && activity.length === 0 && (
              <p className="text-slate-400 text-sm">No transfers yet.</p>
            )}

            <div className="space-y-3">
              {activity.map((tx) => (
                <div
                  key={tx.txHash}
                  className="flex items-center justify-between text-sm p-3 rounded-lg bg-white/[0.03]"
                >
                  <div className="min-w-0">
                    <div className="font-medium capitalize">{tx.direction}</div>
                    <div className="text-slate-500 text-xs font-mono truncate">
                      {shortenAddress(tx.counterparty)}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className={tx.direction === 'received' ? 'text-mint-400' : 'text-red-400'}>
                      {tx.direction === 'sent' ? '-' : '+'}
                      {formatAmount(tx.amount, USDC_DECIMALS)}
                    </div>
                    <div className="text-slate-500 text-xs">
                      block {tx.blockNumber.toString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <WalletGuard featureName="Portfolio">
      <PortfolioView />
    </WalletGuard>
  );
}
