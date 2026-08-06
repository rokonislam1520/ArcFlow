'use client';
/**
 * Dashboard.
 *
 * Every figure on this page is read from chain or from App Kit's pricing
 * service. Where a number cannot be known it is labelled as unknown rather than
 * filled in — the three places that matters most:
 *
 *  - 24H change and the value chart come from locally recorded observations
 *    (see lib/snapshots), because no historical endpoint exists. Until the
 *    series spans a day, the card says so instead of showing 0%.
 *  - Best performing asset needs per-asset history, which we do not have, so
 *    the slot shows the largest holding and is labelled as such.
 *  - Insights are computed from real balances, never generated prose.
 */
import Link from 'next/link';
import { useMemo } from 'react';
import { type Address } from 'viem';
import { WalletGuard } from '@/components/WalletGuard';
import { DashboardShell } from '@/components/dashboard/Shell';
import { AreaChart, Bar, Donut, seriesColor } from '@/components/dashboard/Charts';
import {
  EmptyState,
  ErrorState,
  Panel,
  SkeletonRows,
  StatusDot,
  TokenBadge,
  UpdatedAt,
  UsdValue,
} from '@/components/dashboard/Primitives';
import { explorerTxUrl, type ArcChain } from '@/lib/chains';
import { useNetworkMode } from '@/lib/network';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { byToken, chainAllocation, formatUSD, usePortfolio } from '@/lib/portfolio';
import { usePortfolioHistory } from '@/lib/snapshots';
import { buildInsights, emptyInsightReason } from '@/lib/insights';
import { formatPrice, useMarket } from '@/lib/useMarket';
import { useNetworkStatus } from '@/lib/useNetworkStatus';
import { relativeTime, shortAddress, useTransfers } from '@/lib/useTransfers';

/* ------------------------------------------------------------------ actions */

const QUICK_ACTIONS = [
  { label: 'Send', href: '/send', d: 'M12 19V5M5 12l7-7 7 7' },
  { label: 'Receive', href: '/receive', d: 'M12 5v14M5 12l7 7 7-7' },
  { label: 'Swap', href: '/swap', d: 'M3 7h14M14 3l4 4-4 4M17 13H3M6 9l-4 4 4 4' },
  { label: 'Bridge', href: '/bridge', d: 'M4 12h16M4 12a8 8 0 0116 0M7 12v6M17 12v6' },
  { label: 'Pay', href: '/merchant', d: 'M3 9l1-5h16l1 5M4 9v11h16V9M9 20v-6h6v6' },
  { label: 'Split', href: '/split', d: 'M6 3v6a3 3 0 003 3h6a3 3 0 013 3v6M6 21V9' },
];

function QuickActions() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
      {QUICK_ACTIONS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="group glass-sm p-3 sm:p-4 flex flex-col items-center gap-2 text-center
                     hover:bg-white/[0.06] hover:border-arc-500/25 hover:-translate-y-0.5
                     transition-all duration-200"
        >
          <span className="w-9 h-9 rounded-xl bg-arc-500/10 border border-arc-500/20 flex items-center justify-center group-hover:bg-arc-500/20 transition-colors">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-[18px] h-[18px] text-arc-300"
            >
              <path d={a.d} />
            </svg>
          </span>
          <span className="text-xs font-medium">{a.label}</span>
        </Link>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------- cards */

function MetricCard({
  label,
  value,
  sub,
  tone = 'default',
  title,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'default' | 'up' | 'down' | 'unknown';
  title?: string;
}) {
  const valueClass =
    tone === 'up'
      ? 'text-mint-400'
      : tone === 'down'
        ? 'text-red-400'
        : tone === 'unknown'
          ? 'text-slate-500'
          : 'text-white';
  return (
    <div className="glass p-4 sm:p-5" title={title}>
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">{label}</div>
      <div className={`text-xl sm:text-2xl font-bold tabular-nums leading-tight ${valueClass}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-1.5 leading-snug">{sub}</div>}
    </div>
  );
}

/* --------------------------------------------------------------------- view */

function DashboardView() {
  const { address, wallet } = useWallet();
  const chain = useActiveChain();
  const { isTestnet } = useNetworkMode();

  const portfolio = usePortfolio(address as Address | null, isTestnet, { pollMs: 30_000 });
  const market = useMarket(isTestnet);
  const networkProbe = useNetworkStatus(isTestnet, { pollMs: 30_000, limit: 8 });
  const transfers = useTransfers(chain, address as Address | null, 8);

  const tokens = useMemo(() => byToken(portfolio.chains), [portfolio.chains]);
  const allocation = useMemo(
    () => chainAllocation(portfolio.chains, portfolio.totalUSD),
    [portfolio.chains, portfolio.totalUSD]
  );

  // Only record once a real read has completed, so the initial 0 is not stored
  // as an observation and rendered as a crash to zero.
  const history = usePortfolioHistory(address, isTestnet, portfolio.totalUSD, {
    ready: portfolio.updatedAt !== null && !portfolio.loading,
  });

  const insights = useMemo(
    () =>
      buildInsights({
        chains: portfolio.chains,
        tokens,
        totalUSD: portfolio.totalUSD,
        market: market.rows,
        change24h: history.change24h,
        loading: portfolio.loading,
      }),
    [portfolio.chains, tokens, portfolio.totalUSD, market.rows, history.change24h, portfolio.loading]
  );

  const priced = tokens.filter((t) => t.valueUSD !== null && t.valueUSD > 0);
  const fundedChains = portfolio.chains.filter((c) => c.holdings.length > 0);
  const loadingFirst = portfolio.loading && portfolio.updatedAt === null;

  return (
    <div className="max-w-[112rem] mx-auto animate-in">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {fundedChains.length > 0
              ? `Funds on ${fundedChains.length} of ${networkProbe.total || '—'} networks`
              : 'Balances across every supported network'}
          </p>
        </div>
        <UpdatedAt at={portfolio.updatedAt} loading={portfolio.loading} />
      </div>

      {portfolio.partial && (
        <div className="mb-4 flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl px-3.5 py-2.5">
          <span aria-hidden>⚠</span>
          <span>
            One or more chains could not be reached, so the total below is a lower bound rather
            than your full balance.
          </span>
        </div>
      )}

      {/* Overview: hero value + metrics */}
      <div className="grid lg:grid-cols-12 gap-4 mb-5">
        <section className="lg:col-span-5 glass glow-teal p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
              Total portfolio value
            </div>
            <div className="text-4xl sm:text-5xl font-extrabold text-gradient tabular-nums leading-none">
              {loadingFirst ? '···' : formatUSD(portfolio.totalUSD)}
            </div>
            <Change24h history={history} />
          </div>

          {/* Inline value chart. Absent, with a reason, until two observations
              exist — a single point has no trend to draw. */}
          <div className="mt-5 -mx-1">
            {history.points.length >= 2 ? (
              <AreaChart
                points={history.points.map((p) => ({ at: p.at, value: p.totalUSD }))}
                height={72}
              />
            ) : (
              <p className="text-[11px] text-slate-600 leading-snug">
                Value chart appears once this device has recorded two readings.
                Nothing historical is available to backfill it.
              </p>
            )}
          </div>
        </section>

        <div className="lg:col-span-7 grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Change24hCard history={history} />

          <MetricCard
            label="Largest holding"
            value={priced[0]?.symbol ?? (loadingFirst ? '···' : '—')}
            sub={
              priced[0]
                ? `${formatUSD(priced[0].valueUSD ?? 0)} · ${priced[0].chains} chain${priced[0].chains > 1 ? 's' : ''}`
                : 'No priced assets yet'
            }
            title="Largest position by value. Per-asset performance ranking needs price history, which is not available."
          />

          <MetricCard
            label="Total assets"
            value={loadingFirst ? '···' : tokens.length || '—'}
            sub={
              tokens.length > 0
                ? `${priced.length} priced${tokens.length > priced.length ? `, ${tokens.length - priced.length} unpriced` : ''}`
                : 'Across all chains'
            }
          />

          <MetricCard
            label="Active chains"
            value={loadingFirst ? '···' : fundedChains.length || '—'}
            sub={
              networkProbe.total > 0
                ? `${networkProbe.healthy}/${networkProbe.total} RPCs reachable`
                : 'Holding a balance'
            }
            tone={networkProbe.total > 0 && !networkProbe.allHealthy ? 'unknown' : 'default'}
          />
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-5">
        <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-2.5">Quick actions</h2>
        <QuickActions />
      </div>

      {/* Main + right rail */}
      <div className="grid xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <AllocationPanel
              title="By token"
              slices={priced.map((t) => ({ label: t.symbol, value: t.valueUSD ?? 0 }))}
              rows={priced.map((t) => ({
                key: t.symbol,
                label: t.symbol,
                valueUSD: t.valueUSD,
                meta: `${t.chains} chain${t.chains > 1 ? 's' : ''}`,
              }))}
              totalUSD={portfolio.totalUSD}
              loading={loadingFirst}
              emptyMessage="No priced tokens found."
            />

            <AllocationPanel
              title="By chain"
              slices={allocation
                .filter((a) => a.valueUSD > 0)
                .map((a) => ({ label: a.chain.label, value: a.valueUSD }))}
              rows={allocation.map((a) => ({
                key: a.chain.id,
                label: a.chain.label,
                valueUSD: a.error ? null : a.valueUSD,
                meta: a.error ? 'Unreachable' : `${(a.sharePct ?? 0).toFixed(1)}%`,
              }))}
              totalUSD={portfolio.totalUSD}
              loading={loadingFirst}
              emptyMessage="No chain holds a balance."
            />
          </div>

          <TopHoldings chains={portfolio.chains} loading={loadingFirst} />

          <RecentActivity
            transfers={transfers.transfers}
            loading={transfers.loading}
            error={transfers.error}
            chain={chain}
            onRetry={transfers.refresh}
          />
        </div>

        <div className="xl:col-span-4 space-y-4">
          <ChainBreakdownPanel
            chains={portfolio.chains}
            activeChain={chain}
            address={address}
            walletName={wallet?.name ?? null}
            statuses={networkProbe.statuses}
            loading={loadingFirst}
          />

          <MarketPanel
            rows={market.rows}
            loading={market.loading}
            error={market.error}
            updatedAt={market.updatedAt}
            onRetry={market.refresh}
          />

          <InsightsPanel
            insights={insights}
            reason={emptyInsightReason({
              loading: portfolio.loading,
              hasAddress: !!address,
              tokenCount: tokens.length,
            })}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- 24h  change */

/** Inline delta under the hero figure. */
function Change24h({ history }: { history: ReturnType<typeof usePortfolioHistory> }) {
  if (!history.change24h) {
    const hours = Math.floor(history.spanMs / 3_600_000);
    return (
      <p className="mt-2 text-xs text-slate-500">
        {history.isEmpty
          ? 'Recording started just now.'
          : `${hours}h of history recorded — 24h change available after a full day.`}
      </p>
    );
  }
  const { absolute, percent } = history.change24h;
  const up = absolute >= 0;
  return (
    <p className={`mt-2 text-sm font-medium tabular-nums ${up ? 'text-mint-400' : 'text-red-400'}`}>
      {up ? '▲' : '▼'} {formatUSD(Math.abs(absolute))} ({up ? '+' : '−'}
      {Math.abs(percent).toFixed(2)}%) in 24h
    </p>
  );
}

/**
 * 24h change as a metric card.
 *
 * Shows "Not yet" rather than 0.00% when the series is too short: a zero here
 * would read as "your portfolio did not move", which is a different claim from
 * "we have not been watching long enough to say".
 */
function Change24hCard({ history }: { history: ReturnType<typeof usePortfolioHistory> }) {
  if (!history.change24h) {
    return (
      <MetricCard
        label="24H change"
        value="Not yet"
        tone="unknown"
        sub="No 24h baseline recorded on this device yet."
        title="App Kit exposes spot prices only, with no historical series, so the baseline is built from readings taken on this device."
      />
    );
  }
  const { absolute, percent } = history.change24h;
  const up = absolute >= 0;
  return (
    <MetricCard
      label="24H change"
      value={`${up ? '+' : '−'}${Math.abs(percent).toFixed(2)}%`}
      tone={up ? 'up' : 'down'}
      sub={`${up ? '+' : '−'}${formatUSD(Math.abs(absolute))} since yesterday`}
    />
  );
}

/* ----------------------------------------------------------- allocation */

function AllocationPanel({
  title,
  slices,
  rows,
  totalUSD,
  loading,
  emptyMessage,
}: {
  title: string;
  slices: Array<{ label: string; value: number }>;
  rows: Array<{ key: string; label: string; valueUSD: number | null; meta: string }>;
  totalUSD: number;
  loading: boolean;
  emptyMessage: string;
}) {
  return (
    <Panel title={title} subtitle="Share of total value">
      {loading ? (
        <SkeletonRows rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <>
          {slices.length > 0 && (
            <div className="flex justify-center mb-5">
              <Donut
                slices={slices}
                size={156}
                thickness={16}
                centerLabel="Total"
                centerValue={formatUSD(totalUSD)}
              />
            </div>
          )}
          <div className="space-y-2.5">
            {rows.slice(0, 6).map((r, i) => {
              const pct =
                r.valueUSD !== null && totalUSD > 0 ? (r.valueUSD / totalUSD) * 100 : 0;
              return (
                <div key={r.key}>
                  <div className="flex items-center justify-between gap-2 text-sm mb-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: seriesColor(i) }}
                      />
                      <span className="truncate">{r.label}</span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0 text-xs">
                      <span className="text-slate-500">{r.meta}</span>
                      <UsdValue value={r.valueUSD} format={formatUSD} className="font-medium" />
                    </span>
                  </div>
                  <Bar pct={pct} color={seriesColor(i)} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------ top holdings */

function TopHoldings({
  chains,
  loading,
}: {
  chains: Array<{ chain: ArcChain; holdings: Array<{ symbol: string; amount: string; valueUSD: number | null; chainLabel: string }> }>;
  loading: boolean;
}) {
  const all = chains
    .flatMap((c) => c.holdings)
    .sort((a, b) => (b.valueUSD ?? -1) - (a.valueUSD ?? -1))
    .slice(0, 6);

  return (
    <Panel
      title="Top holdings"
      subtitle="Individual positions, per chain"
      action={
        <Link href="/portfolio" className="text-xs text-arc-400 hover:underline">
          Full portfolio →
        </Link>
      }
    >
      {loading ? (
        <SkeletonRows rows={4} />
      ) : all.length === 0 ? (
        <EmptyState
          message="No balances found."
          hint="Receive funds or switch network mode to see holdings here."
        />
      ) : (
        <div className="space-y-1">
          {all.map((h, i) => (
            <div
              key={`${h.chainLabel}-${h.symbol}-${i}`}
              className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[0.03] transition-colors"
            >
              <TokenBadge symbol={h.symbol} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{h.symbol}</div>
                <div className="text-[11px] text-slate-500 truncate">{h.chainLabel}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm tabular-nums">
                  {Number(h.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })}
                </div>
                <UsdValue
                  value={h.valueUSD}
                  format={formatUSD}
                  className="text-[11px] text-slate-500"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- activity */

function RecentActivity({
  transfers,
  loading,
  error,
  chain,
  onRetry,
}: {
  transfers: ReturnType<typeof useTransfers>['transfers'];
  loading: boolean;
  error: string | null;
  chain: ArcChain;
  onRetry: () => void;
}) {
  return (
    <Panel
      title="Recent activity"
      subtitle={`Token transfers on ${chain.label}`}
      action={
        <Link href="/history" className="text-xs text-arc-400 hover:underline">
          All transactions →
        </Link>
      }
    >
      {loading && transfers.length === 0 ? (
        <SkeletonRows rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : transfers.length === 0 ? (
        <EmptyState
          message={`No transfers found on ${chain.label}.`}
          hint="Only the recent block window is scanned, so older activity may not appear."
        />
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-600">
                <th className="text-left font-medium px-2 pb-2.5">Type</th>
                <th className="text-left font-medium px-2 pb-2.5">Asset</th>
                <th className="text-left font-medium px-2 pb-2.5 hidden sm:table-cell">Counterparty</th>
                <th className="text-right font-medium px-2 pb-2.5">Amount</th>
                <th className="text-left font-medium px-2 pb-2.5 hidden md:table-cell">Status</th>
                <th className="text-right font-medium px-2 pb-2.5">Time</th>
                <th className="px-2 pb-2.5" />
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => {
                const url = explorerTxUrl(chain, t.txHash);
                const sent = t.direction === 'sent';
                return (
                  <tr
                    key={`${t.txHash}-${t.direction}-${t.symbol}`}
                    className="border-t border-white/5 hover:bg-white/[0.02]"
                  >
                    <td className="px-2 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs ${sent ? 'text-amber-300' : 'text-mint-300'}`}
                      >
                        <span aria-hidden>{sent ? '↑' : '↓'}</span>
                        {sent ? 'Sent' : 'Received'}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">{t.symbol}</td>
                    <td className="px-2 py-2.5 font-mono text-xs text-slate-400 hidden sm:table-cell">
                      {shortAddress(t.counterparty)}
                    </td>
                    <td
                      className={`px-2 py-2.5 text-right tabular-nums ${sent ? 'text-amber-200' : 'text-mint-200'}`}
                    >
                      {sent ? '−' : '+'}
                      {Number(t.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })}
                    </td>
                    {/* A log only exists once mined, so anything listed here is
                        confirmed by definition. Reorg risk aside, there is no
                        pending state to show. */}
                    <td className="px-2 py-2.5 hidden md:table-cell">
                      <span className="badge-success">Confirmed</span>
                    </td>
                    <td className="px-2 py-2.5 text-right text-xs text-slate-500 whitespace-nowrap">
                      {relativeTime(t.timestamp) ?? `Block ${t.blockNumber.toString()}`}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-500 hover:text-arc-400"
                          title="View on explorer"
                        >
                          ↗
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------- chain breakdown */

function ChainBreakdownPanel({
  chains,
  activeChain,
  address,
  walletName,
  statuses,
  loading,
}: {
  chains: ReturnType<typeof usePortfolio>['chains'];
  activeChain: ArcChain;
  address: string | null;
  walletName: string | null;
  statuses: ReturnType<typeof useNetworkStatus>['statuses'];
  loading: boolean;
}) {
  const explorerBase = activeChain.explorerTemplate
    ? activeChain.explorerTemplate.replace(/\/tx\/\{hash\}$/, '').replace(/\{hash\}$/, '')
    : null;

  return (
    <Panel title="Chain breakdown" subtitle={walletName ?? 'Connected wallet'}>
      {/* Active chain + address */}
      <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3.5 mb-4">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="flex items-center gap-2 text-sm font-medium min-w-0">
            <StatusDot
              ok={statuses.find((s) => s.chain.id === activeChain.id)?.ok ?? null}
              title="RPC reachability"
            />
            <span className="truncate">{activeChain.label}</span>
          </span>
          <span className="text-[10px] uppercase tracking-wider text-arc-300 bg-arc-500/12 border border-arc-500/25 rounded px-1.5 py-0.5 shrink-0">
            Active
          </span>
        </div>

        {address && (
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 text-[11px] font-mono text-slate-400 truncate">
              {address}
            </code>
            <button
              onClick={() => void navigator.clipboard?.writeText(address)}
              className="text-slate-500 hover:text-arc-400 text-xs shrink-0"
              title="Copy address"
            >
              ⧉
            </button>
            {explorerBase && (
              <a
                href={`${explorerBase.replace(/\/$/, '')}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-arc-400 text-xs shrink-0"
                title="View on explorer"
              >
                ↗
              </a>
            )}
          </div>
        )}
      </div>

      {/* Per-chain balances */}
      {loading ? (
        <SkeletonRows rows={3} />
      ) : chains.length === 0 ? (
        <EmptyState message="No chain holds a balance." />
      ) : (
        <div className="space-y-1">
          {chains.map((c) => (
            <div
              key={c.chain.id}
              className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg hover:bg-white/[0.03]"
            >
              <span className="flex items-center gap-2 min-w-0">
                <StatusDot
                  ok={statuses.find((s) => s.chain.id === c.chain.id)?.ok ?? null}
                />
                <span className="text-sm truncate">{c.chain.label}</span>
              </span>
              {c.error ? (
                <span
                  className="text-[11px] text-amber-300/80 shrink-0"
                  title={c.error}
                >
                  Unreachable
                </span>
              ) : (
                <span className="text-sm tabular-nums shrink-0">{formatUSD(c.valueUSD)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ market */

function MarketPanel({
  rows,
  loading,
  error,
  updatedAt,
  onRetry,
}: {
  rows: ReturnType<typeof useMarket>['rows'];
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  onRetry: () => void;
}) {
  return (
    <Panel
      title="Market"
      subtitle="Live prices from App Kit"
      action={<UpdatedAt at={updatedAt} loading={loading} />}
    >
      {loading && rows.length === 0 ? (
        <SkeletonRows rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState message="No prices available on this network." />
      ) : (
        <>
          <div className="space-y-0.5">
            {rows.map((r) => (
              <div
                key={r.symbol}
                className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-white/[0.03]"
              >
                <span className="min-w-0">
                  <span className="text-sm font-medium">{r.symbol}</span>
                  <span className="block text-[10px] text-slate-500 truncate">{r.name}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-sm tabular-nums">{formatPrice(r.priceUSD)}</span>
                  {r.pegDeviationPct !== null ? (
                    <span
                      className={`block text-[10px] tabular-nums ${
                        Math.abs(r.pegDeviationPct) >= 0.5
                          ? 'text-amber-400'
                          : 'text-slate-500'
                      }`}
                      title="Deviation from its $1.00 peg"
                    >
                      {r.pegDeviationPct >= 0 ? '+' : '−'}
                      {Math.abs(r.pegDeviationPct).toFixed(3)}% vs peg
                    </span>
                  ) : (
                    <span className="block text-[10px] text-slate-600">no peg</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          {/* Stated rather than left as a silent omission: a market list that
              quietly lacks BTC looks broken instead of bounded. */}
          <p className="mt-3 pt-3 border-t border-white/5 text-[10px] text-slate-600 leading-relaxed">
            Covers the stablecoins and gas assets App Kit prices. BTC and
            governance tokens such as ARB have no quote available, so they are
            omitted rather than sourced from elsewhere.
          </p>
        </>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- insights */

function InsightsPanel({
  insights,
  reason,
}: {
  insights: ReturnType<typeof buildInsights>;
  reason: string;
}) {
  return (
    <Panel title="Insights" subtitle="Computed from your balances">
      {insights.length === 0 ? (
        <EmptyState message={reason} />
      ) : (
        <div className="space-y-2.5">
          {insights.map((i) => {
            const accent =
              i.tone === 'warning'
                ? 'border-amber-500/25 bg-amber-500/[0.06]'
                : i.tone === 'positive'
                  ? 'border-mint-500/20 bg-mint-500/[0.05]'
                  : 'border-white/8 bg-white/[0.03]';
            return (
              <div key={i.id} className={`rounded-xl border p-3 ${accent}`}>
                <div className="text-sm font-medium mb-1">{i.title}</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{i.detail}</p>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------- page */

export default function DashboardPage() {
  return (
    <DashboardShell>
      <WalletGuard featureName="Dashboard">
        <DashboardView />
      </WalletGuard>
    </DashboardShell>
  );
}
