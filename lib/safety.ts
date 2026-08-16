'use client';
/**
 * Recipient risk checks, run between quoting and signing.
 *
 * These exist because App Kit's estimate answers "can this transaction
 * succeed?", not "is this transaction what the user meant?". A transfer to a
 * wrong-but-valid address estimates perfectly and settles perfectly; the money
 * is simply gone. Everything here targets that gap.
 *
 * Two rules govern the whole module:
 *
 * 1. Nothing blocks. These are advisory signals shown beside the confirm
 *    button, because every one of them has a legitimate case — paying a new
 *    person, funding a contract, using a freshly created wallet. A hard block
 *    would train users to route around the app; a warning they must read once
 *    is the honest intervention. The single exception is the self-send, which
 *    the SDK itself rejects, so `useAppKitOps` stops that before quoting.
 *
 * 2. An unavailable check is reported as unknown, never as safe. If the RPC
 *    fails, the user is told the check did not run. Silently returning "no
 *    warnings" would make a failed lookup indistinguishable from a clean
 *    result, which is precisely the lie this module exists to avoid.
 */
import { formatUnits, getAddress, isAddress, parseUnits, type Address } from 'viem';
import { getPublicClient } from './clients';
import type { ArcChain } from './chains';
import type { Quote } from './quote';

export type WarningLevel = 'info' | 'caution';

export interface SafetyWarning {
  /** Stable identity, so React keys and tests do not depend on wording. */
  id:
    | 'unsaved-recipient'
    | 'first-transfer'
    | 'contract-recipient'
    | 'dormant-recipient'
    | 'checksum'
    | 'checks-unavailable'
    | 'no-gas'
    | 'insufficient-gas'
    | 'low-gas-buffer'
    | 'gas-check-unavailable';
  level: WarningLevel;
  title: string;
  /** One sentence the user can act on. No jargon, no hedging. */
  detail: string;
}

export interface SafetyReport {
  warnings: SafetyWarning[];
  /** True when at least one on-chain lookup failed. */
  degraded: boolean;
}

const EMPTY: SafetyReport = { warnings: [], degraded: false };

/**
 * Whether a pasted address carries a valid EIP-55 checksum.
 *
 * Mixed-case is the signal: an all-lowercase or all-uppercase address is a
 * legitimate, checksum-free form used widely (explorers, older tooling), so
 * flagging it would cry wolf on most pastes. Mixed case, however, is a claim to
 * be checksummed — and if that claim fails, a character was altered, which is
 * exactly the single-character typo that silently redirects funds.
 */
export function hasChecksumProblem(input: string): boolean {
  if (!isAddress(input)) return false;
  const body = input.slice(2);
  const isCased = body !== body.toLowerCase() && body !== body.toUpperCase();
  if (!isCased) return false;
  try {
    return getAddress(input.toLowerCase()) !== input;
  } catch {
    return false;
  }
}

/**
 * Inspect a recipient before the wallet opens.
 *
 * `knownRecipient` and `sentBefore` come from local state — the address book
 * and scanned history — and are passed in rather than read here so this stays a
 * pure function of its inputs plus two RPC reads, and so a caller with no
 * history loaded can omit them instead of receiving a fabricated verdict.
 */
export async function checkRecipient(args: {
  chain: ArcChain;
  to: string;
  /** True when the address is in the user's address book. */
  knownRecipient: boolean;
  /** True when history shows a prior transfer to this address. Null when history is unavailable. */
  sentBefore: boolean | null;
}): Promise<SafetyReport> {
  const { chain, to, knownRecipient, sentBefore } = args;
  if (!isAddress(to)) return EMPTY;

  const warnings: SafetyWarning[] = [];
  let degraded = false;

  if (hasChecksumProblem(to)) {
    warnings.push({
      id: 'checksum',
      level: 'caution',
      title: 'Address checksum does not match',
      detail:
        'This address is mixed-case but fails its checksum, which usually means a character was altered. Re-copy it from the source before sending.',
    });
  }

  // "Never paid before" is the strongest available signal that a paste went
  // wrong, but it is only meaningful when history actually loaded — hence the
  // explicit null case rather than treating unknown as false.
  if (!knownRecipient) {
    if (sentBefore === false) {
      warnings.push({
        id: 'first-transfer',
        level: 'caution',
        title: 'First time sending here',
        detail:
          'No previous transfer to this address appears in your recent history. Check the last four characters against the source.',
      });
    } else {
      warnings.push({
        id: 'unsaved-recipient',
        level: 'info',
        title: 'Recipient is not in your address book',
        detail: 'Save it after sending to pick it by name next time instead of pasting.',
      });
    }
  }

  const client = getPublicClient(chain);
  if (!client) {
    // No RPC for this chain: say so rather than implying the checks passed.
    warnings.push({
      id: 'checks-unavailable',
      level: 'info',
      title: 'On-chain checks unavailable',
      detail: `No public RPC is configured for ${chain.label}, so the recipient could not be inspected. Verify the address yourself.`,
    });
    return { warnings, degraded: true };
  }

  const recipient = to as Address;

  // Both reads in parallel and independently settled: a contract check is
  // still worth showing when the activity check fails, and vice versa.
  const [codeResult, txCountResult] = await Promise.allSettled([
    client.getCode({ address: recipient }),
    client.getTransactionCount({ address: recipient }),
  ]);

  const isContract =
    codeResult.status === 'fulfilled' &&
    typeof codeResult.value === 'string' &&
    codeResult.value !== '0x';

  if (isContract) {
    warnings.push({
      id: 'contract-recipient',
      level: 'caution',
      title: 'Recipient is a contract',
      detail:
        'This address holds code, not a wallet. Tokens sent to a contract that does not handle them are usually unrecoverable.',
    });
  }

  if (codeResult.status === 'rejected') degraded = true;

  if (txCountResult.status === 'fulfilled') {
    // Only meaningful for wallets: a contract legitimately has a zero nonce
    // while being perfectly active, so this check would misfire on every one.
    if (!isContract && txCountResult.value === 0) {
      warnings.push({
        id: 'dormant-recipient',
        level: 'caution',
        title: 'Recipient has never transacted',
        detail: `This address has sent no transactions on ${chain.label}. That is normal for a new wallet, and also what a mistyped address looks like.`,
      });
    }
  } else {
    degraded = true;
  }

  if (degraded) {
    warnings.push({
      id: 'checks-unavailable',
      level: 'info',
      title: 'Some checks could not run',
      detail: `${chain.label}'s RPC did not answer every lookup, so the recipient was only partly inspected.`,
    });
  }

  return { warnings, degraded };
}

/* ------------------------------------------------------------------ gas */

/**
 * Sum the quote's fee lines that are denominated in the chain's own gas token.
 *
 * Fee lines arrive as human-readable decimal strings whose token is named by
 * the SDK, so the only lines that bear on "can I afford gas?" are the ones
 * priced in the native symbol. A fee quoted in USDC is a protocol fee taken
 * from the transferred asset and must not be added to a native requirement, and
 * a line whose token the SDK left blank is not assumed to be native — guessing
 * either way would produce a number the user cannot verify.
 *
 * Returns null when no native-denominated line was found, which is the honest
 * answer for a route whose gas the estimate did not itemise. Bridges legitimately
 * charge on two chains; only the lines for `chain` matter here, so a line naming
 * a *different* chain is excluded and an unlabelled line is counted for the chain
 * being quoted.
 *
 * `FeeLine.chain` is whatever string the SDK put in `blockchain`/`chain`, which
 * is the same identifier space as `ArcChain.id` ("Base_Sepolia") — never the EVM
 * chain number — so the comparison is string to string, case-insensitively,
 * because the two fields have been observed to differ in capitalisation.
 */
export function nativeFeeTotal(quote: Quote | null, chain: ArcChain): bigint | null {
  if (!quote) return null;

  const symbol = chain.nativeCurrency.symbol.toUpperCase();
  const decimals = chain.nativeCurrency.decimals;
  const chainId = chain.id.toLowerCase();

  let total: bigint | null = null;

  for (const fee of quote.fees) {
    if (!fee.token || fee.token.toUpperCase() !== symbol) continue;
    // A fee explicitly attributed to another chain is paid out of a different
    // native balance, so it is not part of this chain's requirement.
    if (fee.chain && fee.chain.toLowerCase() !== chainId) continue;
    try {
      const raw = parseUnits(fee.amount, decimals);
      total = (total ?? 0n) + raw;
    } catch {
      // An unparseable figure is skipped rather than coerced: a wrong total
      // here would either hide a real shortfall or invent one.
      continue;
    }
  }

  return total;
}

/**
 * Whether the wallet can pay for the transaction it is about to sign.
 *
 * This is the gap App Kit's estimate leaves open in the *other* direction from
 * `checkRecipient`: the estimate confirms the token balance covers the amount,
 * but a wallet holding plenty of USDC and no native asset produces a clean
 * quote and then a failure inside the wallet, phrased in terms the user cannot
 * act on. Checking here means the shortfall is named in the app, before a
 * signature is requested.
 *
 * `value` is the native amount being transferred, when the asset *is* the gas
 * token — in that case fee and amount compete for the same balance, so sending
 * "max" is precisely the case that cannot succeed.
 */
export async function checkGas(args: {
  chain: ArcChain;
  /** The wallet paying for the transaction. */
  from: string;
  /** The accepted quote, whose fee lines carry the gas estimate. */
  quote: Quote | null;
  /** Native amount being sent, in base units. Zero for token transfers. */
  value?: bigint;
}): Promise<SafetyReport> {
  const { chain, from, quote, value = 0n } = args;
  if (!isAddress(from)) return EMPTY;

  const symbol = chain.nativeCurrency.symbol;
  const decimals = chain.nativeCurrency.decimals;
  const fee = nativeFeeTotal(quote, chain);

  const client = getPublicClient(chain);
  if (!client) {
    return {
      warnings: [
        {
          id: 'gas-check-unavailable',
          level: 'info',
          title: `${symbol} balance not checked`,
          detail: `No public RPC is configured for ${chain.label}, so it could not be confirmed that you hold enough ${symbol} for gas.`,
        },
      ],
      degraded: true,
    };
  }

  let balance: bigint;
  try {
    balance = await client.getBalance({ address: from as Address });
  } catch {
    return {
      warnings: [
        {
          id: 'gas-check-unavailable',
          level: 'info',
          title: `${symbol} balance not checked`,
          detail: `${chain.label}'s RPC did not return your ${symbol} balance, so gas could not be verified. If the wallet reports a failure, a ${symbol} top-up is the first thing to check.`,
        },
      ],
      degraded: true,
    };
  }

  const warnings: SafetyWarning[] = [];

  // Zero native is unambiguous and worth stating even without a fee estimate:
  // no EVM transaction of any kind settles from an empty gas balance.
  if (balance === 0n) {
    warnings.push({
      id: 'no-gas',
      level: 'caution',
      title: `No ${symbol} for gas`,
      detail: `This wallet holds no ${symbol} on ${chain.label}. Every transaction there is paid for in ${symbol}, so this will fail in your wallet until you add some.`,
    });
    return { warnings, degraded: false };
  }

  if (fee === null) {
    // Nothing to compare against. Saying so beats implying the balance is
    // sufficient on the strength of a check that never happened.
    warnings.push({
      id: 'gas-check-unavailable',
      level: 'info',
      title: 'Gas cost not itemised',
      detail: `This route's estimate did not price gas in ${symbol}, so it could not be checked against your balance of ${formatUnits(balance, decimals)} ${symbol}.`,
    });
    return { warnings, degraded: false };
  }

  // The amount competes with the fee only when it is the gas token itself.
  const required = fee + value;

  if (balance < required) {
    const short = required - balance;
    warnings.push({
      id: 'insufficient-gas',
      level: 'caution',
      title: `Not enough ${symbol} for gas`,
      detail:
        value > 0n
          ? `This needs about ${formatUnits(required, decimals)} ${symbol} including the fee, and the wallet holds ${formatUnits(balance, decimals)}. Reduce the amount by at least ${formatUnits(short, decimals)} ${symbol} to leave room for gas.`
          : `The fee is about ${formatUnits(fee, decimals)} ${symbol} and the wallet holds ${formatUnits(balance, decimals)}. Add at least ${formatUnits(short, decimals)} ${symbol} on ${chain.label} before signing.`,
    });
    return { warnings, degraded: false };
  }

  /*
   * Enough for this transaction, but only just.
   *
   * The threshold is twice the fee, expressed as a multiple rather than a fixed
   * figure because gas costs differ by orders of magnitude across chains and any
   * constant would be wrong on most of them. Below it, the transfer succeeds and
   * the *next* one probably will not, which is worth knowing now rather than
   * discovering when the wallet is nearly empty.
   */
  if (balance - required < fee) {
    warnings.push({
      id: 'low-gas-buffer',
      level: 'info',
      title: `${symbol} balance is low`,
      detail: `This will settle, but ${formatUnits(balance - required, decimals)} ${symbol} is left afterwards — less than this transaction's own fee, so the next one may not go through.`,
    });
  }

  return { warnings, degraded: false };
}

/**
 * Combine reports so the confirm card renders one list.
 *
 * Duplicate ids are dropped: both checks can report `gas-check-unavailable` or
 * an RPC problem, and repeating the same sentence twice reads as two separate
 * faults. `degraded` is the union, since a partial result from either source
 * means the overall picture is incomplete.
 */
export function mergeReports(...reports: Array<SafetyReport | null>): SafetyReport | null {
  const present = reports.filter((r): r is SafetyReport => r !== null);
  if (present.length === 0) return null;

  const seen = new Set<string>();
  const warnings: SafetyWarning[] = [];

  for (const report of present) {
    for (const warning of report.warnings) {
      if (seen.has(warning.id)) continue;
      seen.add(warning.id);
      warnings.push(warning);
    }
  }

  // Cautions first: the ordering is the priority the user should read them in,
  // and an advisory note above a real shortfall would bury the thing that matters.
  warnings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'caution' ? -1 : 1));

  return { warnings, degraded: present.some((r) => r.degraded) };
}

/** True when any warning warrants a second look before signing. */
export function hasCaution(report: SafetyReport | null): boolean {
  return !!report?.warnings.some((w) => w.level === 'caution');
}


