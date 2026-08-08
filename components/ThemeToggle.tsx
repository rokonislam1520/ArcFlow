'use client';
/**
 * Theme switcher.
 *
 * Both options are visible at once rather than one icon that swaps on click.
 * A single-icon toggle is permanently ambiguous: users cannot tell whether the
 * moon means "you are in dark mode" or "press for dark mode". Showing sun and
 * moon side by side with the active one filled makes the current state and the
 * available one readable without pressing anything.
 *
 * Two exports, because the control has two homes and only the surrounding
 * chrome differs:
 *
 *   `ThemeControl` is the bare radio group. It draws no container of its own, so
 *   it can sit inside the sidebar's footer group and share that pill's border
 *   and shadow instead of nesting a second capsule inside the first.
 *
 *   `ThemeToggle` is the free-floating pill, for the cases with no sidebar
 *   footer to live in: the marketing landing page, and mobile, where the footer
 *   group is hidden because collapsing is a desktop-only idea.
 */
import { useTheme, type Theme } from '@/lib/theme';

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 2.2v1.6M10 16.2v1.6M17.8 10h-1.6M3.8 10H2.2M15.5 4.5l-1.1 1.1M5.6 14.4l-1.1 1.1M15.5 15.5l-1.1-1.1M5.6 5.6L4.5 4.5" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M16.5 11.8A6.8 6.8 0 018.2 3.5a6.8 6.8 0 108.3 8.3z" />
    </svg>
  );
}

const OPTIONS: { value: Theme; label: string; Icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
];

/**
 * The radio group alone — no border, no background, no positioning.
 *
 * `vertical` serves the collapsed sidebar rail, which is too narrow to lay the
 * two options out side by side.
 */
export function ThemeControl({ vertical = false }: { vertical?: boolean }) {
  const { theme, setTheme, ready } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`flex items-center gap-0.5 ${vertical ? 'flex-col' : ''}`}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        // Until the stored choice is known, neither option is marked active:
        // asserting one and correcting it a frame later is a visible flicker
        // and, worse, briefly tells the user the wrong thing.
        const active = ready && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setTheme(value)}
            className={`w-8 h-8 grid place-items-center rounded-full shrink-0
                        transition-all duration-200 ease-premium
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                        ${
                          active
                            ? 'bg-accent text-accent-contrast shadow-sm'
                            : 'text-ink-muted hover:text-ink-primary hover:bg-surface-hover/[0.06]'
                        }`}
          >
            <Icon className="w-[18px] h-[18px]" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * The floating pill, bottom-left.
 *
 * Callers scope it with `className`, because it must not render at the same time
 * as the sidebar footer group: two theme switchers in the same corner would sit
 * on top of each other.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  return (
    <div
      // Above the sidebar's stacking level (z-50), or the mobile drawer would
      // cover it. The safe-area inset clears the iOS home indicator.
      className={`fixed left-4 z-[60] print:hidden ${className}`}
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div
        className="flex items-center p-1 rounded-full
                   bg-surface-card border border-hairline shadow-card
                   transition-colors duration-300 ease-premium"
      >
        <ThemeControl />
      </div>
    </div>
  );
}
