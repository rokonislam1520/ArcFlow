/** @type {import('tailwindcss').Config} */
/**
 * Design tokens for the ArcFlow theme.
 *
 * The palette is defined here rather than in component classes so a colour is
 * changed in one place. Every page already styles itself with `arc-*`, `mint-*`
 * and the shared classes in globals.css, which is why the visual refresh needed
 * no structural edits: retuning these scales moves the whole app at once.
 *
 * Only shades Tailwind does not already ship are added. Redefining an existing
 * shade (slate-900, slate-950) would silently change it everywhere it is used.
 */
module.exports = {
  content: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}', './app/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary accent, built around #14F1D9. The scale is a real ramp so
        // borders (600-800) and text (300-400) can be picked by weight instead
        // of being faked with opacity on a single hue.
        arc: {
          50: '#ecfffb', 100: '#cffef7', 200: '#9ffdef', 300: '#5ff9e5',
          400: '#2af3db', 500: '#14f1d9', 600: '#06c2b0', 700: '#0a9a8d',
          800: '#0d7a71', 900: '#10645e', 950: '#023d39',
        },
        // Success. Kept under the `mint` name it already has across the app so
        // the refresh does not rename anything.
        mint: {
          300: '#6ee7a8', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a',
        },
        // Secondary accent, used for the gradient pair and informational states.
        azure: {
          300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb',
        },
        // Highlight, for emphasis that must not read as success or warning.
        iris: {
          300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed',
        },
        slate: {
          750: '#1e293b',
          // The card surface from the palette. Named 850 because that is the
          // slot it occupies between Tailwind's 800 and 900.
          850: '#101827',
          // The app background base. Kept in step with `--bg` in globals.css,
          // which the background gradient is layered over.
          975: '#050816',
        },
      },
      borderRadius: {
        // Larger radii, applied through the shared card and control classes.
        '4xl': '1.75rem',
        '5xl': '2rem',
      },
      boxShadow: {
        // Layered rather than a single blur: a tight shadow for the edge and a
        // wide one for depth, which is what keeps a card from looking flat.
        card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -8px rgba(0,0,0,0.5)',
        'card-hover': '0 1px 2px rgba(0,0,0,0.4), 0 16px 40px -12px rgba(0,0,0,0.65)',
        float: '0 24px 64px -16px rgba(0,0,0,0.75)',
        'glow-arc': '0 0 0 1px rgba(20,241,217,0.18), 0 8px 32px -8px rgba(20,241,217,0.35)',
        'glow-iris': '0 0 0 1px rgba(139,92,246,0.2), 0 8px 32px -8px rgba(139,92,246,0.35)',
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
