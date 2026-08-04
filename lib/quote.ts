/**
 * Pure quote parsing, kept free of React so it can be tested directly against
 * real App Kit responses.
 *
 * App Kit returns a different fee shape per operation, and none of them are
 * documented as stable. Everything here is defensive: an unexpected payload
 * yields fewer fee lines, never a crash and never a fabricated number.
 */

export type OpKind = 'send' | 'swap' | 'bridge';

/** One fee line, normalized across the three differently-shaped estimates. */
export interface FeeLine {
  label: string;
  token: string;
  amount: string;
  /** Chain the fee is paid on. Bridges charge on both ends. */
  chain?: string;
}

/** A quote the user can inspect before committing. */
export interface Quote {
  kind: OpKind;
  fees: FeeLine[];
  /** Expected amount received. Swap only. */
  output?: { amount: string; token: string };
  /** Worst-case received before the route reverts. Swap only. */
  minOutput?: { amount: string; token: string };
  /** Destination as App Kit resolved it, for bridge confirmation. */
  destination?: { address?: string; chain?: string };
  /** Untouched SDK response, kept for debugging without reshaping. */
  raw: unknown;
}

type Bag = Record<string, unknown>;

const asBag = (v: unknown): Bag | null =>
  v && typeof v === 'object' ? (v as Bag) : null;

const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;

/** Pull transaction hashes out of a result without assuming its shape. */
export function collectHashes(value: unknown, depth = 0): string[] {
  if (depth > 5 || value === null || typeof value !== 'object') return [];
  const out: string[] = [];
  for (const [key, val] of Object.entries(value as Bag)) {
    if (typeof val === 'string' && /^0x[0-9a-fA-F]{64}$/.test(val) && /hash|tx/i.test(key)) {
      out.push(val);
    } else if (val && typeof val === 'object') {
      out.push(...collectHashes(val, depth + 1));
    }
  }
  return [...new Set(out)];
}

/**
 * Normalize the estimate shapes observed from the live SDK:
 *  - swap:   `fees: [{ token, amount, type }]` plus `estimatedOutput`/`stopLimit`
 *  - bridge: `gasFees: [{ name, token, blockchain, fees: { fee } }]`
 *  - send:   fee fields flattened at the top level
 */
export function normalizeQuote(kind: OpKind, raw: unknown): Quote {
  const bag = asBag(raw) ?? {};
  const fees: FeeLine[] = [];

  // Swap-style: a flat list tagged by fee type.
  const flat = bag.fees;
  if (Array.isArray(flat)) {
    for (const entry of flat) {
      const f = asBag(entry);
      if (!f) continue;
      const amount = str(f.amount);
      if (!amount) continue;
      fees.push({
        label: str(f.type) ?? str(f.name) ?? 'Fee',
        token: str(f.token) ?? '',
        amount,
        chain: str(f.blockchain) ?? str(f.chain),
      });
    }
  }

  // Bridge-style: per-step gas, nested one level deeper.
  const gasFees = bag.gasFees;
  if (Array.isArray(gasFees)) {
    for (const entry of gasFees) {
      const g = asBag(entry);
      if (!g) continue;
      const inner = asBag(g.fees);
      const amount = str(inner?.fee) ?? str(g.fee);
      if (!amount) continue;
      fees.push({
        label: str(g.name) ?? 'Gas',
        token: str(g.token) ?? '',
        amount,
        chain: str(g.blockchain) ?? str(g.chain),
      });
    }
  }

  const output = asBag(bag.estimatedOutput);
  const minOut = asBag(bag.stopLimit);
  const destination = asBag(bag.destination);

  return {
    kind,
    fees,
    output:
      output && str(output.amount)
        ? { amount: str(output.amount)!, token: str(output.token) ?? '' }
        : undefined,
    minOutput:
      minOut && str(minOut.amount)
        ? { amount: str(minOut.amount)!, token: str(minOut.token) ?? '' }
        : undefined,
    destination: destination
      ? { address: str(destination.address), chain: str(destination.chain) }
      : undefined,
    raw,
  };
}
