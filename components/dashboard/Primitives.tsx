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
import { formatUSD } from '@/lib/portfolio';

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
    // One step down at both breakpoints. Every dashboard and portfolio panel
    // comes through here, so this is the single highest-leverage change in the
    // pass — and the reason none of those pages needed touching individually.
    <section className={`glass p-4 sm:p-5 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-ink-primary">{title}</h2>
          {subtitle && <p className="text-xs text-ink-secondary mt-0.5">{subtitle}</p>}
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
 * The accent icon container.
 *
 * One shape for every icon that sits on a tinted plate — quick actions, empty
 * states, panel affordances. Previously each caller re-declared its own size,
 * radius and tint, which is how a product ends up with four slightly different
 * purple squares on one screen. Consistency here is most of what makes the
 * pages feel like one product.
 */
export function IconTile({
  d,
  size = 'md',
  className = '',
}: {
  /** SVG path data, stroked. */
  d: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box = size === 'sm' ? 'w-8 h-8 rounded-lg' : size === 'lg' ? 'w-12 h-12 rounded-2xl' : 'w-10 h-10 rounded-xl';
  const glyph = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-[18px] h-[18px]';
  return (
    <span
      className={`${box} shrink-0 grid place-items-center
                  bg-accent/10 border border-accent/20 text-accent-text
                  transition-colors duration-200 ease-premium ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={glyph}
        aria-hidden="true"
      >
        <path d={d} />
      </svg>
    </span>
  );
}

/** Small caps section label. One weight and tracking for every one of them. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
      {children}
    </h2>
  );
}

/**
 * Empty state. Distinct from `ErrorState` on purpose — this means "we looked
 * and there is nothing", which is a legitimate answer.
 *
 * `icon` and `action` are optional so the small in-panel cases stay quiet while
 * a first-run panel can afford a plate and a way forward. A bare sentence in a
 * large card is what makes a page look unfinished rather than simply empty.
 */
export function EmptyState({
  message,
  hint,
  icon,
  action,
}: {
  message: string;
  hint?: ReactNode;
  /** SVG path data for an `IconTile`. */
  icon?: string;
  action?: ReactNode;
}) {
  return (
    // Still generous enough to read as a deliberate state rather than a failure
    // to load, which is the whole job of an empty state.
    <div className="py-6 px-4 flex flex-col items-center text-center">
      {icon && <IconTile d={icon} size="lg" className="mb-3.5" />}
      <p className="text-sm font-medium text-ink-primary">{message}</p>
      {hint && <p className="text-xs text-ink-muted mt-1.5 max-w-[34ch] leading-relaxed">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Failure state. Says what broke and offers a retry rather than showing zeros. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="py-5 px-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] text-center">
      <p className="text-sm text-danger">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-hairline bg-surface-input hover:bg-surface-hover/[0.06]"
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
        ? 'text-ink-secondary'
        : 'text-ink-primary';
  return (
    // Lifts on hover: a stat is a headline figure, so it is one of the few
    // things on a page that earns the emphasis.
    <div className="glass card-float p-4">
      <div className="text-[11px] uppercase tracking-[0.08em] font-medium text-ink-secondary mb-1.5">
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums tracking-tight ${valueTone}`}>{value}</div>
      {hint && <div className="text-xs text-ink-muted mt-1">{hint}</div>}
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
    ok === null ? 'bg-ink-muted' : ok ? 'bg-mint-400' : 'bg-red-400';
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
      // `accent-contrast` for the initials, plus a hairline ring so the badge
      // keeps its edge against both the card and the page background.
      className="rounded-full bg-accent border border-hairline text-[11px] font-bold text-accent-contrast flex items-center justify-center shrink-0"
    >

      {symbol.slice(0, 4)}
    </div>
  );
}

/**
 * Renders a USD value, or an explicit "unavailable" when it could not be
 * priced. Never substitutes 0 for unknown.
 *
 * The formatter used to arrive as a `format` prop, which the `use client`
 * boundary rejects: functions cannot cross it, so a component exported from an
 * entry file may not declare one. Every call site passed the same `formatUSD`
 * anyway, so the dependency is now imported directly rather than injected —
 * identical output, and one fewer way for two panels to format money
 * differently.
 */
export function UsdValue({
  value,
  className = '',
}: {
  value: number | null;
  className?: string;
}) {
  if (value === null) {
    return (
      <span
        title="No price available for this token"
        className={`text-ink-muted ${className}`}
      >
        Unpriced
      </span>
    );
  }
  return <span className={`tabular-nums ${className}`}>{formatUSD(value)}</span>;
}

/** "Updated 12s ago" line, so a stale panel is visibly stale. */
export function UpdatedAt({ at, loading }: { at: number | null; loading?: boolean }) {
  if (loading) return <span className="text-xs text-ink-muted">Refreshing…</span>;
  if (at === null) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  const text =
    seconds < 5
      ? 'just now'
      : seconds < 60
        ? `${seconds}s ago`
        : `${Math.floor(seconds / 60)}m ago`;
  return <span className="text-xs text-ink-muted">Updated {text}</span>;
}

/** Flags that a total excludes chains that failed, so it reads as understated. */
export function PartialNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs text-warning/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-lg px-3 py-2">
      <span aria-hidden>⚠</span>
      <span>{children}</span>
    </div>
  );
}
