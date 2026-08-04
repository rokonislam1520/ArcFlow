/**
 * Read-only viem clients, built per chain from the App Kit registry.
 *
 * Reads must not depend on the wallet's currently selected network, otherwise
 * a unified multichain balance would be impossible: you can only be connected
 * to one chain at a time. These clients talk to each chain's RPC directly.
 */
import { createPublicClient, defineChain, http, type Chain, type PublicClient } from 'viem';
import type { ArcChain } from './chains';

/**
 * Canonical Multicall3, deployed at the same CREATE2 address on essentially
 * every EVM chain — verified present on Ethereum, Base, Arbitrum and Arc
 * Testnet.
 *
 * viem refuses to use `multicall` unless the chain definition declares this
 * contract, and App Kit's registry does not carry it. Without this, every
 * batched balance read failed with "does not support contract multicall3",
 * which would have made the portfolio show an error on all chains.
 */
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

/** Translate an App Kit chain definition into a viem chain. */
export function toViemChain(chain: ArcChain): Chain {
  if (chain.chainId === undefined) {
    throw new Error(`${chain.label} has no EVM chain id`);
  }
  const explorerBase = chain.explorerTemplate?.replace(/\/tx\/\{hash\}$/, '');
  return defineChain({
    id: chain.chainId,
    name: chain.label,
    // Arc's gas token is USDC at 18 decimals, so these values must come from
    // the registry rather than defaulting to ETH.
    nativeCurrency: {
      name: chain.nativeCurrency.name,
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
    },
    rpcUrls: { default: { http: chain.rpcEndpoints } },
    blockExplorers: explorerBase
      ? { default: { name: 'Explorer', url: explorerBase } }
      : undefined,
    // Declared optimistically: callers that batch must still tolerate failure,
    // since a chain without Multicall3 would otherwise break every read.
    contracts: { multicall3: { address: MULTICALL3_ADDRESS } },
    testnet: chain.isTestnet,
  });
}

const clientCache = new Map<string, PublicClient>();

/**
 * Cached public client for a chain. Cached because creating one per render
 * would drop viem's internal request batching and multicall dedup.
 */
export function getPublicClient(chain: ArcChain): PublicClient | null {
  if (chain.type !== 'evm' || chain.chainId === undefined) return null;
  if (chain.rpcEndpoints.length === 0) return null;

  const cached = clientCache.get(chain.id);
  if (cached) return cached;

  const client = createPublicClient({
    chain: toViemChain(chain),
    // Batching collapses the many balance reads a portfolio view issues into
    // far fewer HTTP round trips.
    transport: http(chain.rpcEndpoints[0], { batch: true, retryCount: 2 }),
  });

  clientCache.set(chain.id, client);
  return client;
}
