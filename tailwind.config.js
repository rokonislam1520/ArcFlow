/** @type {import('tailwindcss').Config} */
/**
 * Design tokens for the ArcFlow theme — calm, dark-first fintech.
 *
 * There are two families here, and the difference matters:
 *
 *  - **Semantic tokens** (`surface-*`, `ink-*`, `hairline`, `accent`) resolve to
 *    CSS variables defined in globals.css, which hold different values per
 *    theme. A component written with `bg-surface-card text-ink-primary` is
 *    correct in both light and dark without a single `dark:` variant, because
 *    the variable changes underneath it rather than the class.
 *
 *  - **Literal palettes** (`arc`, `mint`, `azure`, `iris`) are fixed colours
 *    that mean the same thing in either theme — brand accent, success, info.
 *
 * Prefer the semantic tokens for anything structural: surfaces, text, borders.
 * Reach for a literal only when the colour *is* the message, as with a success
 * green. A hard-coded `slate-400` or `white/10` is what makes a component
 * dark-only, and is the thing this file exists to avoid.
 *
 * The `<alpha-value>` placeholder is what lets `bg-accent/12` work: Tailwind
 * substitutes the opacity into the channel list at build time.
 *
 * ## Why the look lives here rather than in the pages
 *
 * The visual language is a violet accent on near-black, generous rounding, thin
 * hairline borders and soft shadows. Almost all of it is expressed as *token
 * values*, which is what makes a retheme reach fifteen routes rather than one:
 * no page names a colour, a radius or a shadow directly, so retuning them here
 * moves the whole app at once and cannot leave one screen on the old look.
 *
 * That property is what let an earlier sharp-edged, hard-shadowed revision be
 * reverted by editing this file and globals.css alone. It is worth preserving:
 * when a page needs a colour or a radius, give it a token, not a hex.
 */

const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

module.exports = {
  content: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}', './app/**/*.{js,ts,jsx,tsx}'],
  // The theme is chosen by the user and stored, so it is driven by an attribute
  // we control rather than by the OS media query. `dark:` variants therefore
  // follow the same switch as everything else; without this they would track
  // the system setting and contradict the toggle.
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        /* ---- Semantic: these flip with the theme ---- */
        surface: {
          page: withAlpha('--surface-page'),
          card: withAlpha('--surface-card'),
          raised: withAlpha('--surface-raised'),
          input: withAlpha('--surface-input'),
          // Neutral overlay for hover states — white in dark, near-black in
          // light — so `hover:bg-surface-hover/[0.06]` reads correctly in both.
          hover: withAlpha('--surface-hover'),
        },
        hairline: {
          DEFAULT: withAlpha('--border'),
          strong: withAlpha('--border-strong'),
        },
        ink: {
          primary: withAlpha('--text-primary'),
          secondary: withAlpha('--text-secondary'),
          muted: withAlpha('--text-muted'),
        },
        accent: {
          DEFAULT: withAlpha('--accent'),
          hover: withAlpha('--accent-hover'),
          // The accent as *text*, kept separate from the accent as a *fill*.
          // A tone that works as a filled button rarely also clears contrast as
          // small type on the page, so this resolves darker in light mode and
          // lighter in dark. Two tokens, because one value cannot do both jobs.
          text: withAlpha('--accent-text'),
          // Foreground for content sitting *on* an accent fill.
          contrast: withAlpha('--accent-contrast'),
        },
        success: withAlpha('--success'),
        warning: withAlpha('--warning'),
        danger: withAlpha('--danger'),

        /* ---- Literal palettes ---- */
        /*
         * Brand accent: violet.
         *
         * The ramp keeps the `arc` name and its 50–950 shape so the couple of
         * dozen existing `bg-arc-500/15` and `border-arc-500/40` usages across
         * the app follow the brand automatically instead of being stranded on a
         * previous hue. 500 matches `--accent` (#7C3AED) so a literal and a
         * token never disagree by a shade.
         */
        arc: {
          50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd',
          400: '#a78bfa', 500: '#7c3aed', 600: '#6d28d9', 700: '#5b21b6',
          800: '#4c1d95', 900: '#3b1585', 950: '#250d54',
        },
        // Success. Kept a clear green: with a violet accent there is no risk of
        // the two being confused, so this can be the conventional colour.
        mint: {
          300: '#5cd48b', 400: '#2fbc68', 500: '#149a4f', 600: '#0d7a3e',
        },
        // Informational, for states that must not read as success or warning.
        azure: {
          300: '#93c5fd', 400: '#60a5fa', 500: '#2563eb', 600: '#1d4ed8',
        },
        // Kept under its existing name for the charts that reference it, and
        // aligned with the brand family so a graph cannot emit a stray hue that
        // belongs to no other part of the app.
        iris: {
          300: '#c4b5fd', 400: '#a78bfa', 500: '#7c3aed', 600: '#6d28d9',
        },
        // Extra steps between Tailwind's slate stops, for the dark surfaces.
        slate: {
          750: '#1e293b',
          850: '#101827',
          975: '#050816',
        },
      },
      fontFamily: {
        /*
         * Three faces, each with a job.
         *
         * `display` is a grotesk for headings and large figures. `mono` is for
         * data — addresses, hashes, amounts, small-caps labels — where
         * fixed-width digits stop numbers jittering as they update. `sans`
         * stays Inter for body copy, because a display face set at 14px in a
         * paragraph is a stylistic flourish that costs the reader.
         */
        display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      /*
       * Radii: Tailwind's own scale, deliberately *not* overridden.
       *
       * Every card, button and input in the app already carries a `rounded-*`
       * class, so this scale is the app's cornering. It was once overridden down
       * to 0–6px to force sharp edges everywhere; that is why only the two extra
       * steps below are declared now — the defaults are what we want, and
       * restating them would re-create the same trap.
       *
       * These two are kept because a few components ask for them and would
       * otherwise silently fall back to no radius at all.
       */
      borderRadius: {
        '4xl': '20px',
        '5xl': '24px',
      },
      borderWidth: {
        // Retained because components still reference `border-hard`, but it is
        // no longer a heavy rule: structure comes from surface steps and soft
        // shadows, and a 2px outline around a 16px-radius card reads as a
        // sticker. Left as an alias rather than removed, so the class keeps
        // resolving wherever it survives.
        hard: '1px',
      },
      boxShadow: {
        /*
         * Elevation, delegated to theme variables — the shadow that reads as
         * depth on paper is not the one that reads as depth on near-black, so
         * the actual values live per-theme in globals.css.
         *
         * `hard*` are the leftovers of the sharp revision, kept as aliases so
         * components referencing them still resolve; the variables they point at
         * are now soft. Prefer `card` / `card-hover` / `float` in new code.
         */
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-lift)',
        float: 'var(--shadow-float)',
        hard: 'var(--shadow-hard)',
        'hard-sm': 'var(--shadow-hard-sm)',
        'hard-accent': 'var(--shadow-hard-accent)',
        // Accent ring for a focused or selected control.
        'glow-arc': '0 0 0 3px rgb(var(--accent) / 0.35)',
        'glow-iris': '0 0 0 3px rgb(var(--accent) / 0.35)',
      },
      transitionTimingFunction: {
        // A single easing for the whole app; mixed curves are what make an
        // interface feel assembled from parts.
        premium: 'cubic-bezier(0.2, 0.9, 0.25, 1)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.5s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        // Popovers arrive by a short travel rather than a scale: a panel that
        // grows from 97% reads as a rubbery zoom, where a 4px slide reads as a
        // card being placed. The name is kept for the call sites.
        'scale-in': 'popIn 0.16s cubic-bezier(0.2, 0.9, 0.25, 1)',
        'marquee': 'marquee 40s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        popIn: {
          '0%': { transform: 'translateY(-4px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(ellipse at center, var(--tw-gradient-stops))',
        'shimmer-gradient': 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
      },
    },
  },
  plugins: [],
};
