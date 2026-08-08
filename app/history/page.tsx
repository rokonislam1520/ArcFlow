'use client';
/**
 * Transaction history across every configured chain.
 *
 * Scope note, stated in the UI as well as here: this reads ERC-20 Transfer logs
 * over a recent block window on each chain. Public RPCs cap `eth_getLogs`
 * ranges, so complete lifetime history is not reachable from the browser — that
 * needs an indexer. The page says which window it covers rather than presenting
 * a partial list as though it were everything.
 */
import { useMemo, useState } from 'react';
import type { Address } from 'viem';
import { WalletGuard } from '@/components/WalletGuard';
import {
  EmptyState,
  ErrorState,
  Panel,
  PartialNotice,
  SkeletonRows,
  Stat,
  TokenBadge,
} from '@/components/dashboard/Primitives';
import { explorerTxUrl, getEnvChains } from '@/lib/chains';
import { useNetworkMode } from '@/lib/network';
import { useWallet } from '@/lib/WalletProvider';
import {
  mergeHistory,
  relativeTime,
  shortAddress,
  useHistory,
  type HistoryTransfer,
} from '@/lib/useHistory';

type DirectionFilter = 'all' | 'sent' | 'received';

/** Rows added per "Load more" press. */
const PAGE_SIZE = 25;

function HistoryView() {
  const { address } = useWallet();
  const { isTestnet } = useNetworkMode();
  const history = useHistory(address as Address | null, isTestnet);

  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [chainFilter, setChainFilter] = useState<string>('all');
  const [tokenFilter, setTokenFilter] = useState<string>('all');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const all = useMemo(() => mergeHistory(history.chains), [history.chains]);

  // Options come from what was actually found, so a filter can never select an
  // empty set that looks like "no results" when it is really "no such chain".
  const chainOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of all) seen.set(t.chainId, t.chainLabel);
    return [...seen.entries()];
  }, [all]);

  const tokenOptions = useMemo(
    () => [...new Set(all.map((t) => t.tokenSymbol))].sort(),
    [all]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((t) => {
      if (direction !== 'all' && t.direction !== direction) return false;
      if (chainFilter !== 'all' && t.chainId !== chainFilter) return false;
      if (tokenFilter !== 'all' && t.tokenSymbol !== tokenFilter) return false;
      if (!q) return true;
      // Matching the full hash and address, not the truncated display form, so
      // pasting either from an explorer finds the row.
      return (
        t.txHash.toLowerCase().includes(q) ||
        t.counterparty.toLowerCase().includes(q) ||
        t.tokenSymbol.toLowerCase().includes(q) ||
        t.chainLabel.toLowerCase().includes(q) ||
        t.amount.includes(q)
      );
    });
  }, [all, query, direction, chainFilter, tokenFilter]);

  const page = filtered.slice(0, visible);
  const failedChains = history.chains.filter((c) => c.error);

  const totals = useMemo(() => {
    let sent = 0;
    let received = 0;
    for (const t of all) {
      if (t.direction === 'sent') sent += 1;
      else received += 1;
    }
    return { sent, received };
  }, [all]);

  const resetPaging = () => setVisible(PAGE_SIZE);

  return (
    <div className="animate-in">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-2">
            <h1 className="text-3xl sm:text-4xl font-bold">History</h1>
            <button
              onClick={() => void history.refresh()}
              disabled={history.loading}
              className="text-sm px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50 transition-all"
            >
              {history.loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <p className="text-slate-400 text-sm sm:text-base">
            Transfers across {history.total || 'all'} chains, read from on-chain logs
            {history.narrowestScan !== null && (
              <> · last {history.narrowestScan.toString()} blocks per chain</>
            )}
          </p>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <Stat label="Transfers" value={all.length || '—'} hint="In scanned range" />
          <Stat label="Sent" value={totals.sent || '—'} />
          <Stat label="Received" value={totals.received || '—'} tone="accent" />
          <Stat
            label="Chains"
            value={history.total > 0 ? `${history.healthy}/${history.total}` : '—'}
            hint="Read successfully"
          />
        </div>

        {failedChains.length > 0 && (
          <div className="mb-6">
            <PartialNotice>
              {failedChains.length === 1
                ? `${failedChains[0].chain.label} could not be read, so its transfers are missing from this list.`
                : `${failedChains.length} chains could not be read, so their transfers are missing from this list.`}
            </PartialNotice>
          </div>
        )}

        <Panel
          title="All activity"
          subtitle={
            filtered.length === all.length
              ? `${all.length} transfer${all.length === 1 ? '' : 's'}`
              : `${filtered.length} of ${all.length} shown`
          }
        >
          {/* Filters */}
          <div className="space-y-3 mb-5">
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                resetPaging();
              }}
              placeholder="Search by address, tx hash, token or amount"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm placeholder:text-slate-600 focus:outline-none focus:border-arc-500/50"
            />

            <div className="flex flex-wrap gap-2">
              <div className="flex rounded-xl bg-white/5 border border-white/10 p-1">
                {(['all', 'sent', 'received'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      setDirection(d);
                      resetPaging();
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs capitalize transition-colors ${
                      direction === d
                        ? 'bg-arc-500/20 text-arc-300'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              {chainOptions.length > 1 && (
                <select
                  value={chainFilter}
                  onChange={(e) => {
                    setChainFilter(e.target.value);
                    resetPaging();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs focus:outline-none focus:border-arc-500/50"
                >
                  <option value="all">All chains</option>
                  {chainOptions.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              )}

              {tokenOptions.length > 1 && (
                <select
                  value={tokenFilter}
                  onChange={(e) => {
                    setTokenFilter(e.target.value);
                    resetPaging();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs focus:outline-none focus:border-arc-500/50"
                >
                  <option value="all">All tokens</option>
                  {tokenOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Rows */}
          {history.loading && all.length === 0 ? (
            <SkeletonRows rows={6} />
          ) : all.length === 0 ? (
            history.healthy === 0 && history.total > 0 ? (
              <ErrorState
                message="No chain could be reached, so history could not be loaded."
                onRetry={() => void history.refresh()}
              />
            ) : (
              <EmptyState
                message="No transfers found in the scanned range."
                hint={
                  history.narrowestScan !== null
                    ? `Only the last ${history.narrowestScan.toString()} blocks are scanned on each chain, so anything older is not shown.`
                    : 'Only recent blocks are scanned on each chain; older transfers are not shown.'
                }
              />
            )
          ) : filtered.length === 0 ? (
            <EmptyState
              message="No transfers match these filters."
              hint="Clear the search or switch the filters to see the full list."
            />
          ) : (
            <>
              <ul className="space-y-1">
                {page.map((t) => (
                  <HistoryRow key={`${t.chainId}-${t.txHash}-${t.direction}-${t.tokenSymbol}`} transfer={t} />
                ))}
              </ul>

              {visible < filtered.length && (
                <div className="mt-5 text-center">
                  <button
                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                    className="text-sm px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                  >
                    Load more ({filtered.length - visible} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </Panel>

        {/* The window is not a choice but a provider limit, and it is narrowed
            further at runtime when an RPC rejects the wider query. Stating the
            real number avoids implying this list is complete history. */}
        <p className="text-xs text-slate-600 mt-4 text-center">
          History is read from ERC-20 Transfer logs
          {history.narrowestScan !== null
            ? ` over the last ${history.narrowestScan.toString()} blocks of each chain`
            : ' over a recent block window on each chain'}
          . Public RPCs cap how far back logs can be queried, so this is not complete history —
          full coverage needs an indexer.
        </p>
      </div>
    </div>
  );
}

function HistoryRow({ transfer: t }: { transfer: HistoryTransfer }) {
  const { isTestnet } = useNetworkMode();
  const sent = t.direction === 'sent';
  const when = relativeTime(t.timestamp);

  // Resolve the explorer link from the same registry the data came from.
  const url = useMemo(() => {
    const chain = getEnvChains(isTestnet).find((c) => c.id === t.chainId);
    return chain ? explorerTxUrl(chain, t.txHash) : null;
  }, [t.chainId, t.txHash, isTestnet]);

  const body = (
    <div className="flex items-center gap-3 p-3.5 rounded-xl hover:bg-white/[0.04] transition-colors">
      <TokenBadge symbol={t.tokenSymbol} size={38} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">
            {sent ? 'Sent to' : 'Received from'}{' '}
            <span className="font-mono text-xs text-slate-400">
              {shortAddress(t.counterparty)}
            </span>
          </span>
          {/* Present because it is confirmed: a reverted tx emits no Transfer. */}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-mint-500/15 text-mint-300">
            Confirmed
          </span>
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          {t.chainLabel} · {when ?? `block ${t.blockNumber.toString()}`}
        </div>
      </div>

      <div
        className={`text-sm font-semibold shrink-0 tabular-nums text-right ${
          sent ? 'text-slate-200' : 'text-mint-300'
        }`}
      >
        {sent ? '−' : '+'}
        {Number(t.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })}
        <div className="text-[11px] font-normal text-slate-500">{t.tokenSymbol}</div>
      </div>
    </div>
  );

  return (
    <li>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block">
          {body}
        </a>
      ) : (
        body
      )}
    </li>
  );
}

export default function HistoryPage() {
  return (
    <WalletGuard featureName="History">
      <HistoryView />
    </WalletGuard>
  );
}
