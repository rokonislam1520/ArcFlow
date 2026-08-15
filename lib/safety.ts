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
import { getAddress, isAddress, type Address } from 'viem';
import { getPublicClient } from './clients';
import type { ArcChain } from './chains';

export type WarningLevel = 'info' | 'caution';

export interface SafetyWarning {
  /** Stable identity, so React keys and tests do not depend on wording. */
  id:
    | 'unsaved-recipient'
    | 'first-transfer'
    | 'contract-recipient'
    | 'dormant-recipient'
    | 'checksum'
    | 'checks-unavailable';
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

/** True when any warning warrants a second look before signing. */
export function hasCaution(report: SafetyReport | null): boolean {
  return !!report?.warnings.some((w) => w.level === 'caution');
}
