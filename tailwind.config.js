/** @type {import('tailwindcss').Config} */
/**
 * Design tokens for the ArcFlow theme.
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
          // The accent as *text*. Lighter than the fill in dark mode, darker in
          // light: the same purple cannot be both a legible label and a button
          // background, so the two are separate tokens.
          text: withAlpha('--accent-text'),
          contrast: withAlpha('--accent-contrast'),
        },
        success: withAlpha('--success'),
        warning: withAlpha('--warning'),
        danger: withAlpha('--danger'),

        /* ---- Literal palettes ---- */
        // Brand accent. Purple is the product's action colour, so this ramp and
        // the `--accent` token above are the same hue at different weights;
        // borders (600–800) and text (300–400) can be picked by weight instead
        // of being faked with opacity on a single value.
        arc: {
          50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd',
          400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9',
          800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065',
        },
        // Success. Kept under the `mint` name it already has across the app so
        // the refresh does not rename anything.
        mint: {
          300: '#6ee7a8', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a',
        },
        // Informational, for states that must not read as success or warning.
        azure: {
          300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb',
        },
        iris: {
          300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed',
        },
        slate: {
          750: '#1e293b',
          850: '#101827',
          975: '#050816',
        },
      },
      borderRadius: {
        '4xl': '1.75rem',
        '5xl': '2rem',
      },
      boxShadow: {
        // Delegated to the theme variables so a card's elevation is soft grey on
        // a light page and near-black on a dark one. A single literal shadow
        // cannot do both: black under a white card reads as dirt.
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-lift)',
        float: 'var(--shadow-float)',
        // Accent ring for a focused or selected control.
        'glow-arc': '0 0 0 3px rgb(var(--accent) / 0.14)',
        'glow-iris': '0 0 0 3px rgb(var(--accent) / 0.14)',
      },
      transitionTimingFunction: {
        // A single easing for the whole app; mixed curves are what make an
        // interface feel assembled from parts.
        premium: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.5s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
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
        scaleIn: {
          '0%': { transform: 'scale(0.97)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
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
