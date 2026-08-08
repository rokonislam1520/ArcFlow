'use client';
/**
 * Dashboard panels. Each owns one question and one data source.
 *
 * Every number rendered here traces to a live read — an RPC call or the pricing
 * service. There are no seeded values, no illustrative figures, and no "—"
 * standing in for a number we could have fetched but didn't.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ArcChain } from '@/lib/chains';
import { explorerTxUrl } from '@/lib/chains';
import { formatUSD, type ChainPortfolio, type TokenTotal } from '@/lib/portfolio';
import { formatPrice, type MarketRow } from '@/lib/useMarket';
import { gradeLatency, type ChainStatus } from '@/lib/useNetworkStatus';
import { relativeTime, shortAddress, type Transfer } from '@/lib/useTransfers';
import {
  EmptyState,
  ErrorState,
  Panel,
  SkeletonRows,
  StatusDot,
  TokenBadge,
  UpdatedAt,
  UsdValue,
} from './Primitives';

/* ------------------------------------------------------------------ actions */

const ACTIONS = [
  { label: 'Send', href: '/send', icon: '↗', hint: 'Transfer stablecoins' },
  { label: 'Receive', href: '/receive', icon: '↙', hint: 'Show your address' },
  { label: 'Swap', href: '/swap', icon: '⇄', hint: 'Exchange tokens' },
  { label: 'Bridge', href: '/bridge', icon: '⇥', hint: 'Move across chains' },
] as const;

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {ACTIONS.map((a) => (
        <Link
          key={a.label}
          href={a.href}
          title={a.hint}
          // Lifts on hover and settles on press, matching the shared buttons, so
          // these read as the same class of control despite being links.
          className="group flex flex-col gap-2 p-4 rounded-2xl bg-surface-input border border-hairline
            hover:bg-surface-hover/[0.06] hover:border-arc-500/30 hover:-translate-y-0.5 hover:shadow-card-hover
            active:translate-y-0 active:scale-[0.985]
            transition-all duration-200 ease-premium"
        >
          <span
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-arc-400 to-azure-500 ring-1 ring-inset ring-white/20
              text-accent-contrast flex items-center justify-center text-base font-semibold
              group-hover:shadow-glow-arc transition-shadow duration-300 ease-premium"
          >
            {a.icon}
          </span>
          <span className="text-sm font-medium text-ink-primary">{a.label}</span>
          <span className="text-[11px] text-ink-muted leading-tight">{a.hint}</span>
        </Link>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- wallet overview */

export function WalletOverview({
  address,
  walletName,
  chain,
  chainOk,
  sessionLabel,
}: {
  address: string;
  walletName: string | null;
  chain: ArcChain | null;
  chainOk: boolean | null;
  sessionLabel: ReactNode;
}) {
  const rows: Array<{ label: string; value: ReactNode }> = [
    {
      label: 'Address',
      value: <span className="font-mono text-xs break-all">{address}</span>,
    },
    { label: 'Wallet', value: walletName ?? 'Injected provider' },
    {
      label: 'Network',
      value: chain ? (
        <span className="inline-flex items-center gap-2">
          <StatusDot ok={chainOk} title={chainOk ? 'Reachable' : 'Unreachable'} />
          {chain.label}
          {chain.chainId !== undefined && (
            <span className="text-ink-muted text-xs">· id {chain.chainId}</span>
          )}
        </span>
      ) : (
        <span className="text-warning">Unrecognized network</span>
      ),
    },
    { label: 'Gas token', value: chain ? chain.nativeCurrency.symbol : '—' },
    { label: 'Session', value: sessionLabel },
  ];

  return (
    <Panel title="Wallet" subtitle="Connection details">
      <dl className="space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4">
            <dt className="text-xs uppercase tracking-wider text-ink-muted pt-0.5 shrink-0">
              {r.label}
            </dt>
            <dd className="text-sm text-right min-w-0">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ------------------------------------------------------- token breakdown */

export function TokenBreakdown({
  tokens,
  loading,
  totalUSD,
}: {
  tokens: TokenTotal[];
  loading: boolean;
  totalUSD: number;
}) {
  if (loading && tokens.length === 0) {
    return (
      <Panel title="By stablecoin" subtitle="Across every chain">
        <SkeletonRows rows={3} />
      </Panel>
    );
  }

  return (
    <Panel
      title="By stablecoin"
      subtitle={tokens.length > 0 ? `${tokens.length} held` : undefined}
    >
      {tokens.length === 0 ? (
        <EmptyState
          message="No stablecoin balances found."
          hint="Balances appear here once this address holds USDC, EURC or USDT."
        />
      ) : (
        <div className="space-y-2">
          {tokens.map((t) => {
            // Share is only meaningful for a priced holding against a real total.
            const share =
              t.valueUSD !== null && totalUSD > 0 ? (t.valueUSD / totalUSD) * 100 : null;
            return (
              <div
                key={t.symbol}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-surface-input border border-hairline
                  hover:bg-surface-hover/[0.06] hover:border-hairline transition-colors duration-200"
              >
                <TokenBadge symbol={t.symbol} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{t.symbol}</span>
                    {t.chains > 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-input text-ink-secondary">
                        {t.chains} chains
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted tabular-nums">
                    {t.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} {t.symbol}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-sm">
                    <UsdValue value={t.valueUSD} format={formatUSD} />
                  </div>
                  {share !== null && (
                    <div className="text-xs text-ink-muted tabular-nums">
                      {share.toFixed(1)}%
                    </div>
                  )}
                  {t.hasUnpriced && (
                    <div
                      className="text-[10px] text-warning/80"
                      title="Some chains had no price for this token, so the value shown is a lower bound."
                    >
                      partial
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------- chain breakdown */

export function ChainBreakdown({
  chains,
  totalUSD,
  loading,
}: {
  chains: ChainPortfolio[];
  totalUSD: number;
  loading: boolean;
}) {
  if (loading && chains.length === 0) {
    return (
      <Panel title="By chain" subtitle="Where your funds sit">
        <SkeletonRows rows={3} />
      </Panel>
    );
  }

  const withValue = [...chains].sort((a, b) => b.valueUSD - a.valueUSD);

  return (
    <Panel title="By chain" subtitle="Where your funds sit">
      {withValue.length === 0 ? (
        <EmptyState
          message="No balances on any configured chain."
          hint="Every chain was reached successfully and reported an empty balance."
        />
      ) : (
        <div className="space-y-2">
          {withValue.map((c) => {
            const share = totalUSD > 0 ? (c.valueUSD / totalUSD) * 100 : 0;
            return (
              <div
                key={c.chain.id}
                className="p-3.5 rounded-xl bg-surface-input border border-hairline
                  hover:border-hairline transition-colors duration-200"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <StatusDot ok={c.error ? false : true} />
                    <span className="font-medium text-sm truncate">{c.chain.label}</span>
                    {c.chain.isTestnet && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-warning">
                        testnet
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-semibold shrink-0 tabular-nums">
                    {c.error ? (
                      <span className="text-danger text-xs font-normal">unavailable</span>
                    ) : (
                      formatUSD(c.valueUSD)
                    )}
                  </div>
                </div>

                {c.error ? (
                  <p className="text-xs text-danger/80">{c.error}</p>
                ) : (
                  <>
                    {/* Proportion bar: width is the real share of total value. */}
                    <div className="h-1.5 rounded-full bg-surface-input overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-arc-500 to-azure-500
                          transition-all duration-500 ease-premium"
                        style={{ width: `${Math.min(100, share)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[11px] text-ink-muted">
                      <span>
                        {c.holdings.length} {c.holdings.length === 1 ? 'asset' : 'assets'}
                      </span>
                      <span className="tabular-nums">{share.toFixed(1)}%</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------- recent activity */

export function RecentActivity({
  transfers,
  loading,
  error,
  chain,
  onRetry,
  href,
}: {
  transfers: Transfer[];
  loading: boolean;
  error: string | null;
  chain: ArcChain | null;
  onRetry: () => void;
  href?: string;
}) {
  return (
    <Panel
      title="Recent activity"
      subtitle={chain ? `Transfers on ${chain.label}` : undefined}
      action={
        href && transfers.length > 0 ? (
          <Link href={href} className="text-xs text-accent-text hover:text-accent-text">
            View all →
          </Link>
        ) : undefined
      }
    >
      {error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : loading && transfers.length === 0 ? (
        <SkeletonRows rows={4} />
      ) : transfers.length === 0 ? (
        <EmptyState
          message="No transfers in the recent block range."
          hint="Only the last few thousand blocks are scanned, so older history is not shown."
        />
      ) : (
        <ul className="space-y-1">
          {transfers.map((t) => {
            const when = relativeTime(t.timestamp);
            const url = chain ? explorerTxUrl(chain, t.txHash) : null;
            const sent = t.direction === 'sent';

            const row = (
              <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-hover/[0.06] transition-colors duration-200">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 border ${
                    sent
                      ? 'bg-surface-input border-hairline text-ink-secondary'
                      : 'bg-mint-500/15 border-mint-500/25 text-success'
                  }`}
                  aria-hidden
                >
                  {sent ? '↑' : '↓'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {sent ? 'Sent to' : 'Received from'}{' '}
                    <span className="font-mono text-xs text-ink-secondary">
                      {shortAddress(t.counterparty)}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    {/* Falls back to a block height when the timestamp is unknown,
                        rather than inventing a time. */}
                    {when ?? `block ${t.blockNumber.toString()}`}
                  </div>
                </div>
                <div
                  className={`text-sm font-semibold shrink-0 tabular-nums ${
                    sent ? 'text-ink-primary' : 'text-success'
                  }`}
                >
                  {sent ? '−' : '+'}
                  {Number(t.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })}{' '}
                  <span className="text-xs font-normal text-ink-secondary">{t.symbol}</span>
                </div>
              </div>
            );

            return (
              <li key={`${t.txHash}-${t.direction}-${t.symbol}`}>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="block">
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
  );
}

/* --------------------------------------------------------- network status */

export function NetworkStatus({
  statuses,
  loading,
  checkedAt,
  healthy,
  total,
  onRefresh,
}: {
  statuses: ChainStatus[];
  loading: boolean;
  checkedAt: number | null;
  healthy: number;
  total: number;
  onRefresh: () => void;
}) {
  return (
    <Panel
      title="Network status"
      subtitle={total > 0 ? `${healthy} of ${total} reachable` : 'Probing endpoints'}
      action={<UpdatedAt at={checkedAt} loading={loading && statuses.length === 0} />}
    >
      {statuses.length === 0 ? (
        loading ? (
          <SkeletonRows rows={3} />
        ) : (
          <ErrorState message="No chains could be probed." onRetry={onRefresh} />
        )
      ) : (
        <ul className="space-y-1.5">
          {statuses.map((s) => {
            const grade = gradeLatency(s.latencyMs);
            const latencyColor =
              grade === 'fast'
                ? 'text-success'
                : grade === 'ok'
                  ? 'text-ink-secondary'
                  : 'text-warning';
            return (
              <li
                key={s.chain.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-input"
              >
                <StatusDot ok={s.ok} title={s.error} />
                <span className="text-sm truncate flex-1 min-w-0">{s.chain.label}</span>
                {s.ok ? (
                  <>
                    <span className="text-[11px] text-ink-muted tabular-nums shrink-0">
                      #{s.blockNumber?.toString()}
                    </span>
                    <span className={`text-[11px] tabular-nums shrink-0 ${latencyColor}`}>
                      {s.latencyMs}ms
                    </span>
                  </>
                ) : (
                  <span
                    className="text-[11px] text-danger/90 shrink-0 max-w-[45%] truncate"
                    title={s.error}
                  >
                    {s.error ?? 'unreachable'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------- market overview */

export function MarketOverview({
  rows,
  loading,
  error,
  updatedAt,
  onRetry,
}: {
  rows: MarketRow[];
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  onRetry: () => void;
}) {
  return (
    <Panel
      title="Market"
      subtitle="Live stablecoin prices"
      action={<UpdatedAt at={updatedAt} loading={loading && rows.length === 0} />}
    >
      {error && rows.length === 0 ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <SkeletonRows rows={2} />
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const dev = r.pegDeviationPct;
            // Half a cent off peg is worth flagging on a stablecoin.
            const offPeg = dev !== null && Math.abs(dev) > 0.5;
            return (
              <li
                key={r.symbol}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-input"
              >
                <TokenBadge symbol={r.symbol} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.symbol}</div>
                  <div className="text-[11px] text-ink-muted truncate">via {r.sourceChain}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums">
                    {formatPrice(r.priceUSD)}
                  </div>
                  {dev === null ? (
                    // EURC is euro-pegged; grading it against $1 would be wrong.
                    <div className="text-[11px] text-ink-muted">not USD-pegged</div>
                  ) : (
                    <div
                      className={`text-[11px] tabular-nums ${
                        offPeg ? 'text-warning' : 'text-ink-muted'
                      }`}
                      title="Deviation from the $1.00 peg"
                    >
                      {dev >= 0 ? '+' : ''}
                      {dev.toFixed(3)}%
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
