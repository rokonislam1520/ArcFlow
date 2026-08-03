'use client';

import type { TxState } from '@/lib/useTransaction';
import { arcChain } from '@/lib/config';

function explorerUrl(hash: string): string | null {
  const base = arcChain.blockExplorers?.default?.url;
  return base ? `${base.replace(/\/$/, '')}/tx/${hash}` : null;
}

const PHASE_TEXT: Record<TxState['phase'], string> = {
  idle: '',
  'awaiting-approval-signature': 'Confirm the token approval in your wallet…',
  approving: 'Approval submitted — waiting for confirmation…',
  'awaiting-signature': 'Confirm the transaction in your wallet…',
  pending: 'Transaction submitted — waiting for confirmation…',
  confirmed: 'Transaction confirmed on-chain.',
  failed: '',
};

/**
 * Renders the real state of a transaction. There is no success state that is
 * not backed by a mined receipt.
 */
export function TxStatus({ state }: { state: TxState }) {
  if (state.phase === 'idle') return null;

  const hash = state.hash ?? state.approvalHash;
  const link = hash ? explorerUrl(hash) : null;

  if (state.phase === 'failed') {
    return (
      <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/25">
        <div className="flex items-start gap-3">
          <span className="text-red-400 text-lg leading-none">⚠</span>
          <div className="min-w-0">
            <div className="font-semibold text-red-300 text-sm">Transaction failed</div>
            <p className="text-red-200/80 text-sm mt-1 break-words">{state.error}</p>
            {hash && (
              <p className="text-xs text-slate-500 mt-2 font-mono break-all">
                {link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="hover:text-arc-400 underline">
                    {hash}
                  </a>
                ) : (
                  hash
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isConfirmed = state.phase === 'confirmed';

  return (
    <div
      className={`mt-4 p-4 rounded-xl border ${
        isConfirmed
          ? 'bg-mint-500/10 border-mint-500/25'
          : 'bg-arc-500/10 border-arc-500/25'
      }`}
    >
      <div className="flex items-start gap-3">
        {isConfirmed ? (
          <span className="text-mint-400 text-lg leading-none">✓</span>
        ) : (
          <span
            className="mt-0.5 w-4 h-4 rounded-full border-2 border-arc-400 border-t-transparent animate-spin shrink-0"
            aria-hidden
          />
        )}
        <div className="min-w-0">
          <div className={`font-semibold text-sm ${isConfirmed ? 'text-mint-300' : 'text-arc-300'}`}>
            {PHASE_TEXT[state.phase]}
          </div>
          {hash && (
            <p className="text-xs text-slate-500 mt-2 font-mono break-all">
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer" className="hover:text-arc-400 underline">
                  {hash}
                </a>
              ) : (
                hash
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
