'use client';
/**
 * Swap settings, behind the gear in the page header.
 *
 * Holds the slippage tolerance, which is not a display preference: the value
 * chosen here goes into App Kit's `SwapConfig.slippageBps` for both the estimate
 * and the submission, so it is the tolerance the route is built with and the
 * limit that reverts the trade on-chain if the price moves. The page discards
 * the current quote whenever it changes, because a stop limit computed at 3%
 * says nothing about the same trade at 0.1%.
 *
 * Two modes, because there are two kinds of user here: one who has no view on
 * slippage and should not be made to acquire one, and one who does. Auto is the
 * default so the first user is never blocked behind a decision.
 *
 * A note on the word "Auto": it means App Kit's own default tolerance, held
 * fixed. It does not adapt per route — the SDK exposes no per-pool
 * recommendation to read — so the copy says what it is rather than implying a
 * cleverness that is not there.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  DEFAULT_SLIPPAGE_BPS,
  MAX_SLIPPAGE_BPS,
  MIN_SLIPPAGE_BPS,
  bpsToPercentText,
  isFragileBps,
  isRiskyBps,
  parsePercentToBps,
} from '@/lib/slippage';

/** Which of the two modes owns the current tolerance. */
export type SlippageMode = 'auto' | 'custom';

export function SwapSettings({
  mode,
  bps,
  onChange,
  disabled = false,
}: {
  mode: SlippageMode;
  /** Current tolerance in basis points. */
  bps: number;
  /** Called with the mode and a valid, in-range tolerance. */
  onChange: (next: { mode: SlippageMode; bps: number }) => void;
  /** True while a submission is in flight; the tolerance is locked by then. */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [customText, setCustomText] = useState(() =>
    mode === 'custom' ? bpsToPercentText(bps) : ''
  );
  const [showInfo, setShowInfo] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setShowInfo(false);
  }, []);

  // Outside click and Escape both dismiss, as everywhere else in the app.
  useEffect(() => {
    if (!open) return;

    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Focus the field the moment Custom is chosen: it is the only thing to do
  // there, and it also makes the mode switch visibly take effect.
  useEffect(() => {
    if (open && mode === 'custom') inputRef.current?.focus();
  }, [open, mode]);

  const customInvalid = mode === 'custom' && customText.trim() !== '' && parsePercentToBps(customText) === null;
  /** Custom chosen but nothing usable typed yet, so Auto's value is still in force. */
  const customEmpty = mode === 'custom' && customText.trim() === '';

  const chooseAuto = () => {
    setCustomText('');
    onChange({ mode: 'auto', bps: DEFAULT_SLIPPAGE_BPS });
  };

  const chooseCustom = () => {
    // Switching mode does not change the tolerance on its own: the current
    // value carries over as the starting point, so nothing silently re-prices
    // between the tap and the first keystroke.
    setCustomText(bpsToPercentText(bps));
    onChange({ mode: 'custom', bps });
  };

  const commitCustom = (text: string) => {
    setCustomText(text);
    const parsed = parsePercentToBps(text);
    // Malformed or out-of-range input leaves the previous tolerance in force:
    // the field shows what was typed, the swap keeps using a value that works.
    if (parsed !== null) onChange({ mode: 'custom', bps: parsed });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Swap settings"
        className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all duration-200 ease-premium
          active:scale-95 ${
            open
              ? 'bg-arc-500/15 border-arc-500/40 text-accent-text'
              : 'bg-surface-input border-hairline text-ink-secondary hover:text-ink-primary hover:border-arc-500/30'
          }`}
      >
        {/* 18px and a heavier stroke so the gear carries at a glance. The 36px
            button is unchanged — the icon was under-weighted inside it, not the
            button too small. */}
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Swap settings"
          // Right-anchored and narrower than the cards, so it never pushes the
          // page wider on a 360px screen.
          className="absolute right-0 top-full mt-2 z-50 w-[268px] glass rounded-2xl p-3.5 shadow-float animate-scale-in"
        >
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-bold tracking-tight">Max Slippage</h2>
            <button
              onClick={() => setShowInfo((v) => !v)}
              aria-label="What is max slippage?"
              aria-expanded={showInfo}
              className="w-4 h-4 rounded-full bg-surface-input border border-hairline text-ink-muted
                hover:text-accent-text hover:border-arc-500/30 flex items-center justify-center
                text-[10px] font-bold leading-none transition-colors"
            >
              i
            </button>
          </div>

          {showInfo && (
            <p className="mt-2 text-[11px] text-ink-muted leading-relaxed animate-in">
              The most the price may move against you before the swap is cancelled on-chain.
              Applied to the quote and to the transaction you sign.
            </p>
          )}

          {/* Two modes, sized evenly so neither reads as the exceptional one. */}
          <div className="mt-2.5 grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-input border border-hairline">
            <ModeButton active={mode === 'auto'} disabled={disabled} onClick={chooseAuto}>
              Auto
            </ModeButton>
            <ModeButton active={mode === 'custom'} disabled={disabled} onClick={chooseCustom}>
              Custom
            </ModeButton>
          </div>

          {mode === 'auto' ? (
            <p className="mt-2.5 text-[11px] text-ink-muted leading-relaxed">
              Using App Kit&apos;s default{' '}
              <span className="text-ink-secondary font-semibold tabular-nums">
                {bpsToPercentText(DEFAULT_SLIPPAGE_BPS)}%
              </span>
              . Wide enough to keep swaps from failing on the thin pools this app routes through.
            </p>
          ) : (
            <>
              <label
                htmlFor={inputId}
                className={`mt-2.5 flex items-center gap-1 pl-3 pr-2.5 py-2 rounded-xl border transition-colors duration-200 ${
                  customInvalid
                    ? 'border-amber-500/40 bg-amber-500/[0.07]'
                    : 'border-arc-500/40 bg-arc-500/[0.08]'
                }`}
              >
                <input
                  ref={inputRef}
                  id={inputId}
                  value={customText}
                  onChange={(e) => {
                    // Digits and a single dot only: anything else cannot be a
                    // percentage, and stripping it keeps the field honest rather
                    // than accepting text that is silently ignored.
                    const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                    const parts = cleaned.split('.');
                    commitCustom(
                      parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned
                    );
                  }}
                  disabled={disabled}
                  inputMode="decimal"
                  placeholder={bpsToPercentText(DEFAULT_SLIPPAGE_BPS)}
                  aria-label="Custom slippage percentage"
                  aria-invalid={customInvalid}
                  className="flex-1 min-w-0 bg-transparent text-sm font-semibold tabular-nums outline-none
                    placeholder:text-ink-muted placeholder:font-normal disabled:cursor-not-allowed"
                />
                <span className="text-sm text-ink-muted">%</span>
              </label>

              {/*
               * One message at a time, ordered by how much it costs to ignore:
               * an unusable entry, then a tolerance that loses money, then one
               * that will not execute.
               */}
              {customInvalid ? (
                <p className="mt-2 text-[11px] text-warning/90 leading-relaxed">
                  Enter between {bpsToPercentText(MIN_SLIPPAGE_BPS)}% and{' '}
                  {bpsToPercentText(MAX_SLIPPAGE_BPS)}%. Still quoting at {bpsToPercentText(bps)}%.
                </p>
              ) : customEmpty ? (
                <p className="mt-2 text-[11px] text-ink-muted leading-relaxed">
                  Quoting at {bpsToPercentText(bps)}% until you enter a value.
                </p>
              ) : isRiskyBps(bps) ? (
                <p className="mt-2 text-[11px] text-warning/90 leading-relaxed">
                  At {bpsToPercentText(bps)}% the route may return noticeably less than quoted.
                </p>
              ) : isFragileBps(bps) ? (
                <p className="mt-2 text-[11px] text-warning/90 leading-relaxed">
                  {bpsToPercentText(bps)}% is tight enough that the swap may fail if the price
                  moves before it settles.
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-ink-muted leading-relaxed">
                  Applied to the quote and to the signed transaction.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ease-premium
        disabled:opacity-40 disabled:cursor-not-allowed ${
          active
            ? 'bg-surface-card text-ink-primary shadow-card'
            : 'text-ink-muted hover:text-ink-secondary'
        }`}
    >
      {children}
    </button>
  );
}
