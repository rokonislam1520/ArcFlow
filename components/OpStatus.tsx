'use client';
/**
 * Renders the real state of an App Kit operation, including the quote the user
 * must accept before anything is signed.
 *
 * Every figure shown here comes from App Kit's own estimate — nothing is
 * invented client-side. Success is only claimed once the SDK has resolved, and
 * each hash links to the correct explorer so the user can verify independently.
 */
import { explorerTxUrl, type ArcChain } from '@/lib/chains';
import type { OpState } from '@/lib/useAppKitOps';
import type { SafetyReport } from '@/lib/safety';

/**
 * Recipient checks, shown between the fee table and the confirm button.
 *
 * Placed inside the quote card rather than beside the address field because
 * this is the last moment before a signature, and it is the only moment the
 * user is definitely reading. Nothing here disables Confirm: each warning has
 * a legitimate case, so the honest design informs rather than obstructs — see
 * `lib/safety.ts` for why blocking would be worse.
 */
function SafetyNotes({ report }: { report: SafetyReport | null }) {
  if (!report || report.warnings.length === 0) return null;

  return (
    <ul className="space-y-2 pt-3 border-t border-hairline">
      {report.warnings.map((w) => {
        const caution = w.level === 'caution';
        return (
          <li
            key={w.id}
            className={`flex gap-2.5 text-xs rounded-lg px-3 py-2 ${
              caution
                ? 'bg-amber-500/10 border border-amber-500/30'
                : 'bg-surface-input border border-hairline'
            }`}
          >
            <span
              className={`shrink-0 mt-0.5 ${caution ? 'text-warning' : 'text-ink-muted'}`}
              aria-hidden
            >
              {caution ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </span>
            <span className="min-w-0">
              <span className={`block font-semibold ${caution ? 'text-warning' : 'text-ink-secondary'}`}>
                {w.title}
              </span>
              <span className="block text-ink-muted">{w.detail}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function FeeTable({ state }: { state: OpState }) {
  const quote = state.quote;
  if (!quote) return null;

  return (
    <div className="space-y-3">
      {quote.output && (
        <div className="flex justify-between items-baseline">
          <span className="text-ink-secondary text-sm">You receive (estimated)</span>
          <span className="text-lg font-semibold text-ink-primary">
            {quote.output.amount} {quote.output.token}
          </span>
        </div>
      )}

      {/* The floor the route guarantees. Without it a user cannot judge slippage. */}
      {quote.minOutput && (
        <div className="flex justify-between text-xs">
          <span className="text-ink-muted">Minimum received</span>
          <span className="text-ink-secondary font-mono">
            {quote.minOutput.amount} {quote.minOutput.token}
          </span>
        </div>
      )}

      {quote.destination?.address && (
        <div className="flex justify-between text-xs">
          <span className="text-ink-muted">Recipient</span>
          <span className="text-ink-secondary font-mono">
            {quote.destination.address.slice(0, 6)}…{quote.destination.address.slice(-4)}
            {quote.destination.chain ? ` on ${quote.destination.chain.replace(/_/g, ' ')}` : ''}
          </span>
        </div>
      )}

      {quote.fees.length > 0 ? (
        <div className="pt-2 border-t border-hairline space-y-1.5">
          {quote.fees.map((fee, i) => (
            <div key={`${fee.label}-${i}`} className="flex justify-between text-xs">
              <span className="text-ink-muted capitalize">
                {fee.label}
                {/* Bridges charge on both chains, so name which one. */}
                {fee.chain && (
                  <span className="text-ink-muted"> · {fee.chain.replace(/_/g, ' ')}</span>
                )}
              </span>
              <span className="text-ink-secondary font-mono">
                {fee.amount} {fee.token}
              </span>
            </div>
          ))}
        </div>
      ) : (
        // Silence would read as "free", which would be a lie.
        <p className="text-xs text-ink-muted pt-2 border-t border-hairline">
          No fee breakdown was returned for this route.
        </p>
      )}
    </div>
  );
}

export function OpStatus({
  state,
  chain,
  onConfirm,
  onCancel,
  safety,
  safetyPending,
}: {
  state: OpState;
  chain: ArcChain;
  /** Provided by pages that use the quote → confirm flow. */
  onConfirm?: () => void;
  onCancel?: () => void;
  /** Recipient checks for this quote. Omitted by operations that have no recipient. */
  safety?: SafetyReport | null;
  /** True while the checks are still running. */
  safetyPending?: boolean;
}) {
  if (state.stage === 'idle') return null;

  // A quote awaiting the user's decision.
  if (state.stage === 'quoted') {
    return (
      <div className="rounded-xl border border-arc-500/30 bg-arc-500/5 p-4 space-y-4">
        <div className="text-sm font-semibold text-accent-text">Confirm details</div>
        <FeeTable state={state} />

        {/*
          Announced while running so Confirm is never pressed in the belief the
          checks came back clean when they simply had not finished.
        */}
        {safetyPending ? (
          <p className="flex items-center gap-2 text-xs text-ink-muted pt-3 border-t border-hairline">
            <span className="inline-block w-3 h-3 border-2 border-arc-400 border-t-transparent rounded-full animate-spin" />
            Running checks…
          </p>
        ) : (
          <SafetyNotes report={safety ?? null} />
        )}

        {state.kind === 'bridge' && (
          <p className="text-xs text-ink-muted">
            Your wallet will prompt more than once: an approval, the burn, then the mint on the
            destination chain.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onConfirm}
            className="btn-arc flex-1 py-2.5 text-sm"
          >
            Confirm
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-sm bg-surface-input border border-hairline hover:bg-surface-hover/[0.06]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (state.stage === 'error') {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm space-y-3">
        <div>
          <div className="font-semibold text-danger mb-1">
            {state.error === 'Cancelled in wallet.' ? 'Cancelled' : 'Failed'}
          </div>
          <p className="text-danger/90 break-words">{state.error}</p>
        </div>

        {/* A prior quote survives a decline, so retrying costs no extra round trip. */}
        {state.quote && onConfirm && (
          <button
            onClick={onConfirm}
            className="w-full py-2 rounded-xl text-sm bg-surface-input border border-hairline hover:bg-surface-hover/[0.06]"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (state.stage === 'success') {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
        <div className="font-semibold text-success mb-1">Complete</div>
        <p className="text-success/90">{state.message}</p>
        {state.hashes.length > 0 && (
          <div className="mt-3 space-y-1">
            {state.hashes.map((hash) => {
              const url = explorerTxUrl(chain, hash);
              return (
                <div key={hash} className="font-mono text-xs break-all">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-text hover:underline"
                    >
                      {hash}
                    </a>
                  ) : (
                    <span className="text-ink-secondary">{hash}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // quoting / awaitingSignature / pending
  return (
    <div className="rounded-xl border border-arc-500/30 bg-arc-500/10 p-4 text-sm flex items-center gap-3">
      <span className="inline-block w-4 h-4 border-2 border-arc-400 border-t-transparent rounded-full animate-spin" />
      <span className="text-accent-text">{state.message}</span>
    </div>
  );
}
