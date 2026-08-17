'use client';
/**
 * Slippage tolerance picker.
 *
 * The value this sets is passed into App Kit's `SwapConfig.slippageBps` for both
 * the estimate and the submission, so it is the tolerance the route is actually
 * built with — not a display preference. That is why changing it discards the
 * current quote: a stop limit computed at 3% says nothing about what the same
 * trade would return at 0.1%, and leaving the old figures on screen under a new
 * tolerance would misstate the trade the user is about to sign.
 *
 * Collapsed by default. Most swaps do not need this, and a settings panel opened
 * permanently above the confirm button competes with the confirm button.
 */
import { useEffect, useId, useRef, useState } from 'react';
import {
  DEFAULT_SLIPPAGE_BPS,
  MAX_SLIPPAGE_BPS,
  MIN_SLIPPAGE_BPS,
  SLIPPAGE_PRESETS_BPS,
  bpsToPercentText,
  isFragileBps,
  isRiskyBps,
  parsePercentToBps,
} from '@/lib/slippage';

export function SlippageControl({
  bps,
  onChange,
  disabled = false,
}: {
  /** Current tolerance in basis points. */
  bps: number;
  /** Called only with a valid, in-range tolerance. */
  onChange: (bps: number) => void;
  /** True while a submission is in flight; the tolerance is locked by then. */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const customInputId = useId();

  const isPreset = (SLIPPAGE_PRESETS_BPS as readonly number[]).includes(bps);

  /*
   * Keep the custom field showing the active value when it is not a preset.
   *
   * Without this, choosing a preset and reopening the panel would leave a stale
   * custom figure visible next to a different highlighted preset — two
   * contradictory answers to "what tolerance am I using".
   */
  const lastSynced = useRef<number | null>(null);
  useEffect(() => {
    if (isPreset) {
      if (customText !== '') setCustomText('');
      lastSynced.current = null;
      return;
    }
    if (lastSynced.current !== bps) {
      lastSynced.current = bps;
      setCustomText(bpsToPercentText(bps));
    }
    // `customText` is intentionally not a dependency: reacting to the user's own
    // keystrokes here would fight the input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bps, isPreset]);

  const customInvalid = customText.trim() !== '' && parsePercentToBps(customText) === null;

  const commitCustom = (text: string) => {
    setCustomText(text);
    const parsed = parsePercentToBps(text);
    // Out-of-range or malformed input leaves the previous tolerance in force.
    // The field shows what was typed; the swap keeps using a value that works.
    if (parsed !== null) onChange(parsed);
  };

  return (
    <div className="glass-sm mt-3 px-4 py-3 text-xs">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 text-left group"
      >
        <span className="flex items-center gap-2 text-ink-muted">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h16M8 6v0m8 6v0M6 18v0"
            />
          </svg>
          Max slippage
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className={`font-semibold tabular-nums ${
              isRiskyBps(bps) || isFragileBps(bps) ? 'text-warning' : 'text-ink-secondary'
            }`}
          >
            {bpsToPercentText(bps)}%
          </span>
          {bps === DEFAULT_SLIPPAGE_BPS && <span className="text-ink-muted">· default</span>}
          <svg
            className={`w-3.5 h-3.5 text-ink-muted transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-hairline animate-in">
          {/* Presets wrap rather than shrink, so nothing is cramped at 360px. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {SLIPPAGE_PRESETS_BPS.map((preset) => {
              const active = bps === preset;
              return (
                <button
                  key={preset}
                  onClick={() => onChange(preset)}
                  disabled={disabled}
                  aria-pressed={active}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold tabular-nums transition-all duration-200
                    disabled:opacity-40 disabled:cursor-not-allowed ${
                      active
                        ? 'bg-arc-500/20 text-accent-text border border-arc-500/40'
                        : 'bg-surface-input border border-hairline text-ink-secondary hover:border-arc-500/30'
                    }`}
                >
                  {bpsToPercentText(preset)}%
                </button>
              );
            })}

            <label
              htmlFor={customInputId}
              className={`flex items-center gap-1 pl-2.5 pr-2 py-1.5 rounded-lg border transition-colors duration-200 ${
                customInvalid
                  ? 'border-amber-500/40 bg-amber-500/[0.07]'
                  : !isPreset
                    ? 'border-arc-500/40 bg-arc-500/20'
                    : 'border-hairline bg-surface-input'
              }`}
            >
              <input
                id={customInputId}
                value={customText}
                onChange={(e) => {
                  // Digits and a single dot only. Anything else cannot be a
                  // percentage, and stripping it here keeps the field honest
                  // rather than accepting text that is silently ignored.
                  const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                  const parts = cleaned.split('.');
                  commitCustom(
                    parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned
                  );
                }}
                disabled={disabled}
                inputMode="decimal"
                placeholder="Custom"
                aria-label="Custom slippage percentage"
                className={`w-[68px] bg-transparent outline-none tabular-nums placeholder:text-ink-muted
                  disabled:cursor-not-allowed ${
                    !isPreset && !customInvalid ? 'text-accent-text font-semibold' : 'text-ink-secondary'
                  }`}
              />
              <span className="text-ink-muted">%</span>
            </label>
          </div>

          {/*
           * One message at a time, in order of how much it matters: an
           * unusable entry first, then a tolerance that will cost money, then
           * one that will not execute.
           */}
          {customInvalid ? (
            <p className="mt-2.5 text-warning/90">
              Enter a percentage between {bpsToPercentText(MIN_SLIPPAGE_BPS)}% and{' '}
              {bpsToPercentText(MAX_SLIPPAGE_BPS)}%. Still quoting at{' '}
              {bpsToPercentText(bps)}%.
            </p>
          ) : isRiskyBps(bps) ? (
            <p className="mt-2.5 text-warning/90">
              At {bpsToPercentText(bps)}% the route may return noticeably less than quoted.
            </p>
          ) : isFragileBps(bps) ? (
            <p className="mt-2.5 text-ink-muted">
              {bpsToPercentText(bps)}% is tight enough that the swap may fail if the price moves
              before it settles.
            </p>
          ) : (
            <p className="mt-2.5 text-ink-muted">
              Applied to the quote and to the signed transaction.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
