'use client';
/**
 * Portfolio insights derived from real holdings.
 *
 * These are computed, not generated. Every insight below is a statement about
 * numbers already on screen — concentration, chain spread, gas reserves, peg
 * deviation — so each one can be checked by the user against their own
 * balances. Nothing is inferred about the market, and no comparison is made to
 * other wallets: the app has no visibility into anyone else's holdings, so a
 * claim like "you are outperforming 82% of similar wallets" would be fiction.
 *
 * When there is not enough data to say anything useful, that is reported as
 * such rather than padded out with filler.
 */
import type { ChainPortfolio, TokenTotal } from './portfolio';
import type { MarketRow } from './useMarket';

export type InsightTone = 'neutral' | 'positive' | 'warning';

export interface Insight {
  id: string;
  title: string;
  detail: string;
  tone: InsightTone;
}

/** Below this, a "gas balance" warning is more noise than signal. */
const DUST_USD = 0.01;

/** A single asset above this share is worth pointing out as concentration. */
const CONCENTRATION_PCT = 70;

/** Peg deviation beyond this is notable for a coin that should track $1. */
const DEPEG_PCT = 0.5;

export interface InsightInput {
  chains: ChainPortfolio[];
  tokens: TokenTotal[];
  totalUSD: number;
  market: MarketRow[];
  /** Null when the recorded series does not yet span 24h. */
  change24h: { absolute: number; percent: number } | null;
  loading: boolean;
}

/**
 * Build the insight list.
 *
 * Returns an empty array when the portfolio is empty or still loading; the UI
 * distinguishes those two cases and explains which applies.
 */
export function buildInsights({
  chains,
  tokens,
  totalUSD,
  market,
  change24h,
}: InsightInput): Insight[] {
  const out: Insight[] = [];
  if (tokens.length === 0) return out;

  // --- Concentration -------------------------------------------------------
  const priced = tokens.filter((t) => t.valueUSD !== null && t.valueUSD > 0);
  if (priced.length > 0 && totalUSD > DUST_USD) {
    const top = priced[0];
    const share = ((top.valueUSD ?? 0) / totalUSD) * 100;

    if (priced.length === 1) {
      out.push({
        id: 'single-asset',
        title: `Everything is in ${top.symbol}`,
        detail:
          `Your entire priced balance is ${top.symbol}. That is fine for a ` +
          `stablecoin float, but it means a single issuer or depeg event ` +
          `affects all of it.`,
        tone: 'neutral',
      });
    } else if (share >= CONCENTRATION_PCT) {
      out.push({
        id: 'concentration',
        title: `${top.symbol} is ${share.toFixed(0)}% of your portfolio`,
        detail:
          `${priced.length} assets are held, but ${top.symbol} dominates. ` +
          `Spreading across issuers reduces exposure to any one of them.`,
        tone: 'neutral',
      });
    } else {
      out.push({
        id: 'diversified',
        title: `Spread across ${priced.length} assets`,
        detail:
          `Largest position is ${top.symbol} at ${share.toFixed(0)}%. ` +
          `No single asset dominates the balance.`,
        tone: 'positive',
      });
    }
  }

  // --- Chain spread --------------------------------------------------------
  const funded = chains.filter((c) => c.holdings.length > 0);
  if (funded.length > 1) {
    const largest = [...funded].sort((a, b) => b.valueUSD - a.valueUSD)[0];
    const share = totalUSD > 0 ? (largest.valueUSD / totalUSD) * 100 : 0;
    out.push({
      id: 'chain-spread',
      title: `Funds on ${funded.length} chains`,
      detail:
        `${largest.chain.label} holds ${share.toFixed(0)}% of value. ` +
        `Consolidating with Bridge cuts the gas you need to keep in reserve.`,
      tone: 'neutral',
    });
  }

  // --- Gas reserves --------------------------------------------------------
  // A chain holding tokens but no gas cannot send them. This is the single
  // most actionable thing a balance read can reveal.
  const stranded = funded.filter((c) => {
    const hasTokens = c.holdings.some((h) => !h.isNative && h.raw > 0n);
    const hasGas = c.holdings.some((h) => h.isNative && h.raw > 0n);
    // Arc pays gas in USDC, so a missing native asset is not a problem there.
    const gasIsToken = c.chain.nativeCurrency.symbol === 'USDC';
    return hasTokens && !hasGas && !gasIsToken;
  });

  if (stranded.length > 0) {
    const names = stranded.map((c) => c.chain.label).join(', ');
    out.push({
      id: 'no-gas',
      title: stranded.length === 1 ? `No gas on ${names}` : `No gas on ${stranded.length} chains`,
      detail:
        `You hold tokens on ${names} but no ${stranded[0].chain.nativeCurrency.symbol} ` +
        `to pay fees, so those balances cannot be moved until you top up.`,
      tone: 'warning',
    });
  }

  // --- Peg health ----------------------------------------------------------
  const depegged = market.filter(
    (m) => m.pegDeviationPct !== null && Math.abs(m.pegDeviationPct) >= DEPEG_PCT
  );
  if (depegged.length > 0) {
    const worst = depegged.sort(
      (a, b) => Math.abs(b.pegDeviationPct ?? 0) - Math.abs(a.pegDeviationPct ?? 0)
    )[0];
    const dir = (worst.pegDeviationPct ?? 0) > 0 ? 'above' : 'below';
    out.push({
      id: 'depeg',
      title: `${worst.symbol} is ${Math.abs(worst.pegDeviationPct ?? 0).toFixed(2)}% ${dir} $1.00`,
      detail:
        `Quoted at $${worst.priceUSD.toFixed(4)} on ${worst.sourceChain}. ` +
        `Holdings are valued at this live price, not at parity.`,
      tone: 'warning',
    });
  }

  // --- Unpriced holdings ---------------------------------------------------
  const unpriced = tokens.filter((t) => t.valueUSD === null);
  if (unpriced.length > 0) {
    out.push({
      id: 'unpriced',
      title: `${unpriced.length} asset${unpriced.length > 1 ? 's' : ''} could not be priced`,
      detail:
        `${unpriced.map((t) => t.symbol).join(', ')} ${unpriced.length > 1 ? 'have' : 'has'} ` +
        `no quote from the pricing service, so ${unpriced.length > 1 ? 'they are' : 'it is'} ` +
        `held but excluded from the total. Your real value is higher than shown.`,
      tone: 'warning',
    });
  }

  // --- Observed movement ---------------------------------------------------
  if (change24h && Math.abs(change24h.percent) >= 0.01) {
    const rose = change24h.absolute > 0;
    out.push({
      id: 'movement',
      title: `${rose ? 'Up' : 'Down'} ${Math.abs(change24h.percent).toFixed(2)}% in 24h`,
      detail:
        `Measured against the value recorded on this device a day ago. ` +
        `Deposits and withdrawals move this number too, so it is not purely price action.`,
      tone: rose ? 'positive' : 'neutral',
    });
  }

  return out;
}

/**
 * Why the insight list is empty, phrased for the user.
 *
 * Kept next to the builder so the two cannot drift apart.
 */
export function emptyInsightReason(input: {
  loading: boolean;
  hasAddress: boolean;
  tokenCount: number;
}): string {
  if (!input.hasAddress) return 'Connect a wallet to see insights about your holdings.';
  if (input.loading) return 'Reading balances across chains…';
  if (input.tokenCount === 0) {
    return (
      'No balances found on any supported chain, so there is nothing to analyse yet. ' +
      'Insights appear once this wallet holds funds.'
    );
  }
  return 'Nothing notable to report — your portfolio looks unremarkable in a good way.';
}
