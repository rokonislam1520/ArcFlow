/** @type {import('tailwindcss').Config} */
/**
 * Design tokens for the ArcFlow theme — editorial / neo-brutalist fintech.
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
 * ## The redesign, and why it lives here rather than in the pages
 *
 * The visual language is sharp corners, 2px rules, hard un-blurred shadows, a
 * heavy grotesk display face and mono numerals. Almost all of that is expressed
 * as *token values*, which is what makes it a redesign of fifteen routes rather
 * than of one: no page names a colour, a radius or a shadow directly, so
 * retuning them here moves the whole app at once and cannot leave one screen on
 * the old look.
 *
 * The `borderRadius` block below is the clearest case. Every card, button and
 * input in the app already carries a `rounded-*` class, so instead of editing
 * hundreds of them, the scale itself is redefined: `rounded-2xl` now resolves to
 * 4px. `full` is deliberately left alone — avatars, status dots and pills are
 * meant to be circular, and flattening those would break meaning, not style.
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
          // The accent as *text*. Chartreuse is a fill colour: at 4px of text on
          // white it is illegible, so as type it resolves to deep ink in light
          // mode and to the bright ramp only in dark. Two tokens, because one
          // value genuinely cannot do both jobs.
          text: withAlpha('--accent-text'),
          contrast: withAlpha('--accent-contrast'),
        },
        success: withAlpha('--success'),
        warning: withAlpha('--warning'),
        danger: withAlpha('--danger'),

        /* ---- Literal palettes ---- */
        /*
         * Brand accent, retuned from purple to chartreuse.
         *
         * Purple is the default accent of nearly every crypto dashboard, which
         * is precisely why it had to go: the palette was the most generic thing
         * about the interface. Chartreuse is rare in finance, unmistakable at a
         * glance, and — unlike a neon cyan or magenta — still legible as a flat
         * fill under black text.
         *
         * The ramp keeps the `arc` name and its 50–950 shape so the couple of
         * dozen existing `bg-arc-500/15` and `border-arc-500/40` usages across
         * the app follow the new brand automatically instead of being stranded
         * as purple islands.
         */
        arc: {
          50: '#f8ffe5', 100: '#eeffbd', 200: '#e0ff8a', 300: '#d2ff4d',
          400: '#c3f720', 500: '#a8dc00', 600: '#8bb800', 700: '#6b8f00',
          800: '#4e6800', 900: '#333f00', 950: '#1a2100',
        },
        // Success. Deepened to a true forest green so it cannot be mistaken for
        // the chartreuse accent — "this worked" and "this is the action" must
        // never be the same colour.
        mint: {
          300: '#5cd48b', 400: '#2fbc68', 500: '#149a4f', 600: '#0d7a3e',
        },

        // Informational, for states that must not read as success or warning.
        azure: {
          300: '#93c5fd', 400: '#60a5fa', 500: '#2563eb', 600: '#1d4ed8',
        },
        // Kept under its existing name for the charts that reference it, but
        // retuned into the brand family so a graph cannot emit a stray purple
        // line that belongs to no other part of the app.
        iris: {
          300: '#d2ff4d', 400: '#c3f720', 500: '#a8dc00', 600: '#8bb800',
        },
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
         * `display` is the editorial voice: a heavy grotesk for headings and
         * figures, which is what carries the redesign's personality. `mono` is
         * for data — addresses, hashes, amounts, small caps labels — where
         * fixed-width digits stop numbers from jittering as they update. `sans`
         * stays Inter for body copy, because a display face set at 14px in a
         * paragraph is a stylistic flourish that costs the reader.
         */
        display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      /*
       * The radius scale, redefined rather than extended.
       *
       * These names already appear throughout the app, so overriding their
       * values is what turns every existing card and control sharp in one edit.
       * The steps are 0–6px: enough to soften a hairline join at large sizes,
       * never enough to read as a pill. `full` is intentionally absent so it
       * keeps Tailwind's 9999px and circular things stay circular.
       */
      borderRadius: {
        none: '0px',
        sm: '0px',
        DEFAULT: '2px',
        md: '2px',
        lg: '3px',
        xl: '3px',
        '2xl': '4px',
        '3xl': '5px',
        '4xl': '6px',
        '5xl': '6px',
      },
      borderWidth: {
        // The structural rule weight of this design. Named so a card can ask
        // for `border-hard` instead of restating 2px in fifty places.
        hard: '2px',
      },
      boxShadow: {
        /*
         * Hard offset shadows: a solid block of ink at a fixed offset, with no
         * blur at all. A blurred shadow simulates a soft light source, which is
         * the language of the interface this replaces; an un-blurred one reads
         * as printed registration, and is the single most recognisable trait of
         * the new look.
         *
         * They stay delegated to theme variables because the trick only works
         * with a colour that contrasts with the page — near-black on paper, and
         * a lifted charcoal in dark mode, where solid black would vanish.
         */
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-lift)',
        float: 'var(--shadow-float)',
        hard: 'var(--shadow-hard)',
        'hard-sm': 'var(--shadow-hard-sm)',
        'hard-accent': 'var(--shadow-hard-accent)',
        // Accent ring for a focused or selected control. Square, matching the
        // geometry of everything it can land on.
        'glow-arc': '0 0 0 3px rgb(var(--accent) / 0.35)',
        'glow-iris': '0 0 0 3px rgb(var(--accent) / 0.35)',
      },
      transitionTimingFunction: {
        // A single easing for the whole app; mixed curves are what make an
        // interface feel assembled from parts. Snappier than the previous
        // curve, to match a design whose edges are hard.
        premium: 'cubic-bezier(0.2, 0.9, 0.25, 1)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.5s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        // Popovers now arrive by a short travel rather than a scale: a hard-edged
        // panel that grows from 97% reads as a rubbery zoom, where a 4px slide
        // reads as a card being placed.
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
