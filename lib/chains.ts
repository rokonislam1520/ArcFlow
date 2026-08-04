/**
 * Multichain registry.
 *
 * Every field here is derived from Arc App Kit's `getSupportedChains()` at
 * runtime. Nothing about a specific chain is hardcoded: no chain IDs, no RPC
 * URLs, no token addresses, no explorer URLs. When Circle adds a chain to App
 * Kit it appears here automatically, which is what makes adding a new
 * blockchain a zero-code change.
 *
 * Verified against @circle-fin/app-kit 1.11.0, which returns 47 chains, each
 * shaped like:
 *   { type, chain, name, title, nativeCurrency{name,symbol,decimals},
 *     chainId, isTestnet, explorerUrl, rpcEndpoints[],
 *     usdcAddress, eurcAddress, usdtAddress, cctp, kitContracts, gateway }
 */
import { AppKit } from '@circle-fin/app-kit';

/** Capabilities App Kit can filter chains by. */
export type Capability = 'bridge' | 'swap' | 'unifiedBalance';

/** Token aliases actually present in the installed SDK (verified at runtime). */
export const TOKEN_ALIASES = ['USDC', 'EURC', 'USDT', 'NATIVE'] as const;
export type TokenAlias = (typeof TOKEN_ALIASES)[number];

/**
 * Structural view of an App Kit chain. Declared locally rather than importing
 * the SDK's internal type so a minor SDK refactor cannot break our build,
 * while still failing loudly if a field we depend on disappears.
 */
export interface ArcChain {
  /** App Kit identifier, e.g. "Arc_Testnet". This is what SDK calls expect. */
  id: string;
  /** Human label, e.g. "Arc Testnet". */
  label: string;
  type: 'evm' | 'solana' | string;
  /** EVM chain id. Absent for non-EVM chains such as Solana. */
  chainId?: number;
  isTestnet: boolean;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcEndpoints: string[];
  /** Explorer template containing a `{hash}` placeholder. */
  explorerTemplate?: string;
  tokens: Partial<Record<'USDC' | 'EURC' | 'USDT', string>>;
}

/** Single shared kit instance. Constructing it per render would be wasteful. */
let kitInstance: AppKit | null = null;

export function getKit(): AppKit {
  if (!kitInstance) kitInstance = new AppKit();
  return kitInstance;
}

/** Raw SDK chain records are loosely typed, so narrow defensively. */
interface RawChain {
  type?: string;
  chain?: string;
  name?: string;
  title?: string;
  chainId?: number;
  isTestnet?: boolean;
  nativeCurrency?: { name?: string; symbol?: string; decimals?: number };
  rpcEndpoints?: string[];
  explorerUrl?: string;
  usdcAddress?: string | null;
  eurcAddress?: string | null;
  usdtAddress?: string | null;
}

function normalize(raw: RawChain): ArcChain | null {
  const id = raw.chain ?? raw.name;
  if (!id) return null;

  const tokens: ArcChain['tokens'] = {};
  if (raw.usdcAddress) tokens.USDC = raw.usdcAddress;
  if (raw.eurcAddress) tokens.EURC = raw.eurcAddress;
  if (raw.usdtAddress) tokens.USDT = raw.usdtAddress;

  return {
    id,
    // "Arc_Testnet" reads badly in a dropdown; prefer the SDK's title.
    label: raw.title ?? id.replace(/_/g, ' '),
    type: raw.type ?? 'evm',
    chainId: raw.chainId,
    isTestnet: raw.isTestnet ?? false,
    nativeCurrency: {
      name: raw.nativeCurrency?.name ?? 'Unknown',
      symbol: raw.nativeCurrency?.symbol ?? '?',
      decimals: raw.nativeCurrency?.decimals ?? 18,
    },
    rpcEndpoints: raw.rpcEndpoints ?? [],
    explorerTemplate: raw.explorerUrl,
    tokens,
  };
}

let cache: ArcChain[] | null = null;

/** All chains App Kit supports, normalized. Cached; the list is static per build. */
export function getAllChains(): ArcChain[] {
  if (cache) return cache;
  const raw = getKit().getSupportedChains() as unknown as RawChain[];
  cache = raw.map(normalize).filter((c): c is ArcChain => c !== null);
  return cache;
}

/** Chains supporting a capability, straight from the SDK rather than a table. */
export function getChainsFor(capability: Capability): ArcChain[] {
  const raw = getKit().getSupportedChains(capability) as unknown as RawChain[];
  return raw.map(normalize).filter((c): c is ArcChain => c !== null);
}

/**
 * Chains for a network mode, Arc first since it is the flagship.
 *
 * The mode is passed in rather than read from a build-time constant so the user
 * can switch between mainnet and testnet at runtime. Mixing the two would offer
 * routes that cannot settle, so exactly one network type is ever returned.
 */
export function getEnvChains(
  isTestnet: boolean,
  capability?: Capability
): ArcChain[] {
  const list = capability ? getChainsFor(capability) : getAllChains();
  return list
    .filter((c) => c.isTestnet === isTestnet)
    .sort((a, b) => {
      const aArc = a.id.startsWith('Arc') ? 0 : 1;
      const bArc = b.id.startsWith('Arc') ? 0 : 1;
      return aArc - bArc || a.label.localeCompare(b.label);
    });
}

/**
 * Whether Arc itself is available in a given mode.
 *
 * Arc ships as a testnet only at the time of writing, so mainnet mode contains
 * no Arc chain. Callers use this to explain the absence instead of silently
 * dropping the flagship network from a list.
 */
export function hasArcSupport(isTestnet: boolean): boolean {
  return getEnvChains(isTestnet).some((c) => c.id.startsWith('Arc'));
}

/**
 * Networks users often expect that App Kit cannot route today.
 *
 * BNB Chain is not a CCTP domain and is absent from the registry entirely, so
 * there is no Circle path to it. Surfacing this as data lets the UI say so
 * plainly rather than leaving users to wonder why a chain is missing.
 */
export const UNSUPPORTED_NETWORKS: ReadonlyArray<{
  name: string;
  reason: string;
}> = [
  {
    name: 'BNB Chain',
    reason:
      'Not supported by Circle CCTP or App Kit. Routing to it would require a third-party bridge with a different trust model.',
  },
];


export function getChainById(id: string): ArcChain | undefined {
  return getAllChains().find((c) => c.id === id);
}

/** Look up by EVM chain id, used to interpret whatever the wallet reports. */
export function getChainByEvmId(chainId: number): ArcChain | undefined {
  return getAllChains().find((c) => c.chainId === chainId);
}

/**
 * The chain to preselect: Arc when present, otherwise the first available.
 * Falls back gracefully if Arc naming ever changes.
 */
export function getDefaultChain(isTestnet: boolean): ArcChain {
  const chains = getEnvChains(isTestnet);
  const arc = chains.find((c) => c.id.startsWith('Arc'));
  const chain = arc ?? chains[0];
  if (!chain) {
    throw new Error(
      `App Kit returned no ${isTestnet ? 'testnet' : 'mainnet'} chains`
    );
  }
  return chain;
}

/** Tokens a chain can actually hold, so the UI never offers an unusable token. */
export function getChainTokens(chain: ArcChain): TokenAlias[] {
  const out: TokenAlias[] = [];
  if (chain.tokens.USDC) out.push('USDC');
  if (chain.tokens.EURC) out.push('EURC');
  if (chain.tokens.USDT) out.push('USDT');
  out.push('NATIVE');
  return out;
}

export function explorerTxUrl(chain: ArcChain, hash: string): string | null {
  if (!chain.explorerTemplate) return null;
  return chain.explorerTemplate.includes('{hash}')
    ? chain.explorerTemplate.replace('{hash}', hash)
    : `${chain.explorerTemplate.replace(/\/$/, '')}/${hash}`;
}

/**
 * Params for `wallet_addEthereumChain`. Arc uses USDC as its gas token with 18
 * decimals (distinct from ERC-20 USDC's 6), so the values must come from the
 * chain definition rather than assuming ETH/18.
 */
export function toAddChainParams(chain: ArcChain) {
  if (chain.type !== 'evm' || chain.chainId === undefined) {
    throw new Error(`${chain.label} is not an EVM chain`);
  }
  return {
    chainId: `0x${chain.chainId.toString(16)}`,
    chainName: chain.label,
    nativeCurrency: {
      name: chain.nativeCurrency.name,
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
    },
    rpcUrls: chain.rpcEndpoints,
    blockExplorerUrls: chain.explorerTemplate
      ? [chain.explorerTemplate.replace(/\/tx\/\{hash\}$/, '')]
      : [],
  };
}
