'use client';
import Link from 'next/link';
import { type Address } from 'viem';
import { WalletGuard } from '@/components/WalletGuard';
import {
  ChainBreakdown,
  MarketOverview,
  NetworkStatus,
  QuickActions,
  RecentActivity,
  TokenBreakdown,
  WalletOverview,
} from '@/components/dashboard/Panels';
import { PartialNotice, Stat, UpdatedAt } from '@/components/dashboard/Primitives';
import { useWallet as useWalletContext, useActiveChain } from '@/lib/WalletProvider';
import { useNetworkMode } from '@/lib/network';
import { byToken, formatUSD, usePortfolio } from '@/lib/portfolio';
import { useSiwe } from '@/lib/useSiwe';
import { useMarket } from '@/lib/useMarket';
import { useNetworkStatus } from '@/lib/useNetworkStatus';
import { useTransfers } from '@/lib/useTransfers';

function DashboardView() {
  const { address, wallet } = useWalletContext();
  const chain = useActiveChain();
  const { isTestnet } = useNetworkMode();
  const siwe = useSiwe();

  const portfolio = usePortfolio(address as Address | null, isTestnet, { pollMs: 30_000 });
  const market = useMarket(isTestnet);
  const networkProbe = useNetworkStatus(isTestnet, { pollMs: 30_000, limit: 6 });
  const transfers = useTransfers(chain, address as Address | null, 8);

  const tokens = byToken(portfolio.chains);
  const chainOk = networkProbe.statuses.find((s) => s.chain.id === chain?.id)?.ok ?? null;
  const authenticated = siwe.status === 'signed-in';

  return (
    <div className="min-h-screen py-6 sm:py-8 animate-in">
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">Dashboard</h1>
          <p className="text-slate-400 text-sm sm:text-base">
            Real-time view across {portfolio.chains.length || 'your'} chains
          </p>
        </header>

        {/* Total value hero */}
        <section className="glass glow-teal p-6 sm:p-8 mb-6 sm:mb-8">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">
                Total Portfolio Value
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
            <Link
              href="/portfolio"
              className="text-sm px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-arc-500/30 transition-all"
            >
              Full breakdown →
            </Link>
          </div>

          {portfolio.partial && (
            <PartialNotice>
              One or more chains could not be reached. The total shown is a lower bound.
            </PartialNotice>
          )}
        </section>

        {/* Quick stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Stat
            label="Tokens held"
            value={tokens.length || '—'}
            hint={tokens.length > 0 ? 'Across all chains' : undefined}
          />
          <Stat
            label="Chains"
            value={portfolio.chains.length || '—'}
            hint={portfolio.chains.length > 0 ? 'With balances' : undefined}
          />
          <Stat
            label="Networks"
            value={
              networkProbe.total > 0 ? `${networkProbe.healthy}/${networkProbe.total}` : '—'
            }
            hint={networkProbe.total > 0 ? 'Reachable' : undefined}
            tone={networkProbe.allHealthy ? 'accent' : 'default'}
          />
          <Stat
            label="Session"
            value={authenticated ? 'Signed in' : 'Guest'}
            tone={authenticated ? 'accent' : 'muted'}
          />
        </div>

        {/* Quick actions */}
        <div className="mb-6 sm:mb-8">
          <QuickActions />
        </div>

        {/* Main grid */}
        <div className="grid lg:grid-cols-12 gap-5 sm:gap-6">
          {/* Left column: tokens + chains */}
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

          {/* Middle column: activity */}
          <div className="lg:col-span-4">
            <RecentActivity
              transfers={transfers.transfers}
              loading={transfers.loading}
              error={transfers.error}
              chain={chain}
              onRetry={transfers.refresh}
            />
          </div>

          {/* Right column: wallet + network + market */}
          <div className="lg:col-span-3 space-y-5 sm:space-y-6">
            <WalletOverview
              address={address ?? ''}
              walletName={wallet?.name ?? null}
              chain={chain}
              chainOk={chainOk}
              sessionLabel={
                authenticated ? (
                  <span className="text-mint-300">✓ Authenticated</span>
                ) : (
                  <span className="text-slate-400">Guest</span>
                )
              }
            />

            <NetworkStatus
              statuses={networkProbe.statuses}
              loading={networkProbe.loading}
              checkedAt={networkProbe.checkedAt}
              healthy={networkProbe.healthy}
              total={networkProbe.total}
              onRefresh={networkProbe.refresh}
            />

            <MarketOverview
              rows={market.rows}
              loading={market.loading}
              error={market.error}
              updatedAt={market.updatedAt}
              onRetry={market.refresh}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <WalletGuard featureName="Dashboard">
      <DashboardView />
    </WalletGuard>
  );
}
