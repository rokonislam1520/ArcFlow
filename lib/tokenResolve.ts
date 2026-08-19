'use client';
/**
 * Resolve a pasted contract address into a real, selectable token.
 *
 * Why this exists, and what it deliberately is not:
 *
 * There is no way to *enumerate* the ERC-20s a wallet holds with the providers
 * this app has. Plain JSON-RPC offers no "list my tokens" call — the only
 * honest route is scanning `Transfer` logs for the whole chain history, which
 * public RPCs rate-limit and block-range-cap, or an indexer (Alchemy, Moralis,
 * Covalent, Zerion), for which this project holds no key. App Kit's
 * `getBalances` cannot stand in either: it takes one *named* token and its
 * `SUPPORTED_TOKENS` is `["USDC"]`, so it answers "how much USDC" rather than
 * "what do I hold".
 *
 * What *is* possible is the reverse direction. Given an address, the token
 * itself will state its symbol, name, decimals and this wallet's balance, and
 * App Kit's `swap()` accepts a raw `0x` address for `tokenIn`/`tokenOut` — so a
 * token found this way is genuinely tradable, not merely displayable.
 *
 * So paste is discovery here: the user supplies the address, the chain supplies
 * every fact about it, and nothing is guessed. A contract that does not answer
 * `symbol`/`decimals` is reported as unresolved rather than shown under an
 * invented ticker.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, isAddress, type Abi, type Address } from 'viem';
import { getPublicClient } from './clients';
import type { ArcChain } from './chains';
import type { SwapToken } from './swapTokens';

/** Only the four ERC-20 views needed; a token need not be complete to be real. */
const ERC20_ABI = [
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const satisfies Abi;

/** A token proven to exist on one chain, with this wallet's balance if known. */
export interface ResolvedToken {
  token: SwapToken;
  /** Human-readable balance, or null when no wallet is connected. */
  amount: string | null;
}

export interface ResolveState {
  /** Chains where the address is a readable ERC-20. */
  found: ResolvedToken[];
  loading: boolean;
  /** True once every chain has answered and none recognised the address. */
  searched: boolean;
}

const EMPTY: ResolveState = { found: [], loading: false, searched: false };

/** Trim to a readable amount without pretending to precision we do not have. */
function formatAmount(raw: bigint, decimals: number): string {
  const exact = formatUnits(raw, decimals);
  if (!exact.includes('.')) return exact;
  const [whole, frac] = exact.split('.');
  // Six places is plenty on screen; trailing zeros carry no information.
  const trimmed = frac.slice(0, 6).replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/**
 * Read one address across several chains and keep whatever answers.
 *
 * Every chain is queried in parallel and failures are per-chain: one dead RPC
 * costs that chain's row, not the whole lookup. `allowFailure` is on because a
 * non-token contract answers some calls and reverts others, and that partial
 * reply is exactly how we tell a token from a random address.
 */
async function resolveAcrossChains(
  address: Address,
  chains: ArcChain[],
  wallet: Address | null
): Promise<ResolvedToken[]> {
  const results = await Promise.all(
    chains.map(async (chain): Promise<ResolvedToken | null> => {
      const client = getPublicClient(chain);
      if (!client) return null;

      const base = { address, abi: ERC20_ABI } as const;
      try {
        // Metadata is a fixed three-call batch. The balance is fetched
        // separately rather than appended conditionally: a variable-length
        // `contracts` tuple loses viem's per-call return typing, and collapsing
        // the three reads to one element type was exactly that bug.
        const [symbolRead, nameRead, decimalsRead] = await client.multicall({
          allowFailure: true,
          contracts: [
            { ...base, functionName: 'symbol' },
            { ...base, functionName: 'name' },
            { ...base, functionName: 'decimals' },
          ],
        });


        // Symbol and decimals are the minimum that makes a token usable: one
        // names it, the other makes its balance mean anything. Without both,
        // report nothing rather than display a placeholder.
        if (symbolRead?.status !== 'success' || decimalsRead?.status !== 'success') return null;

        const symbol = String(symbolRead.result).trim();
        if (!symbol) return null;

        const decimals = Number(decimalsRead.result);
        if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;

        // A missing name is not fatal, and is not invented: fall back to the
        // symbol, which the contract did give us.
        const name =
          nameRead?.status === 'success' && String(nameRead.result).trim()
            ? String(nameRead.result).trim()
            : symbol;

        // Balance is a separate read, and only when a wallet is connected.
        // A failure here leaves `amount` null, which the UI renders as unknown
        // rather than as zero — those are different claims.
        let amount: string | null = null;
        if (wallet) {
          try {
            const raw = await client.readContract({
              ...base,
              functionName: 'balanceOf',
              args: [wallet],
            });
            amount = formatAmount(raw, decimals);
          } catch {
            amount = null;
          }
        }


        return {
          amount,
          token: {
            key: `${chain.id}:${address.toLowerCase()}`,
            // Routed by address. App Kit's swap takes a raw `0x` for tokenIn /
            // tokenOut, so this is a real route and not a display-only entry.
            alias: 'NATIVE',
            route: address,
            symbol,
            name,
            chain,
            address,
            isNative: false,
            decimals,
            /** Not in the registry, so the UI must not badge it as canonical. */
            unverified: true,
          },
        };
      } catch {
        // An unreachable chain is silence, not a negative answer.
        return null;
      }
    })
  );

  return results.filter((r): r is ResolvedToken => r !== null);
}

/**
 * Resolve `query` when it is a complete address.
 *
 * Deliberately does not fire on partial input: a lookup costs one multicall per
 * chain, and forty characters of a pasted address arrive at once anyway. Stale
 * responses are discarded by request id so a slow chain from a previous paste
 * cannot overwrite the current result.
 */
export function useResolvedToken(
  query: string,
  chains: ArcChain[],
  wallet: Address | null
): ResolveState {
  const [state, setState] = useState<ResolveState>(EMPTY);
  const requestId = useRef(0);

  const candidate = useMemo(() => {
    const q = query.trim();
    return isAddress(q) ? (q as Address) : null;
  }, [query]);

  // Chains change identity on every render of the parent; key on ids so the
  // effect tracks the actual set rather than the array reference.
  const chainKey = chains.map((c) => c.id).join(',');

  useEffect(() => {
    if (!candidate) {
      setState(EMPTY);
      return;
    }

    const id = ++requestId.current;
    setState({ found: [], loading: true, searched: false });

    void resolveAcrossChains(candidate, chains, wallet).then((found) => {
      if (id !== requestId.current) return;
      setState({ found, loading: false, searched: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chainKey stands in for chains
  }, [candidate, chainKey, wallet]);

  return state;
}
