'use client';
/**
 * Shared dashboard building blocks.
 *
 * These exist so every panel states its own provenance and failure mode the
 * same way. Two rules run through all of them:
 *
 *  - "no data" and "failed to load" are never rendered identically. A user who
 *    cannot tell an empty wallet from a broken RPC has been misinformed.
 *  - a value that could not be priced shows as unavailable, never as 0. Zero is
 *    a fact about money; it must not be used to mean "we don't know".
 */
import type { ReactNode } from 'react';

/** Panel shell with a title, optional action, and consistent spacing. */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass p-5 sm:p-6 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** Neutral loading placeholder that keeps layout height stable. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        // A sweep rather than a fade: a moving highlight reads as "loading",
        // where a pulsing block can just look like part of the design.
        <div key={i} className="h-14 rounded-xl skeleton" />
      ))}
    </div>
  );
}

/**
 * Empty state. Distinct from `ErrorState` on purpose — this means "we looked
 * and there is nothing", which is a legitimate answer.
 */
export function EmptyState({ message, hint }: { message: string; hint?: ReactNode }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-slate-400">{message}</p>
      {hint && <p className="text-xs text-slate-500 mt-1.5">{hint}</p>}
    </div>
  );
}

/** Failure state. Says what broke and offers a retry rather than showing zeros. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="py-6 px-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] text-center">
      <p className="text-sm text-red-300">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** Small labelled figure, used across the summary strip. */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'accent' | 'muted';
}) {
  const valueTone =
    tone === 'accent'
      ? 'text-gradient'
      : tone === 'muted'
        ? 'text-slate-300'
        : 'text-white';
  return (
    // Lifts on hover: a stat is a headline figure, so it is one of the few
    // things on a page that earns the emphasis.
    <div className="glass card-float p-5">
      <div className="text-[11px] uppercase tracking-[0.08em] font-medium text-slate-400 mb-1.5">
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums tracking-tight ${valueTone}`}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

/** Coloured status dot with an accessible label. */
export function StatusDot({
  ok,
  title,
}: {
  ok: boolean | null;
  title?: string;
}) {
  const color =
    ok === null ? 'bg-slate-500' : ok ? 'bg-mint-400' : 'bg-red-400';
  return (
    <span
      title={title}
      role="img"
      aria-label={ok === null ? 'unknown' : ok ? 'healthy' : 'unreachable'}
      className={`inline-block w-2 h-2 rounded-full ${color} ${ok ? 'animate-pulse' : ''}`}
    />
  );
}

/** Round token badge. Initials only — no bundled logos to go stale. */
export function TokenBadge({ symbol, size = 40 }: { symbol: string; size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      // Dark text on the bright accent, and a hairline ring so the badge keeps
      // its edge against both the card and the page background.
      className="rounded-full bg-gradient-to-br from-arc-400 to-azure-500 ring-1 ring-inset ring-white/20 text-[11px] font-bold text-slate-950 flex items-center justify-center shrink-0"
    >
      {symbol.slice(0, 4)}
    </div>
  );
}

/**
 * Renders a USD value, or an explicit "unavailable" when it could not be
 * priced. Never substitutes 0 for unknown.
 */
export function UsdValue({
  value,
  format,
  className = '',
}: {
  value: number | null;
  format: (n: number) => string;
  className?: string;
}) {
  if (value === null) {
    return (
      <span
        title="No price available for this token"
        className={`text-slate-500 ${className}`}
      >
        Unpriced
      </span>
    );
  }
  return <span className={`tabular-nums ${className}`}>{format(value)}</span>;
}

/** "Updated 12s ago" line, so a stale panel is visibly stale. */
export function UpdatedAt({ at, loading }: { at: number | null; loading?: boolean }) {
  if (loading) return <span className="text-xs text-slate-500">Refreshing…</span>;
  if (at === null) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  const text =
    seconds < 5
      ? 'just now'
      : seconds < 60
        ? `${seconds}s ago`
        : `${Math.floor(seconds / 60)}m ago`;
  return <span className="text-xs text-slate-500">Updated {text}</span>;
}

/** Flags that a total excludes chains that failed, so it reads as understated. */
export function PartialNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-lg px-3 py-2">
      <span aria-hidden>⚠</span>
      <span>{children}</span>
    </div>
  );
}
