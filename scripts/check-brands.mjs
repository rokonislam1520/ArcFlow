/**
 * Coverage check for chain brand marks.
 *
 * Chains come from App Kit at runtime, so a hand-maintained icon map can fall
 * silently out of date the moment Circle adds a network. This walks every
 * chain the installed SDK actually reports, applies the same family/brand
 * resolution the UI uses, and confirms the resolved id exists in the installed
 * icon set — so "no logo" is always a known gap, never a surprise.
 *
 *   node scripts/check-brands.mjs
 */
import { AppKit } from '@circle-fin/app-kit';
import { networks } from '@web3icons/common';

const ENV_SUFFIX =
  /_(sepolia|testnet|devnet|fuji|amoy|alfajores|apothem|westmint|mordor)$/;

const BRAND_BY_FAMILY = {
  arc: 'arc',
  ethereum: 'ethereum',
  base: 'base',
  polygon: 'polygon',
  solana: 'solana',
  arbitrum: 'arbitrum-one',
  optimism: 'optimism',
  avalanche: 'avalanche',
  linea: 'linea',
  ink: 'ink',
  world_chain: 'world',
  unichain: 'unichain',
  plume: 'plume',
  sei: 'sei-network',
  sonic: 'sonic',
  xdc: 'xdc',
  hyperevm: 'hyper-evm',
  monad: 'monad',
  celo: 'celo',
  cronos: 'cronos',
  codex: 'codex',
  injective: 'injective',
  zksync_era: 'zksync',
};

function family(id) {
  let out = id.toLowerCase();
  let prev;
  do {
    prev = out;
    out = out.replace(ENV_SUFFIX, '');
  } while (out !== prev);
  return out;
}

const iconIds = new Set(networks.map((n) => n.id));
const chains = new AppKit().getSupportedChains();

const missing = [];
const wrong = [];
const seen = new Map();

for (const c of chains) {
  const id = c.chain ?? c.name;
  const fam = family(id);
  const brand = BRAND_BY_FAMILY[fam];

  if (!brand) {
    missing.push(`${id}  (family: ${fam})`);
  } else if (!iconIds.has(brand)) {
    wrong.push(`${id} -> "${brand}" is not in the icon set`);
  }
  seen.set(fam, (seen.get(fam) ?? 0) + 1);
}

console.log(`Chains reported by App Kit: ${chains.length}`);
console.log(`Distinct families:          ${seen.size}`);
console.log(`Mapped to a real mark:      ${seen.size - new Set(missing.map((m) => m.split('family: ')[1])).size}`);

if (wrong.length) {
  console.log('\nBROKEN — mapped to an id the icon set does not have:');
  for (const w of wrong) console.log('  ' + w);
} else {
  console.log('\nNo broken mappings: every mapped id exists in the icon set.');
}

if (missing.length) {
  console.log('\nNo published mark (falls back to a lettermark):');
  for (const m of missing) console.log('  ' + m);
}

process.exit(wrong.length ? 1 : 0);
