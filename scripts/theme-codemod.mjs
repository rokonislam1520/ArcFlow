/**
 * One-off codemod: hard-coded dark-only Tailwind classes → semantic theme tokens.
 *
 * The app was written for a single dark theme, so surfaces and text were spelled
 * as literal greys (`text-slate-400`, `bg-white/5`). Those cannot follow a theme:
 * `text-slate-400` on a white card is unreadable. This rewrites them to the
 * semantic tokens defined in tailwind.config.js, which resolve per theme.
 *
 * Run once and reviewed by hand afterwards — a few mappings depend on what the
 * class sits on (white text on a purple button must stay white, while white text
 * on a card must become the theme's ink), and only a human can tell those apart.
 * Kept in the repo as the record of how the migration was done.
 *
 *   node scripts/theme-codemod.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Every route and component the theme toggle can reach — which is all of them,
 * since the toggle is global. Converting only the four headline pages would
 * leave the rest unreadable in light mode, and a theme that breaks the moment
 * you click a sidebar link is worse than no theme at all.
 */
const FILES = [
  // The four flows this change targets.
  'app/swap/page.tsx',
  'app/bridge/page.tsx',
  'app/send/page.tsx',
  'app/receive/page.tsx',
  // Shared components those flows render.
  'components/TokenSelector.tsx',
  'components/WalletGuard.tsx',
  'components/TxStatus.tsx',
  'components/OpStatus.tsx',
  'components/ConnectButton.tsx',
  'components/AccountMenu.tsx',
  'components/NotificationBell.tsx',
  'components/dashboard/Primitives.tsx',
  // The remaining routes, reachable from the same sidebar.
  'app/page.tsx',
  'app/dashboard/page.tsx',
  'app/portfolio/page.tsx',
  'app/history/page.tsx',
  'app/merchant/page.tsx',
  'app/assistant/page.tsx',
  'app/profile/page.tsx',
  'components/dashboard/Panels.tsx',
  'components/dashboard/Charts.tsx',
  'components/AvatarPicker.tsx',
  'components/ProfileOnboarding.tsx',
  'components/FeatureCard.tsx',
  'components/Navbar.tsx',
  'components/BrandMark.tsx',
];

/**
 * Ordered: the first pattern that matches wins, so longer and more specific
 * patterns are listed before the general ones they would otherwise shadow.
 *
 * Deliberately absent: `bg-black/25` and friends. Those are modal scrims, and a
 * dark scrim behind a dialog is correct in both themes — it is what separates
 * the dialog from the page, not a surface of its own.
 */
const RULES = [
  // --- Text -------------------------------------------------------------
  // Two greys, not five. The original ramp drew distinctions that were not
  // meaningful; collapsing to secondary/muted makes hierarchy consistent.
  [/\btext-slate-(300|400)\b/g, 'text-ink-secondary'],
  [/\btext-slate-(500|600|700)\b/g, 'text-ink-muted'],
  [/\bhover:text-slate-(200|300)\b/g, 'hover:text-ink-primary'],
  [/\bhover:text-white\b/g, 'hover:text-ink-primary'],
  [/\bgroup-hover:text-white\b/g, 'group-hover:text-ink-primary'],
  // Reviewed by hand afterwards: correct on a card, wrong on an accent fill.
  [/\btext-white\b/g, 'text-ink-primary'],
  // Ink *on* a bright fill — stays light-on-dark regardless of theme.
  [/\btext-slate-950\b/g, 'text-accent-contrast'],

  // --- Borders ----------------------------------------------------------
  // Every one of these was a hairline at a slightly different opacity, which
  // read as inconsistency rather than as intent.
  [/\bborder-white\/\[0\.\d+\]/g, 'border-hairline'],
  [/\bborder-white\/\d+\b/g, 'border-hairline'],
  [/\bborder-slate-(600|700|800|850|975)\b/g, 'border-hairline'],
  [/\bhover:border-white\/\d+\b/g, 'hover:border-hairline-strong'],

  // --- Surfaces ---------------------------------------------------------
  [/\bbg-slate-850\b/g, 'bg-surface-card'],
  [/\bbg-slate-800\b/g, 'bg-surface-raised'],
  [/\bbg-slate-500\b/g, 'bg-ink-muted'],
  // A white wash is invisible on a white card, so these become the neutral
  // overlay token, which inverts per theme.
  [/\bhover:bg-white\/\[0\.\d+\]/g, 'hover:bg-surface-hover/[0.06]'],
  [/\bhover:bg-white\/\d+\b/g, 'hover:bg-surface-hover/[0.06]'],
  [/\bgroup-hover:bg-white\/\d+\b/g, 'group-hover:bg-surface-hover/[0.06]'],
  [/\bbg-white\/\[0\.0[0-9]\]/g, 'bg-surface-input'],
  [/\bbg-white\/\[0\.1\]/g, 'bg-surface-input'],
  [/\bbg-white\/5\b/g, 'bg-surface-input'],
  [/\bbg-white\/10\b/g, 'bg-surface-input'],

  // --- Placeholders -----------------------------------------------------
  [/\bplaceholder:text-slate-\d+\b/g, 'placeholder:text-ink-muted'],

  // --- Status and accent text -------------------------------------------
  // The pale 200–400 tints were picked to glow against near-black; on a white
  // card they are barely visible (#c4b5fd on white is about 1.9:1). The
  // semantic tokens carry a deepened value for the light theme, so the meaning
  // survives the switch while the contrast does too.
  //
  // Only *text* is remapped. The matching `bg-*-500/10` and `border-*-500/25`
  // tints are already low-alpha washes that sit correctly on either surface.
  [/\btext-arc-(200|300|400)\b/g, 'text-accent-text'],
  [/\bgroup-hover:text-arc-(200|300|400)\b/g, 'group-hover:text-accent-text'],
  [/\btext-(mint|emerald)-(200|300|400)\b/g, 'text-success'],
  [/\btext-amber-(200|300|400)\b/g, 'text-warning'],
  [/\btext-(red|rose)-(200|300|400)\b/g, 'text-danger'],
  // No dedicated info token; the accent is the app's one non-status highlight.
  [/\btext-sky-(200|300|400)\b/g, 'text-accent-text'],
];


let total = 0;
for (const file of FILES) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  let fileCount = 0;

  for (const [pattern, replacement] of RULES) {
    after = after.replace(pattern, () => {
      fileCount += 1;
      return replacement;
    });
  }

  if (after !== before) {
    writeFileSync(file, after);
    total += fileCount;
    console.log(`${String(fileCount).padStart(3)}  ${file}`);
  }
}
console.log(`\n${total} replacements across ${FILES.length} files`);
