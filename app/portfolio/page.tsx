'use client';
import Link from 'next/link';
import { type Address } from 'viem';
import { WalletGuard } from '@/components/WalletGuard';
import { TokenBreakdown, ChainBreakdown } from '@/components/dashboard/Panels';
import {
  EmptyState,
  ErrorState,
  Panel,
  PartialNotice,
  Stat,
  TokenBadge,
  UpdatedAt,
  UsdValue,
} from '@/components/dashboard/Primitives';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { useNetworkMode } from '@/lib/network';
import { byToken, chainAllocation, formatUSD, usePortfolio, type Holding } from '@/lib/portfolio';
import { useTransfers, relativeTime, shortAddress } from '@/lib/useTransfers';
import { explorerTxUrl } from '@/lib/chains';

function PortfolioView() {
  const { address } = useWallet();
  const chain = useActiveChain();
  const { isTestnet } = useNetworkMode();

  const portfolio = usePortfolio(address as Address | null, isTestnet);
  const transfers = useTransfers(chain, address as Address | null, 20);

  const tokens = byToken(portfolio.chains);
  const allocation = chainAllocation(portfolio.chains, portfolio.totalUSD);

  return (
    <div className="min-h-screen py-6 sm:py-8 animate-in">
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-2">
            <h1 className="text-3xl sm:text-4xl font-bold">Portfolio</h1>
            <Link
              href="/dashboard"
              className="text-sm px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-arc-500/30 transition-all"
            >
              ← Dashboard
            </Link>
          </div>
          <p className="text-slate-400 text-sm sm:text-base">
            Complete breakdown across {portfolio.chains.length || 'all'} chains
          </p>
        </header>

        {/* Total + quick stats */}
        <section className="glass glow-teal p-6 sm:p-8 mb-6 sm:mb-8">
          <div className="mb-6">
            <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">
              Total Value
            </div>
            <div className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-gradient tabular-nums">
              {portfolio.loading && portfolio.totalUSD === 0
                ? '…'
                : formatUSD(portfolio.totalUSD)}
            </div>
            {portfolio.updatedAt && (
              <div className="mt-2">
                <UpdatedAt at={portfolio.updatedAt} loading={portfolio.loading} />
              </div>
            )}
          </div>

          {portfolio.partial && (
            <PartialNotice>
              One or more chains could not be reached. The total shown is a lower bound.
            </PartialNotice>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-6">
            <Stat
              label="Chains"
              value={portfolio.chains.length || '—'}
              hint="With balances"
            />
            <Stat label="Tokens" value={tokens.length || '—'} hint="Unique stablecoins" />
            <Stat
              label="Holdings"
              value={portfolio.chains.reduce((s, c) => s + c.holdings.length, 0) || '—'}
              hint="Total positions"
            />
          </div>
        </section>

        {/* Main grid */}
        <div className="grid lg:grid-cols-12 gap-5 sm:gap-6">
          {/* Left: token + chain summaries */}
          <div className="lg:col-span-5 space-y-5 sm:space-y-6">
            <TokenBreakdown
              tokens={tokens}
              loading={portfolio.loading}
              totalUSD={portfolio.totalUSD}
            />
            <ChainBreakdown
              chains={portfolio.chains}
              totalUSD={portfolio.totalUSD}
              loading={portfolio.loading}
            />
          </div>

          {/* Middle: per-chain details */}
          <div className="lg:col-span-4">
            <Panel title="Chain details" subtitle="Holdings on each network">
              {portfolio.chains.length === 0 ? (
                portfolio.loading ? (
                  <EmptyState message="Loading chains…" />
                ) : (
                  <EmptyState
                    message="No balances found."
                    hint="Funds appear here once this address holds stablecoins on any supported chain."
                  />
                )
              ) : (
                <div className="space-y-4">
                  {allocation.map((a) => {
                    const c = portfolio.chains.find((p) => p.chain.id === a.chain.id)!;
                    return (
                      <details key={a.chain.id} className="group">
                        <summary className="cursor-pointer p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors list-none">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xl group-open:rotate-90 transition-transform">
                                ▸
                              </span>
                              <div className="min-w-0">
                                <div className="font-semibold text-sm truncate">
                                  {a.chain.label}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {c.holdings.length}{' '}
                                  {c.holdings.length === 1 ? 'holding' : 'holdings'}
                                </div>
                              </div>
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              {a.error ? (
                                <span className="text-xs text-red-300">unavailable</span>
                              ) : (
                                <>
                                  <div className="font-semibold text-sm tabular-nums">
                                    {formatUSD(a.valueUSD)}
                                  </div>
                                  {a.sharePct !== null && (
                                    <div className="text-xs text-slate-500 tabular-nums">
                                      {a.sharePct.toFixed(1)}%
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </summary>

                        <div className="mt-2 ml-4 pl-4 border-l border-white/10 space-y-2">
                          {c.error ? (
                            <ErrorState message={c.error} onRetry={portfolio.refresh} />
                          ) : (
                            c.holdings.map((h: Holding, i: number) => (
                              <div
                                key={`${h.symbol}-${h.address ?? 'native'}-${i}`}
                                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02]"
                              >
                                <TokenBadge symbol={h.symbol} size={32} />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium">{h.symbol}</div>
                                  <div className="text-xs text-slate-500 tabular-nums truncate">
                                    {Number(h.amount).toLocaleString('en-US', {
                                      maximumFractionDigits: 6,
                                    })}
                                  </div>
                                </div>
                                <div className="text-sm font-semibold shrink-0">
                                  <UsdValue value={h.valueUSD} format={formatUSD} />
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>

          {/* Right: activity */}
          <div className="lg:col-span-3">
            <Panel
              title="Activity"
              subtitle={chain ? `On ${chain.label}` : 'Recent transfers'}
            >
              {transfers.error ? (
                <ErrorState message={transfers.error} onRetry={transfers.refresh} />
              ) : transfers.loading && transfers.transfers.length === 0 ? (
                <EmptyState message="Loading transfers…" />
              ) : transfers.transfers.length === 0 ? (
                <EmptyState
                  message="No transfers in the recent block range."
                  hint="Only the last few thousand blocks are scanned."
                />
              ) : (
                <ul className="space-y-1.5">
                  {transfers.transfers.map((t) => {
                    const when = relativeTime(t.timestamp);
                    const url = chain ? explorerTxUrl(chain, t.txHash) : null;
                    const sent = t.direction === 'sent';

                    const row = (
                      <div className="p-3 rounded-xl hover:bg-white/[0.03] transition-colors">
                        <div className="flex items-center gap-2.5 mb-1">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 ${
                              sent
                                ? 'bg-white/[0.06] text-slate-300'
                                : 'bg-mint-500/15 text-mint-300'
                            }`}
                          >
                            {sent ? '↑' : '↓'}
                          </span>
                          <span className="text-xs font-medium min-w-0 truncate">
                            {sent ? 'To' : 'From'}{' '}
                            <span className="font-mono text-slate-400">
                              {shortAddress(t.counterparty)}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between ml-8 text-[11px]">
                          <span className="text-slate-500">
                            {when ?? `block ${t.blockNumber.toString()}`}
                          </span>
                          <span
                            className={`font-semibold tabular-nums ${
                              sent ? 'text-slate-200' : 'text-mint-300'
                            }`}
                          >
                            {sent ? '−' : '+'}
                            {Number(t.amount).toLocaleString('en-US', {
                              maximumFractionDigits: 6,
                            })}{' '}
                            <span className="font-normal text-slate-400">{t.symbol}</span>
                          </span>
                        </div>
                      </div>
                    );

                    return (
                      <li key={`${t.txHash}-${t.direction}-${t.symbol}`}>
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            {row}
                          </a>
                        ) : (
                          row
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
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
