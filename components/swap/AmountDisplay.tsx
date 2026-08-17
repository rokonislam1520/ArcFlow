'use client';
/**
 * Token ↔ USD display swap for one side of the trade.
 *
 * This is presentation only. The token amount is the value the app holds, quotes
 * with, and signs; the USD figure is derived from it using the existing
 * `useRates` price, and is never read back. Nothing here can change the amount
 * traded, which is why the toggle is safe to put next to a number that is about
 * to be signed.
 *
 * `primary` is the large figure, `secondary` the small one beneath. Toggling
 * exchanges which is which — the same two facts, reordered by what the user
 * currently cares about. Someone thinking "I want to trade $50 of this" reads
 * the dollar figure first; someone thinking "I want to trade 1.34 of these"
 * reads the token amount first.
 *
 * When no price exists the toggle disappears rather than presenting a dead
 * control or, worse, a dollar figure invented from a missing rate. The token
 * amount stays primary because it is the fact we actually have.
 */
import { formatUSD } from '@/lib/portfolio';

export function AmountDisplay({
  /** The token figure. An element, so the Sell side can pass its input. */
  tokenNode,
  /** Same figure as text, for the small line when USD is primary. */
  tokenText,
  /** USD value of the amount, or null when unpriced. */
  usdValue,
  showUsdFirst,
  onToggle,
  /** Symbol shown beside the token amount when it is the small line. */
  symbol,
}: {
  tokenNode: React.ReactNode;
  tokenText: string | null;
  usdValue: number | null;
  showUsdFirst: boolean;
  onToggle: () => void;
  symbol?: string;
}) {
  // USD can only lead when there is a real price behind it.
  const usdIsPrimary = showUsdFirst && usdValue !== null;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          {usdIsPrimary ? (
            <div className="text-4xl sm:text-[42px] font-semibold tracking-tight tabular-nums truncate">
              {formatUSD(usdValue)}
            </div>
          ) : (
            tokenNode
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-1 min-w-0">
        <span className="text-xs text-ink-muted tabular-nums truncate">
          {usdIsPrimary ? (
            // The exact token amount, unrounded: this is the figure being
            // traded, so it must stay legible even while USD is in front.
            <>
              {tokenText ?? '0'}
              {symbol ? ` ${symbol}` : ''}
            </>
          ) : usdValue !== null ? (
            formatUSD(usdValue)
          ) : (
            <span title="No market price available for this token">—</span>
          )}
        </span>

        {/*
         * Hidden when there is no price: a toggle that cannot toggle is worse
         * than no toggle, and inventing a dollar value to fill it would be
         * dishonest about what we know.
         */}
        {usdValue !== null && (
          <button
            onClick={onToggle}
            aria-pressed={usdIsPrimary}
            aria-label={usdIsPrimary ? 'Show token amount first' : 'Show USD value first'}
            title={usdIsPrimary ? 'Show token amount first' : 'Show USD value first'}
            className="group shrink-0 p-0.5 rounded-md text-ink-muted hover:text-accent-text
              hover:bg-arc-500/15 active:scale-90 transition-all duration-200"
          >
            <svg
              // A half-turn on press mirrors the exchange that just happened, so
              // the animation explains the state change rather than decorating it.
              className={`w-3.5 h-3.5 transition-transform duration-300 ease-premium ${
                usdIsPrimary ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 16V4m0 0L4 7m3-3l3 3m7 1v12m0 0l3-3m-3 3l-3-3"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
