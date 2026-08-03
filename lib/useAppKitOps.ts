'use client';
/**
 * Send / Swap / Bridge via Arc App Kit.
 *
 * App Kit owns the hard parts: ERC-20 approvals, CCTP burn/attest/mint for
 * bridging, routing for swaps. Reimplementing those with custom contracts would
 * be strictly worse, so the only custom Solidity left in this project is the
 * business logic App Kit does not cover (bill splitting, merchant invoices,
 * recurring schedules).
 *
 * A single lifecycle model is shared by all three operations so the UI can show
 * accurate progress instead of a fake success screen.
 */
import { useCallback, useState } from 'react';
import { getKit, type ArcChain } from './chains';
import { useWallet } from './WalletProvider';

export type OpStage = 'idle' | 'estimating' | 'awaitingSignature' | 'pending' | 'success' | 'error';

export interface OpState {
  stage: OpStage;
  /** Human-readable description of the current stage. */
  message: string;
  /** Populated once a hash is known. Bridges produce several. */
  hashes: string[];
  error: string | null;
  /** Fee/route estimate returned before submission. */
  estimate: unknown | null;
  result: unknown | null;
}

const IDLE: OpState = {
  stage: 'idle',
  message: '',
  hashes: [],
  error: null,
  estimate: null,
  result: null,
};

/** Extract transaction hashes from App Kit results without assuming a shape. */
function collectHashes(value: unknown, depth = 0): string[] {
  if (depth > 4 || value === null || typeof value !== 'object') return [];
  const out: string[] = [];
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (
      typeof val === 'string' &&
      /^0x[0-9a-fA-F]{64}$/.test(val) &&
      /hash|tx/i.test(key)
    ) {
      out.push(val);
    } else if (typeof val === 'object') {
      out.push(...collectHashes(val, depth + 1));
    }
  }
  return [...new Set(out)];
}

/**
 * Turn SDK/wallet errors into something a user can act on. App Kit ships
 * `isUserCancellationError`, so a decline is reported as a cancel rather than
 * a scary failure.
 */
async function describeError(err: unknown): Promise<string> {
  try {
    const kitModule = await import('@circle-fin/app-kit');
    if (kitModule.isUserCancellationError?.(err)) {
      return 'Cancelled in wallet.';
    }
    const message = kitModule.getErrorMessage?.(err);
    if (typeof message === 'string' && message) return message;
  } catch {
    // Fall through to generic handling if the helpers are unavailable.
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Operation failed.';
}

export function useAppKitOps() {
  const { adapter } = useWallet();
  const [state, setState] = useState<OpState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  /**
   * Shared driver: estimate, submit, then surface hashes.
   * `estimateFn` is optional because not every capability exposes one.
   */
  const run = useCallback(
    async (
      params: Record<string, unknown>,
      estimateFn: ((p: never) => Promise<unknown>) | null,
      submitFn: (p: never) => Promise<unknown>,
      pendingMessage: string
    ) => {
      if (!adapter) {
        setState({ ...IDLE, stage: 'error', error: 'Connect a wallet first.' });
        return null;
      }

      try {
        let estimate: unknown = null;
        if (estimateFn) {
          setState({ ...IDLE, stage: 'estimating', message: 'Estimating fees…' });
          // A failed estimate should not block the attempt; some routes only
          // reveal problems at submission time.
          estimate = await estimateFn(params as never).catch(() => null);
        }

        setState({
          ...IDLE,
          stage: 'awaitingSignature',
          message: 'Confirm in your wallet…',
          estimate,
        });

        const result = await submitFn(params as never);
        const hashes = collectHashes(result);

        setState({
          stage: 'success',
          message: pendingMessage,
          hashes,
          error: null,
          estimate,
          result,
        });
        return result;
      } catch (err) {
        setState({
          ...IDLE,
          stage: 'error',
          error: await describeError(err),
        });
        return null;
      }
    },
    [adapter]
  );

  /** Same-chain transfer of any supported token. */
  const send = useCallback(
    (args: { chain: ArcChain; to: string; amount: string; token: string }) => {
      const kit = getKit();
      return run(
        {
          from: { adapter, chain: args.chain.id },
          to: args.to,
          amount: args.amount,
          token: args.token,
        },
        kit.estimateSend.bind(kit),
        kit.send.bind(kit),
        'Transfer confirmed.'
      );
    },
    [adapter, run]
  );

  /** Same-chain swap. On Arc Testnet only USDC/EURC/cirBTC have liquidity. */
  const swap = useCallback(
    (args: { chain: ArcChain; tokenIn: string; tokenOut: string; amountIn: string }) => {
      const kit = getKit();
      return run(
        {
          from: { adapter, chain: args.chain.id },
          tokenIn: args.tokenIn,
          tokenOut: args.tokenOut,
          amountIn: args.amountIn,
        },
        kit.estimateSwap.bind(kit),
        kit.swap.bind(kit),
        'Swap submitted.'
      );
    },
    [adapter, run]
  );

  /** Cross-chain USDC via CCTP. Bridge supports USDC only. */
  const bridge = useCallback(
    (args: { from: ArcChain; to: ArcChain; amount: string; recipient?: string }) => {
      const kit = getKit();
      return run(
        {
          from: { adapter, chain: args.from.id },
          to: {
            adapter,
            chain: args.to.id,
            ...(args.recipient ? { recipientAddress: args.recipient } : {}),
          },
          amount: args.amount,
        },
        kit.estimateBridge.bind(kit),
        kit.bridge.bind(kit),
        'Bridge initiated. Funds arrive after attestation.'
      );
    },
    [adapter, run]
  );

  const isBusy =
    state.stage === 'estimating' ||
    state.stage === 'awaitingSignature' ||
    state.stage === 'pending';

  return { state, isBusy, send, swap, bridge, reset };
}
