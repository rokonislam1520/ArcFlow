import { defineChain } from 'viem';
import { getDefaultChain } from './chains';

/**
 * Chain + contract configuration for ArcFlow.
 *
 * Addresses come from NEXT_PUBLIC_* env vars so the same build can target a
 * local hardhat node, ARC testnet, or mainnet. `contracts/scripts/deploy.ts`
 * prints a ready-to-paste block for `.env.local`.
 */

/**
 * Deployment chain for the custom ArcFlow contracts.
 *
 * Defaults come from the App Kit registry rather than a localhost fallback: a
 * production build with a missing env var previously pointed at
 * `http://127.0.0.1:8545`, so every contract read failed with a confusing
 * network error instead of surfacing the misconfiguration.
 */
const deploymentDefault = getDefaultChain();

export const CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID ?? deploymentDefault.chainId
);

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? deploymentDefault.rpcEndpoints[0];

export const CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME ?? deploymentDefault.label;

export const arcChain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  // Arc pays gas in USDC rather than a bespoke "ARC" token, so this comes from
  // the chain definition instead of being asserted here.
  nativeCurrency: deploymentDefault.nativeCurrency,
  rpcUrls: { default: { http: RPC_URL ? [RPC_URL] : [] } },
  blockExplorers: process.env.NEXT_PUBLIC_EXPLORER_URL
    ? { default: { name: 'Explorer', url: process.env.NEXT_PUBLIC_EXPLORER_URL } }
    : undefined,
  testnet: deploymentDefault.isTestnet,
});

/** Hex chain id as reported by `eth_chainId` (used to compare against the wallet). */
export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

const ZERO = '0x0000000000000000000000000000000000000000';

function envAddress(value: string | undefined): `0x${string}` | undefined {
  if (!value || value === ZERO) return undefined;
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return undefined;
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

export interface TokenInfo {
  symbol: string;
  name: string;
  address: `0x${string}` | undefined;
  decimals: number;
}

/**
 * Swappable tokens. Only entries with a configured address are selectable in
 * the UI - there are no placeholder addresses, so an unconfigured token simply
 * does not appear rather than producing a transaction that reverts.
 */
export const TOKENS: TokenInfo[] = [
  { symbol: 'USDC', name: 'USD Coin', address: ADDRESSES.usdc, decimals: USDC_DECIMALS },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    address: envAddress(process.env.NEXT_PUBLIC_EURC_ADDRESS),
    decimals: Number(process.env.NEXT_PUBLIC_EURC_DECIMALS ?? 6),
  },
  {
    symbol: 'USDT',
    name: 'Tether',
    address: envAddress(process.env.NEXT_PUBLIC_USDT_ADDRESS),
    decimals: Number(process.env.NEXT_PUBLIC_USDT_DECIMALS ?? 6),
  },
  {
    symbol: 'DAI',
    name: 'Dai',
    address: envAddress(process.env.NEXT_PUBLIC_DAI_ADDRESS),
    decimals: Number(process.env.NEXT_PUBLIC_DAI_DECIMALS ?? 18),
  },
];

export const AVAILABLE_TOKENS = TOKENS.filter((t) => t.address !== undefined);

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
  {
    type: 'event',
    name: 'Sent',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
] as const;


export const arcFlowSwapAbi = [
  {
    type: 'function',
    name: 'swap',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getAmountOut',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export const arcFlowSplitAbi = [
  {
    type: 'function',
    name: 'createSplit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'members', type: 'address[]' },
      { name: 'shares', type: 'uint256[]' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [{ name: 'groupId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'settleShare',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'groupId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getGroup',
    stateMutability: 'view',
    inputs: [{ name: 'groupId', type: 'uint256' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'memberCount', type: 'uint256' },
      { name: 'settledCount', type: 'uint256' },
      { name: 'status', type: 'uint8' },
    ],
  },
  {
    type: 'function',
    name: 'getGroupMembers',
    stateMutability: 'view',
    inputs: [{ name: 'groupId', type: 'uint256' }],
    outputs: [
      { name: 'wallets', type: 'address[]' },
      { name: 'shares', type: 'uint256[]' },
      { name: 'paid', type: 'bool[]' },
    ],
  },
  {
    type: 'function',
    name: 'getUserGroups',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'getOutstandingShare',
    stateMutability: 'view',
    inputs: [
      { name: 'groupId', type: 'uint256' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export const arcFlowPayAbi = [
  {
    type: 'function',
    name: 'pay',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'merchant', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'registerMerchant',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'category', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getMerchant',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [
      { name: 'name', type: 'string' },
      { name: 'category', type: 'string' },
      { name: 'active', type: 'bool' },
      { name: 'totalReceived', type: 'uint256' },
      { name: 'txCount', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getMerchantCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'merchantList',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
] as const;

export const arcFlowRecurringAbi = [
  {
    type: 'function',
    name: 'createRecurring',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'payee', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'frequency', type: 'uint8' },
      { name: 'maxExecutions', type: 'uint32' },
      { name: 'name', type: 'string' },
    ],
    outputs: [{ name: 'paymentId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'cancelRecurring',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'paymentId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getPayment',
    stateMutability: 'view',
    inputs: [{ name: 'paymentId', type: 'uint256' }],
    outputs: [
      { name: 'payer', type: 'address' },
      { name: 'payee', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'frequency', type: 'uint8' },
      { name: 'nextPayment', type: 'uint256' },
      { name: 'totalPaid', type: 'uint256' },
      { name: 'executions', type: 'uint32' },
      { name: 'active', type: 'bool' },
      { name: 'name', type: 'string' },
    ],
  },
  {
    type: 'function',
    name: 'getUserPayments',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256[]' }],
  },
] as const;

/** Feature gates - true when the addresses that flow needs are configured. */
export const isConfigured = {
  send: Boolean(ADDRESSES.usdc && ADDRESSES.send),
  swap: Boolean(ADDRESSES.swap && AVAILABLE_TOKENS.length >= 2),
  split: Boolean(ADDRESSES.usdc && ADDRESSES.split),
  pay: Boolean(ADDRESSES.usdc && ADDRESSES.pay),
  recurring: Boolean(ADDRESSES.usdc && ADDRESSES.recurring),
} as const;
