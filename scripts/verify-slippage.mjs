/**
 * Assertions over the pure logic behind the swap controls.
 *
 * The interesting failure modes here are arithmetic, not visual: a percentage
 * that rounds the wrong way sends a tolerance the user did not pick, and a
 * fraction computed from a formatted balance silently trades the wrong amount.
 * Both are invisible in a screenshot, so they are checked here instead.
 *
 * Run with `node scripts/verify-slippage.mjs`. No test runner is configured in
 * this project, so this is deliberately dependency-free.
 */
import assert from 'node:assert/strict';
import { formatUnits, parseUnits } from 'viem';

/* ------------------------------------------------------------------ helpers */

// Mirrors lib/slippage.ts. Imported by hand because the app is TS-only and this
// script must run without a build step.
const MIN_BPS = 1;
const MAX_BPS = 5000;

function parsePercentToBps(input) {
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  const bps = Math.round(value * 100);
  if (bps < MIN_BPS || bps > MAX_BPS) return null;
  return bps;
}

function bpsToPercentText(bps) {
  return String(Number((bps / 100).toFixed(3)));
}

/** Mirrors the base-unit fraction maths in app/swap/page.tsx. */
function applyFraction(rawBalance, decimals, numerator, denominator, gasReserve = null) {
  let raw = (rawBalance * numerator) / denominator;
  if (numerator === denominator && gasReserve !== null) {
    raw = raw > gasReserve ? raw - gasReserve : 0n;
  }
  return formatUnits(raw, decimals);
}

let checks = 0;
const check = (label, fn) => {
  fn();
  checks += 1;
  console.log(`  ok  ${label}`);
};

/* ------------------------------------------------------- slippage parsing */

console.log('slippage parsing');

check('presets round-trip to their own text', () => {
  for (const [bps, text] of [
    [10, '0.1'],
    [50, '0.5'],
    [100, '1'],
    [300, '3'],
  ]) {
    assert.equal(bpsToPercentText(bps), text);
    assert.equal(parsePercentToBps(text), bps);
  }
});

check('percentages convert without drift', () => {
  assert.equal(parsePercentToBps('0.5'), 50);
  assert.equal(parsePercentToBps('1.25'), 125);
  // Rounds to nearest rather than truncating, so the tolerance is not biased
  // tighter than what was typed.
  assert.equal(parsePercentToBps('0.155'), 16);
  assert.equal(parsePercentToBps('0.154'), 15);
});

check('unusable input is rejected, not coerced', () => {
  for (const bad of ['', '   ', 'abc', '0', '-1', 'NaN', '1e', '.']) {
    assert.equal(parsePercentToBps(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

check('out-of-range input is rejected at the top', () => {
  // Above 50% is a typo, not a choice: a stray digit turning 5 into 50 would
  // otherwise authorise a route that returns almost nothing.
  assert.equal(parsePercentToBps('50'), 5000);
  assert.equal(parsePercentToBps('50.01'), null);
  assert.equal(parsePercentToBps('100'), null);
});

check('sub-basis-point input rounds up to the floor rather than vanishing', () => {
  // A percentage finer than one basis point cannot be represented in the unit
  // App Kit enforces. Rounding is what makes 0.009% land on the 1 bp floor —
  // the alternative, rejecting it, would read as "invalid" for a number that is
  // simply more precise than the protocol allows.
  assert.equal(parsePercentToBps('0.01'), 1);
  assert.equal(parsePercentToBps('0.009'), 1);
  // Genuinely below half a basis point rounds to zero, which is not executable
  // and so is refused.
  assert.equal(parsePercentToBps('0.004'), null);
  assert.equal(parsePercentToBps('0.001'), null);
});

/* ------------------------------------------------------- balance fractions */

console.log('balance fractions');

check('fractions are exact in base units', () => {
  const raw = parseUnits('1234.567891', 6); // a balance the UI would truncate
  assert.equal(applyFraction(raw, 6, 1n, 4n), '308.641972');
  assert.equal(applyFraction(raw, 6, 1n, 2n), '617.283945');
  assert.equal(applyFraction(raw, 6, 1n, 1n), '1234.567891');
});

check('MAX keeps the dust a formatted balance would drop', () => {
  const raw = parseUnits('1234.567891', 6);
  // The failure this guards: reading the display string instead of `raw`.
  const fromFormattedDisplay = '1234.5679';
  assert.notEqual(applyFraction(raw, 6, 1n, 1n), fromFormattedDisplay);
  assert.equal(parseUnits(applyFraction(raw, 6, 1n, 1n), 6), raw);
});

check('18-decimal balances survive the round trip', () => {
  const raw = parseUnits('3.141592653589793238', 18);
  assert.equal(parseUnits(applyFraction(raw, 18, 1n, 1n), 18), raw);
  assert.equal(applyFraction(raw, 18, 1n, 2n), '1.570796326794896619');
});

check('gas reserve is subtracted only from a full-balance selection', () => {
  const raw = parseUnits('2', 18);
  const gas = parseUnits('0.0015', 18);
  assert.equal(applyFraction(raw, 18, 1n, 1n, gas), '1.9985');
  // Half of the balance is not at risk of leaving nothing for gas, so it is
  // taken literally.
  assert.equal(applyFraction(raw, 18, 1n, 2n, gas), '1');
});

check('gas exceeding the balance yields zero, never a negative', () => {
  const raw = parseUnits('0.0001', 18);
  const gas = parseUnits('0.5', 18);
  assert.equal(applyFraction(raw, 18, 1n, 1n, gas), '0');
});

check('a zero balance stays zero', () => {
  assert.equal(applyFraction(0n, 6, 1n, 4n), '0');
  assert.equal(applyFraction(0n, 6, 1n, 1n, parseUnits('0.01', 6)), '0');
});

console.log(`\n${checks} checks passed`);
