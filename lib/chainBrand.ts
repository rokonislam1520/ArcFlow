/**
 * Chain naming and brand-mark resolution for the token selector.
 *
 * Two jobs, both about showing the truth plainly:
 *
 *  1. `chainDisplayName` drops the "Mainnet" suffix App Kit puts in its titles.
 *     "Ethereum Mainnet" is just "Ethereum" to anyone reading a token list; the
 *     word only carries information when it distinguishes a test network, so
 *     "Base Sepolia Testnet" keeps its qualifier.
 *
 *  2. `chainBrandId` maps a chain onto the real published brand mark shipped by
 *     @web3icons/react. Every id below was checked against that package's
 *     registry — none is invented. A chain with no published mark resolves to
 *     `null` so the caller can show an honest lettermark instead of dressing up
 *     a generic circle as a logo.
 *
 * Testnets resolve to their mainnet's mark on purpose: Base Sepolia is Base's
 * network, so Base's logo is the accurate mark for it, not a stand-in.
 */
import { type ArcChain } from './chains';

/**
 * Environment qualifiers App Kit appends to a chain id.
 *
 * Stripped iteratively because some ids carry two ("Polygon_Amoy_Testnet"),
 * and one pass would leave "polygon_amoy" unmatched.
 */
const ENV_SUFFIX = /_(sepolia|testnet|devnet|fuji|amoy|alfajores|apothem|westmint|mordor)$/;

/** The chain family behind an id: `Polygon_Amoy_Testnet` -> `polygon`. */
export function chainFamily(chain: ArcChain): string {
  let id = chain.id.toLowerCase();
  let previous: string;
  do {
    previous = id;
    id = id.replace(ENV_SUFFIX, '');
  } while (id !== previous);
  return id;
}

/**
 * Family -> @web3icons network id.
 *
 * Only ids confirmed present in the installed icon set appear here. Where the
 * package names a network differently from App Kit, the package's name wins,
 * since it is the key its own lookup uses.
 */
const BRAND_BY_FAMILY: Readonly<Record<string, string>> = {
  // Confirmed to be Circle's Arc, not a same-named chain: the icon set records
  // chainId 5042002 and native coin USDC, matching App Kit's Arc_Testnet exactly.
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

/**
 * The published brand mark for a chain, or `null` when the icon set has none.
 *
 * Morph, Pharos and Edge currently resolve to `null` — the icon set publishes
 * nothing for them, and inventing a logo would misrepresent a brand. They fall
 * back to an initials disc, which reads as a placeholder rather than a mark.
 *
 * `scripts/check-brands.mjs` re-derives this list from the installed SDK, so a
 * chain added by Circle shows up as a known gap instead of a silent blank.
 */
export function chainBrandId(chain: ArcChain): string | null {
  return BRAND_BY_FAMILY[chainFamily(chain)] ?? null;
}

/**
 * A chain's name without the redundant "Mainnet".
 *
 * Only a trailing occurrence is removed, so a chain that genuinely carries the
 * word inside its name keeps it.
 */
export function chainDisplayName(chain: ArcChain): string {
  return chain.label.replace(/\s*\bmainnet\b\s*$/i, '').trim() || chain.label;
}

/** Initials for a chain with no published mark. Never dressed up as a logo. */
export function chainInitials(chain: ArcChain): string {
  const words = chainDisplayName(chain)
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
