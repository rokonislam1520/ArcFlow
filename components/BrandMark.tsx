'use client';
/**
 * Brand marks for chains and tokens.
 *
 * These are the real published logos from @web3icons/react, compiled into our
 * own bundle. Nothing is hotlinked from a third-party CDN that could
 * rate-limit, change, or vanish, and nothing is drawn by hand to imitate a
 * brand.
 *
 * Each mark is imported by name rather than resolved through the package's
 * `/dynamic` entry. The dynamic entry ships an import map covering all ~1,800
 * tokens and ~250 networks in the catalogue, which cost ~130 kB on the swap
 * route for the two dozen marks we actually use. Naming them lets the bundler
 * drop the rest, and makes a missing mark a build error instead of a blank
 * circle in production.
 *
 * Where a brand genuinely has no published mark — Morph, Pharos, Sonic's S — we
 * draw a lettermark in the chain's accent colour. Inventing a logo would imply
 * an identity that does not exist, and people read a logo as a mark of
 * authenticity.
 */
import {
  NetworkArbitrumOne,
  NetworkArc,
  NetworkAvalanche,
  NetworkBase,
  NetworkCelo,
  NetworkCodex,
  NetworkCronos,
  NetworkEthereum,
  NetworkHyperEvm,
  NetworkInjective,
  NetworkInk,
  NetworkLinea,
  NetworkMonad,
  NetworkOptimism,
  NetworkPlume,
  NetworkPolygon,
  NetworkSeiNetwork,
  NetworkSolana,
  NetworkSonic,
  NetworkUnichain,
  NetworkWorld,
  NetworkXdc,
  NetworkZksync,
  TokenAVAX,
  TokenCELO,
  TokenCRO,
  TokenETH,
  TokenEURC,
  TokenHYPE,
  TokenINJ,
  TokenMON,
  TokenPLUME,
  TokenPOL,
  TokenSEI,
  TokenSOL,
  TokenUSDC,
  TokenUSDT,
  TokenXDC,
} from '@web3icons/react';
import { type ArcChain } from '@/lib/chains';
import { chainBrandId, chainInitials } from '@/lib/chainBrand';
import { type SwapToken, chainAccent, tokenAccent } from '@/lib/swapTokens';

/**
 * Every mark in the package shares one component signature, so it is derived
 * from a real one rather than restated. Restating it drifts: the package's
 * `size` accepts a string as well as a number, and a hand-written `number`
 * silently fails to match.
 */
type Mark = typeof NetworkBase;

/** Keyed by the same ids `chainBrandId` returns. */
const NETWORK_MARKS: Readonly<Record<string, Mark>> = {
  arc: NetworkArc,
  ethereum: NetworkEthereum,
  base: NetworkBase,
  polygon: NetworkPolygon,
  solana: NetworkSolana,
  'arbitrum-one': NetworkArbitrumOne,
  optimism: NetworkOptimism,
  avalanche: NetworkAvalanche,
  linea: NetworkLinea,
  ink: NetworkInk,
  world: NetworkWorld,
  unichain: NetworkUnichain,
  plume: NetworkPlume,
  'sei-network': NetworkSeiNetwork,
  sonic: NetworkSonic,
  xdc: NetworkXdc,
  'hyper-evm': NetworkHyperEvm,
  monad: NetworkMonad,
  celo: NetworkCelo,
  cronos: NetworkCronos,
  codex: NetworkCodex,
  injective: NetworkInjective,
  zksync: NetworkZksync,
};

/**
 * Keyed by ticker.
 *
 * Sonic's S and Codex's native asset are absent because the catalogue
 * publishes no mark for them; they fall through to a lettermark. Arc's native
 * asset is USDC, so it needs no separate entry.
 */
const TOKEN_MARKS: Readonly<Record<string, Mark>> = {
  USDC: TokenUSDC,
  USDT: TokenUSDT,
  EURC: TokenEURC,
  ETH: TokenETH,
  POL: TokenPOL,
  AVAX: TokenAVAX,
  SOL: TokenSOL,
  XDC: TokenXDC,
  SEI: TokenSEI,
  HYPE: TokenHYPE,
  MON: TokenMON,
  PLUME: TokenPLUME,
  CELO: TokenCELO,
  CRO: TokenCRO,
  INJ: TokenINJ,
};

/** A circular lettermark, used only where no published logo exists. */
function LetterMark({
  text,
  color,
  size,
  className = '',
}: {
  text: string;
  color: string;
  size: number;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full flex items-center justify-center font-bold text-ink-primary shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: Math.max(8, Math.round(size * 0.34)),
      }}
      aria-hidden
    >
      {text}
    </span>
  );
}

/** A chain's logo at an exact pixel size. */
export function ChainMark({
  chain,
  size = 24,
  className = '',
}: {
  chain: ArcChain;
  size?: number;
  className?: string;
}) {
  const brand = chainBrandId(chain);
  const Mark = brand ? NETWORK_MARKS[brand] : undefined;

  if (!Mark) {
    return (
      <LetterMark
        text={chainInitials(chain)}
        color={chainAccent(chain)}
        size={size}
        className={className}
      />
    );
  }

  return (
    <Mark size={size} variant="background" className={`rounded-full shrink-0 ${className}`} />
  );
}

/**
 * A token's logo with its chain badged in the corner.
 *
 * The badge carries real information: the same USDC ticker exists on a dozen
 * chains, and the chain decides which one you are actually trading.
 */
export function TokenMark({
  token,
  size = 40,
  badge = true,
}: {
  token: SwapToken;
  size?: number;
  badge?: boolean;
}) {
  /*
   * Brand logos are matched by symbol, so they are only safe for tokens the
   * registry vouched for. A contract resolved from a pasted address can call
   * itself whatever it likes — "USDC" included — and lending it Circle's mark
   * would turn this component into the most convincing part of an impersonation.
   * Unverified tokens therefore always get the neutral letter mark.
   */
  const Mark = token.unverified ? undefined : TOKEN_MARKS[token.symbol.toUpperCase()];
  const badgeSize = Math.round(size * 0.42);


  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {Mark ? (
        <Mark size={size} variant="background" className="rounded-full" />
      ) : (
        <LetterMark
          text={token.symbol.slice(0, 4)}
          color={tokenAccent(token)}
          size={size}
        />
      )}
      {badge && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-slate-900 flex overflow-hidden"
          title={token.chain.label}
        >
          <ChainMark chain={token.chain} size={badgeSize} />
        </span>
      )}
    </span>
  );
}
