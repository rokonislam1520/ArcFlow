'use client';

import { useCallback, useState } from 'react';
import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  type Abi,
  type WalletClient,
} from 'viem';
import { arcChain, erc20Abi } from './config';
import { publicClient } from './useWallet';

export type TxPhase =
  | 'idle'
  | 'awaiting-approval-signature' // ERC20 approve sitting in the wallet
  | 'approving' // approve mined-pending
  | 'awaiting-signature' // main tx sitting in the wallet
  | 'pending' // main tx submitted, waiting for receipt
  | 'confirmed'
  | 'failed';

export interface TxState {
  phase: TxPhase;
  hash: `0x${string}` | null;
  approvalHash: `0x${string}` | null;
  error: string | null;
}

const IDLE: TxState = { phase: 'idle', hash: null, approvalHash: null, error: null };

/**
 * Turns viem/provider errors into messages a user can act on.
 *
 * Covers the cases the UI must distinguish: rejection, wrong network,
 * insufficient balance/allowance, an explicit contract revert, and
 * everything else.
 */
export function describeTxError(err: unknown): string {
  // User rejected - MetaMask sends 4001
  if (err instanceof UserRejectedRequestError) {
    return 'Transaction rejected in wallet.';
  }
  const code = (err as any)?.code ?? (err as any)?.cause?.code;
  if (code === 4001) return 'Transaction rejected in wallet.';
  if (code === 4902) return 'Network not available in wallet. Add it and retry.';

  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const reason =
        reverted.data?.errorName ?? reverted.reason ?? reverted.shortMessage;
      // Map the contracts' own require() strings to plain language.
      if (reason) {
        const known: Record<string, string> = {
          'Below minimum': 'Amount is below the $1.00 minimum transfer.',
          'Transfer failed': 'Token transfer failed. Check your balance and allowance.',
          'Slippage exceeded': 'Price moved beyond your slippage tolerance. Try again.',
          'Insufficient liquidity': 'Not enough liquidity in this pool.',
          'Pool not found': 'No liquidity pool exists for this token pair.',
          'Merchant not active': 'That merchant is not accepting payments.',
          'Already paid': 'Your share is already settled.',
          'Not a member': 'You are not a member of this split.',
          Expired: 'Transaction deadline passed. Try again.',
          'Zero amount': 'Enter an amount greater than zero.',
        };
        return known[reason] ?? `Transaction reverted: ${reason}`;
      }
      return 'Transaction reverted by the contract.';
    }

    const msg = err.shortMessage ?? err.message;
    if (/insufficient funds/i.test(msg)) {
      return 'Insufficient balance to cover the transaction and gas.';
    }
    if (/chain|network/i.test(msg) && /mismatch|does not match/i.test(msg)) {
      return 'Wallet is on the wrong network.';
    }
    return msg;
  }

  const message = (err as any)?.shortMessage ?? (err as any)?.message;
  if (typeof message === 'string' && message.length > 0) {
    if (/insufficient funds/i.test(message)) {
      return 'Insufficient balance to cover the transaction and gas.';
    }
    return message;
  }
  return 'Transaction failed.';
}

export interface WriteArgs {
  address: `0x${string}`;
  abi: Abi | readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  /**
   * When set, the token is approved for `spender` before the main call, but
   * only if the current allowance is short.
   */
  approval?: {
    token: `0x${string}`;
    spender: `0x${string}`;
    amount: bigint;
  };
}

/**
 * Runs a contract write through the wallet and tracks its full lifecycle.
 *
 * Every write is simulated first, so a revert surfaces as a readable error
 * before the user is asked to sign.
 */
export function useTransaction(onConfirmed?: () => void) {
  const [state, setState] = useState<TxState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  const execute = useCallback(
    async (
      walletClient: WalletClient | null,
      account: `0x${string}` | '',
      args: WriteArgs
    ): Promise<boolean> => {
      if (!walletClient || !account) {
        setState({ ...IDLE, phase: 'failed', error: 'Connect your wallet first.' });
        return false;
      }

      setState({ ...IDLE });

      try {
        // ---- Step 1: allowance, if this call moves tokens ----
        let approvalHash: `0x${string}` | null = null;
        if (args.approval) {
          const { token, spender, amount } = args.approval;
          const allowance = (await publicClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [account, spender],
          })) as bigint;

          if (allowance < amount) {
            setState((s) => ({ ...s, phase: 'awaiting-approval-signature' }));
            approvalHash = await walletClient.writeContract({
              address: token,
              abi: erc20Abi,
              functionName: 'approve',
              args: [spender, amount],
              account,
              chain: arcChain,
            });
            setState((s) => ({ ...s, phase: 'approving', approvalHash }));

            const approvalReceipt = await publicClient.waitForTransactionReceipt({
              hash: approvalHash,
            });
            if (approvalReceipt.status !== 'success') {
              setState({
                phase: 'failed',
                hash: null,
                approvalHash,
                error: 'Token approval failed on-chain.',
              });
              return false;
            }
          }
        }

        // ---- Step 2: simulate so reverts are caught before signing ----
        const { request } = await publicClient.simulateContract({
          address: args.address,
          abi: args.abi as Abi,
          functionName: args.functionName,
          args: args.args as any,
          account,
        });

        // ---- Step 3: sign + submit (this opens MetaMask) ----
        setState((s) => ({ ...s, phase: 'awaiting-signature', approvalHash }));
        const hash = await walletClient.writeContract({
          ...request,
          account,
          chain: arcChain,
        } as any);

        setState((s) => ({ ...s, phase: 'pending', hash, approvalHash }));

        // ---- Step 4: wait for inclusion ----
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') {
          setState({
            phase: 'failed',
            hash,
            approvalHash,
            error: 'Transaction reverted on-chain.',
          });
          return false;
        }

        setState({ phase: 'confirmed', hash, approvalHash, error: null });
        onConfirmed?.();
        return true;
      } catch (err) {
        setState((s) => ({
          phase: 'failed',
          hash: s.hash,
          approvalHash: s.approvalHash,
          error: describeTxError(err),
        }));
        return false;
      }
    },
    [onConfirmed]
  );

  const isBusy =
    state.phase !== 'idle' &&
    state.phase !== 'confirmed' &&
    state.phase !== 'failed';

  return { state, execute, reset, isBusy };
}
