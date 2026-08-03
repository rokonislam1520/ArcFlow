'use client';
/**
 * Renders the real state of an App Kit operation.
 *
 * Success is only shown when App Kit resolved, and each hash links to the
 * correct chain's explorer so a user can independently verify the transfer.
 */
import { explorerTxUrl, type ArcChain } from '@/lib/chains';
import type { OpState } from '@/lib/useAppKitOps';

export function OpStatus({ state, chain }: { state: OpState; chain: ArcChain }) {
  if (state.stage === 'idle') return null;

  if (state.stage === 'error') {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
        <div className="font-semibold text-red-300 mb-1">Failed</div>
        <p className="text-red-200/90 break-words">{state.error}</p>
      </div>
    );
  }

  if (state.stage === 'success') {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
        <div className="font-semibold text-emerald-300 mb-1">Submitted</div>
        <p className="text-emerald-200/90">{state.message}</p>
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
                      className="text-arc-400 hover:underline"
                    >
                      {hash}
                    </a>
                  ) : (
                    <span className="text-slate-400">{hash}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // estimating / awaitingSignature / pending
  return (
    <div className="rounded-xl border border-arc-500/30 bg-arc-500/10 p-4 text-sm flex items-center gap-3">
      <span className="inline-block w-4 h-4 border-2 border-arc-400 border-t-transparent rounded-full animate-spin" />
      <span className="text-arc-200">{state.message}</span>
    </div>
  );
}
