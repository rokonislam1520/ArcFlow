'use client';
/**
 * Send / Swap / Bridge via Arc App Kit, as an explicit two-step flow:
 * quote first, submit only after the user accepts what they saw.
 *
 * This shape is deliberate. The previous version estimated and submitted in a
 * single click, which meant fees were never shown before signing, and a failed
 * estimate was swallowed (`.catch(() => null)`) so the user was still walked
 * into the wallet for a transaction that could not succeed. Verified against
 * the live SDK, `estimateSend` throws "Insufficient token balance" — exactly
 * the case that must stop the flow rather than be ignored.
 *
 * App Kit owns the hard parts: ERC-20 approvals, CCTP burn/attest/mint, swap
 * routing. The only custom Solidity in this project is the business logic App
 * Kit does not cover (splitting, invoices, schedules).
 */
import { useCallback, useRef, useState } from 'react';
import { getKit, type ArcChain } from './chains';
import { useWallet } from './WalletProvider';
import { collectHashes, normalizeQuote, type OpKind, type Quote } from './quote';
import { publishRefresh } from './refresh';

export type { OpKind, FeeLine, Quote } from './quote';

export type OpStage =
  | 'idle'
  | 'quoting'
  | 'quoted'
  | 'awaitingSignature'
  | 'pending'
  | 'success'
  | 'error';

export interface OpState {
  kind: OpKind | null;
  stage: OpStage;
  message: string;
  hashes: string[];
  error: string | null;
  quote: Quote | null;
  result: unknown | null;
}

const IDLE: OpState = {
  kind: null,
  stage: 'idle',
  message: '',
  hashes: [],
  error: null,
  quote: null,
  result: null,
};

/**
 * Turn SDK/wallet errors into something actionable. App Kit ships
 * `isUserCancellationError`, so a decline reads as a cancel, not a failure.
 */
async function describeError(err: unknown): Promise<string> {
  try {
    const kitModule = await import('@circle-fin/app-kit');
    if (kitModule.isUserCancellationError?.(err)) return 'Cancelled in wallet.';
    const message = kitModule.getErrorMessage?.(err);
    if (typeof message === 'string' && message) return message;
  } catch {
    // Fall through if the helpers are unavailable.
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Operation failed.';
}

/** Parameters for each operation, kept between quote and submit. */
type PendingOp = {
  kind: OpKind;
  chain: ArcChain;
  params: Record<string, unknown>;
};

export function useAppKitOps() {
  const { adapter, address } = useWallet();
  const [state, setState] = useState<OpState>(IDLE);
  // Held so submit uses byte-identical params to those quoted.
  const pending = useRef<PendingOp | null>(null);

  const reset = useCallback(() => {
    pending.current = null;
    setState(IDLE);
  }, []);

  /**
   * Step 1: ask App Kit what this will cost.
   *
   * An estimate failure is terminal here. That is the point: it is how
   * insufficient balance and dead routes are caught before the wallet opens.
   */
  const quote = useCallback(
    async (op: PendingOp, estimateFn: (p: never) => Promise<unknown>) => {
      if (!adapter) {
        setState({ ...IDLE, stage: 'error', error: 'Connect a wallet first.' });
        return null;
      }

      pending.current = op;
      setState({ ...IDLE, kind: op.kind, stage: 'quoting', message: 'Fetching quote…' });

      try {
        const raw = await estimateFn(op.params as never);
        const parsed = normalizeQuote(op.kind, raw);
        setState({
          ...IDLE,
          kind: op.kind,
          stage: 'quoted',
          message: 'Review and confirm.',
          quote: parsed,
        });
        return parsed;
      } catch (err) {
        pending.current = null;
        setState({
          ...IDLE,
          kind: op.kind,
          stage: 'error',
          error: await describeError(err),
        });
        return null;
      }
    },
    [adapter]
  );

  /** Step 2: submit exactly what was quoted. */
  const submit = useCallback(async () => {
    const op = pending.current;
    if (!op || !adapter) return null;

    const kit = getKit();
    const submitFn =
      op.kind === 'send'
        ? kit.send.bind(kit)
        : op.kind === 'swap'
          ? kit.swap.bind(kit)
          : kit.bridge.bind(kit);

    setState((s) => ({
      ...s,
      stage: 'awaitingSignature',
      message:
        op.kind === 'bridge'
          ? 'Approve and confirm in your wallet…'
          : 'Confirm in your wallet…',
      error: null,
    }));

    try {
      // Bridges need several signatures (approve, burn, then mint), so the
      // wallet may prompt more than once before this resolves.
      const result = await submitFn(op.params as never);
      const hashes = collectHashes(result);

      setState((s) => ({
        ...s,
        stage: 'success',
        message:
          op.kind === 'bridge'
            ? 'Bridge complete. USDC minted on the destination chain.'
            : op.kind === 'swap'
              ? 'Swap confirmed.'
              : 'Transfer confirmed.',
        hashes,
        result,
        error: null,
      }));

      // Funds have actually moved: tell the rest of the app to re-read. Without
      // this the dashboard and portfolio keep showing pre-transfer balances,
      // which next to a success message reads as money having disappeared.
      publishRefresh();

      pending.current = null;
      return result;
    } catch (err) {
      // Resolved before setState: the updater callback cannot be async.
      const message = await describeError(err);
      setState((s) => ({
        ...s,
        // Stay on 'error' but keep the quote, so the user can retry without
        // re-quoting after, say, declining in the wallet by mistake.
        stage: 'error',
        error: message,
      }));
      return null;
    }
  }, [adapter]);

  /** Discard a quote without submitting. */
  const cancelQuote = useCallback(() => {
    pending.current = null;
    setState(IDLE);
  }, []);

  /** Same-chain transfer. Quote only; call `submit` to execute. */
  const quoteSend = useCallback(
    (args: { chain: ArcChain; to: string; amount: string; token: string }) => {
      const kit = getKit();
      // The SDK rejects self-transfers, so catch it here with a clearer message.
      if (address && args.to.toLowerCase() === address.toLowerCase()) {
        setState({
          ...IDLE,
          kind: 'send',
          stage: 'error',
          error: 'Recipient is your own address.',
        });
        return Promise.resolve(null);
      }
      return quote(
        {
          kind: 'send',
          chain: args.chain,
          params: {
            from: { adapter, chain: args.chain.id },
            to: args.to,
            amount: args.amount,
            token: args.token,
          },
        },
        kit.estimateSend.bind(kit)
      );
    },
    [adapter, address, quote]
  );

  /** Same-chain swap. On Arc Testnet only USDC/EURC/cirBTC have liquidity. */
  const quoteSwap = useCallback(
    (args: { chain: ArcChain; tokenIn: string; tokenOut: string; amountIn: string }) => {
      const kit = getKit();
      return quote(
        {
          kind: 'swap',
          chain: args.chain,
          params: {
            from: { adapter, chain: args.chain.id },
            tokenIn: args.tokenIn,
            tokenOut: args.tokenOut,
            amountIn: args.amountIn,
          },
        },
        kit.estimateSwap.bind(kit)
      );
    },
    [adapter, quote]
  );

  /**
   * Cross-chain USDC via CCTP.
   *
   * Both ends need an adapter: verified against the SDK, passing only
   * `{ chain, recipientAddress }` for the destination fails validation with
   * "to: Invalid input".
   */
  const quoteBridge = useCallback(
    (args: { from: ArcChain; to: ArcChain; amount: string; recipient?: string }) => {
      const kit = getKit();
      return quote(
        {
          kind: 'bridge',
          chain: args.from,
          params: {
            from: { adapter, chain: args.from.id },
            to: {
              adapter,
              chain: args.to.id,
              ...(args.recipient ? { recipientAddress: args.recipient } : {}),
            },
            amount: args.amount,
          },
        },
        kit.estimateBridge.bind(kit)
      );
    },
    [adapter, quote]
  );

  const isBusy =
    state.stage === 'quoting' ||
    state.stage === 'awaitingSignature' ||
    state.stage === 'pending';

  return {
    state,
    isBusy,
    /** True when a quote is on screen awaiting the user's decision. */
    hasQuote: state.stage === 'quoted',
    quoteSend,
    quoteSwap,
    quoteBridge,
    submit,
    cancelQuote,
    reset,
  };
}
