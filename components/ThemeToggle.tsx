'use client';
/**
 * Theme switcher — a two-position pill fixed to the bottom-left of the app.
 *
 * Both options are visible at once rather than one icon that swaps on click.
 * A single-icon toggle is permanently ambiguous: users cannot tell whether the
 * moon means "you are in dark mode" or "press for dark mode". Showing sun and
 * moon side by side with the active one filled makes the current state and the
 * available one readable without pressing anything.
 *
 * Bottom-left is chosen because it is the one corner nothing else occupies:
 * the sidebar's own footer sits above it, page content is centred, and the
 * notification bell and account menu are top-right.
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

export function ThemeToggle() {
  const { theme, setTheme, ready } = useTheme();

  const options: { value: Theme; label: string; Icon: typeof SunIcon }[] = [
    { value: 'light', label: 'Light', Icon: SunIcon },
    { value: 'dark', label: 'Dark', Icon: MoonIcon },
  ];

  return (
    <div
      // Above the sidebar's own stacking level (z-50), or the desktop rail would
      // cover it outright. The sidebar reserves padding in its footer for this,
      // so sitting on top of it hides nothing.
      //
      // The safe-area inset keeps it clear of the iOS home indicator.
      className="fixed left-4 z-[60] print:hidden"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div
        role="radiogroup"
        aria-label="Colour theme"
        className="flex items-center gap-0.5 p-1 rounded-full
                   bg-surface-card border border-hairline shadow-card
                   transition-colors duration-300 ease-premium"
      >
        {options.map(({ value, label, Icon }) => {
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
              className={`w-8 h-8 grid place-items-center rounded-full
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
    </div>
  );
}
