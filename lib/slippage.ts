/**
 * Slippage tolerance, expressed in the same unit App Kit enforces it in.
 *
 * App Kit's `SwapConfig.slippageBps` is the only place slippage is actually
 * applied: the service derives the route's stop limit from it, and that limit is
 * what reverts the swap on-chain if the market moves. So this module works in
 * basis points end to end rather than in percent, and converts only at the edge
 * where a human reads or types a number. Rounding a percent into bps in more
 * than one place is how a UI ends up quoting 0.5% and signing 0.49%.
 *
 * Kept free of React so the parsing and clamping rules can be reasoned about —
 * and tested — without mounting a component.
 */

/** App Kit's own documented default, verified in `SwapConfig` (300 bps = 3%). */
export const DEFAULT_SLIPPAGE_BPS = 300;

/**
 * Presets offered as one tap each.
 *
 * The SDK default is included deliberately. On thin pools — Arc Testnet being
 * the case at hand — a 0.1% tolerance mostly produces failed swaps, so hiding
 * the working default behind a "custom" field would push users toward the
 * settings that break.
 */
export const SLIPPAGE_PRESETS_BPS = [10, 50, 100, DEFAULT_SLIPPAGE_BPS] as const;

/**
 * Bounds on a custom value.
 *
 * The floor is one basis point because zero tolerance cannot execute: any
 * movement at all would breach the limit. Anything typed below 0.01% but at
 * least half a basis point rounds up onto this floor rather than being refused —
 * such a value is not invalid, only finer than the unit the protocol enforces.
 *
 * The ceiling is 50%, which is far past anything defensible and exists only to
 * stop a typo (a stray digit turning 5% into 50%) from authorising a route that
 * returns almost nothing. Values in the upper part of this range are allowed but
 * flagged — see `isRiskyBps`.
 */
export const MIN_SLIPPAGE_BPS = 1;
export const MAX_SLIPPAGE_BPS = 5_000;

/** Above this, the tolerance is wide enough to be worth warning about. */
const RISKY_BPS = 500;

/** Below this, most routes will simply fail to quote or will revert. */
const FRAGILE_BPS = 10;

/** Basis points as a percentage string, without trailing noise: 50 → "0.5". */
export function bpsToPercentText(bps: number): string {
  // Three decimals covers 1 bp (0.01%) exactly; `Number` then drops the zeros
  // so a preset reads "0.5" and not "0.500".
  return String(Number((bps / 100).toFixed(3)));
}

/** Basis points as a fraction, for arithmetic against quoted amounts. */
export function bpsToFraction(bps: number): number {
  return bps / 10_000;
}

/**
 * Parse a typed percentage into basis points.
 *
 * Returns null for anything that is not a usable tolerance, so the caller can
 * keep the user's raw text on screen while refusing to act on it. Silently
 * coercing "0.05.1" or "abc" to a number would submit a tolerance the user
 * never entered.
 */
export function parsePercentToBps(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;

  // Rounded rather than truncated: 0.155% is nearer 16 bps than 15, and
  // truncation would always bias the tolerance tighter than what was asked for.
  const bps = Math.round(value * 100);
  if (bps < MIN_SLIPPAGE_BPS || bps > MAX_SLIPPAGE_BPS) return null;

  return bps;
}

/** True when the tolerance is wide enough to invite a materially worse fill. */
export function isRiskyBps(bps: number): boolean {
  return bps > RISKY_BPS;
}

/** True when the tolerance is so tight the swap will probably not execute. */
export function isFragileBps(bps: number): boolean {
  return bps < FRAGILE_BPS;
}
