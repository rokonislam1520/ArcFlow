import { defineChain } from 'viem';

/**
 * Chain + contract configuration for ArcFlow.
 *
 * Addresses come from NEXT_PUBLIC_* env vars so the same build can target a
 * local hardhat node, ARC testnet, or mainnet. `contracts/scripts/deploy.ts`
 * prints a ready-to-paste block for `.env.local`.
 */

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? 'http://127.0.0.1:8545';

export const arcChain = defineChain({
  id: CHAIN_ID,
  name: process.env.NEXT_PUBLIC_CHAIN_NAME ?? 'ARC Testnet',
  nativeCurrency: { name: 'ARC', symbol: 'ARC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: process.env.NEXT_PUBLIC_EXPLORER_URL
    ? { default: { name: 'Explorer', url: process.env.NEXT_PUBLIC_EXPLORER_URL } }
    : undefined,
  testnet: true,
});

/** Hex chain id as reported by `eth_chainId` (used to compare against the wallet). */
export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

const ZERO = '0x0000000000000000000000000000000000000000' as const;

function envAddress(value: string | undefined): `0x${string}` | undefined {
  if (!value || value === ZERO) return undefined;
  return value as `0x${string}`;
}

export const ADDRESSES = {
  usdc: envAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS),
  send: envAddress(process.env.NEXT_PUBLIC_SEND_ADDRESS),
  swap: envAddress(process.env.NEXT_PUBLIC_SWAP_ADDRESS),
  pay: envAddress(process.env.NEXT_PUBLIC_PAY_ADDRESS),
  recurring: envAddress(process.env.NEXT_PUBLIC_RECURRING_ADDRESS),
  split: envAddress(process.env.NEXT_PUBLIC_SPLIT_ADDRESS),
} as const;

/** USDC uses 6 decimals - matches `minTransfer = 1_000_000` in ArcFlowSend. */
export const USDC_DECIMALS = 6;

/** ArcFlowSend.minTransfer - $1 USDC. Mirrors the on-chain constant. */
export const MIN_TRANSFER = 1_000_000n;

// ========== ABIs (only the fragments the UI actually calls) ==========

export const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

export const arcFlowSendAbi = [
  {
    type: 'function',
    name: 'send',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'feeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'minTransfer',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

/** True when the app has the addresses it needs to talk to the Send flow. */
export const isSendConfigured = Boolean(ADDRESSES.usdc && ADDRESSES.send);
