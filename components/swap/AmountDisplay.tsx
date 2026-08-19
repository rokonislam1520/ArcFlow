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
 * Toggling exchanges which of the two figures is large and which is small — the
 * same two facts, reordered by what the user currently cares about. Someone
 * thinking "I want to trade $50 of this" reads the dollar figure first; someone
 * thinking "I want to trade 1.34 of these" reads the token amount first.
 *
 * Split into two exports because the card places them on different rows: the
 * large figure sits beside the token pill, while the small one sits on the
 * card's bottom line next to the balance. They are not free to disagree about
 * which is which — both ask `usdLeads`, so the rule lives in one place.
 *
 * When no price exists the toggle disappears rather than presenting a dead
 * control or, worse, a dollar figure invented from a missing rate. The token
 * amount stays large because it is the fact we actually have.
 */
import { formatUSD } from '@/lib/portfolio';

/**
 * Whether the dollar figure may take the large slot.
 *
 * A preference for USD is not enough on its own: without a price there is no
 * figure to promote, and promoting an absent one would mean printing a number
 * we do not have.
 */
export function usdLeads(showUsdFirst: boolean, usdValue: number | null): boolean {
  return showUsdFirst && usdValue !== null;
}

/** The large figure: whichever of the two currently leads. */
export function AmountDisplay({
  /** The token figure. An element, so the Sell side can pass its input. */
  tokenNode,
  /** USD value of the amount, or null when unpriced. */
  usdValue,
  showUsdFirst,
}: {
  tokenNode: React.ReactNode;
  usdValue: number | null;
  showUsdFirst: boolean;
}) {
  return (
    <div className="min-w-0">
      {/*
       * The null check is written out rather than delegated to `usdLeads`: it is
       * what proves to the compiler that there is a figure to format, and a cast
       * would assert that on no evidence.
       */}
      {showUsdFirst && usdValue !== null ? (
        <div className="text-4xl sm:text-[42px] font-semibold tracking-tight tabular-nums truncate">
          {formatUSD(usdValue)}
        </div>
      ) : (
        tokenNode
      )}
    </div>
  );
}

/**
 * The small figure and the toggle, for the card's bottom line.
 *
 * Sized and aligned by its parent row so it can share a baseline with the
 * balance opposite it.
 */
export function AmountValueLine({
  /** The token amount as text, for when USD holds the large slot. */
  tokenText,
  usdValue,
  showUsdFirst,
  onToggle,
  /** Symbol shown beside the token amount when it is the small line. */
  symbol,
}: {
  tokenText: string | null;
  usdValue: number | null;
  showUsdFirst: boolean;
  onToggle: () => void;
  symbol?: string;
}) {
  const usdIsPrimary = usdLeads(showUsdFirst, usdValue);

  return (
    <>
      <span className="text-xs text-ink-muted tabular-nums truncate">
        {usdIsPrimary ? (
          // The exact token amount, unrounded: this is the figure being traded,
          // so it must stay legible even while USD is in front.
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
       * Hidden when there is no price: a toggle that cannot toggle is worse than
       * no toggle, and inventing a dollar value to fill it would be dishonest
       * about what we know.
       */}
      {usdValue !== null && (
        <button
          onClick={onToggle}
          aria-pressed={usdIsPrimary}
          aria-label={usdIsPrimary ? 'Show token amount first' : 'Show USD value first'}
          title={usdIsPrimary ? 'Show token amount first' : 'Show USD value first'}
          /*
           * A bordered circle, so this reads as a control rather than an icon
           * printed beside the figure — it changes what the card shows, and
           * something clickable should look clickable before it is hovered.
           *
           * Fixed 28px with `shrink-0` and `justify-center`: the width is not
           * derived from the glyph, so the icon stays centred and the circle
           * stays a circle whatever the row does around it. Surface and hairline
           * tokens rather than literal colours, so both themes follow the card
           * it sits on. The focus ring is the app's existing one.
           */
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full
            bg-surface-input border border-hairline text-ink-muted
            hover:text-accent-text hover:border-arc-500/40 hover:bg-arc-500/15
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
            active:scale-90 transition-all duration-200 ease-premium"
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
    </>
  );
}
