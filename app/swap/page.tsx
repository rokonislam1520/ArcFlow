'use client';
/**
 * Swap — same-chain token swap through App Kit's routing.
 *
 * Chains come from `getSupportedChains('swap')`, so this page never offers a
 * swap on a chain that has no route. The previous version priced swaps from a
 * hardcoded table; quotes now come from `estimateSwap`.
 */
import { useMemo, useState } from 'react';
import { parseUnits, type Address } from 'viem';
import { getChainTokens, getEnvChains } from '@/lib/chains';
import { useNetworkMode } from '@/lib/network';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { useChainBalances } from '@/lib/useBalances';
import { useAppKitOps } from '@/lib/useAppKitOps';
import { OpStatus } from '@/components/OpStatus';

export default function SwapPage() {
  const { address, adapter, switchChain } = useWallet();
  const activeChain = useActiveChain();
  const { isTestnet } = useNetworkMode();
  const { state, isBusy, hasQuote, quoteSwap, submit, cancelQuote, reset } = useAppKitOps();

  // Only chains App Kit can actually swap on.
  const swapChains = useMemo(() => getEnvChains(isTestnet, 'swap'), [isTestnet]);
  const canSwapHere = swapChains.some((c) => c.id === activeChain.id);

  const { balances, refresh } = useChainBalances(activeChain, address as Address | null);

  const tokens = useMemo(
    () => getChainTokens(activeChain).filter((t) => t !== 'NATIVE'),
    [activeChain]
  );

  const [tokenIn, setTokenIn] = useState('USDC');
  const [tokenOut, setTokenOut] = useState('EURC');
  const [amountIn, setAmountIn] = useState('');

  const inToken = tokens.includes(tokenIn as never) ? tokenIn : tokens[0] ?? 'USDC';
  const outToken =
    tokens.find((t) => t === tokenOut && t !== inToken) ?? tokens.find((t) => t !== inToken) ?? '';

  const balance = balances.find((b) => b.symbol === inToken);

  const validationError = useMemo(() => {
    if (!address) return 'Connect your wallet.';
    if (!canSwapHere) return `Swaps are not available on ${activeChain.label}.`;
    if (!outToken) return 'This chain has only one swappable token.';
    if (!amountIn) return null;
    const n = Number(amountIn);
    if (!Number.isFinite(n) || n <= 0) return 'Enter an amount greater than zero.';
    if (balance) {
      try {
        if (parseUnits(amountIn, balance.decimals) > balance.raw) {
          return `Insufficient ${inToken}. You have ${balance.formatted}.`;
        }
      } catch {
        return 'Too many decimal places.';
      }
    }
    return null;
  }, [address, canSwapHere, activeChain.label, outToken, amountIn, balance, inToken]);

  const canSubmit =
    !!address && !!adapter && !!amountIn && !validationError && !isBusy && !hasQuote;

  /** Step 1: real quote from App Kit, including the minimum received. */
  async function onQuote() {
    if (!canSubmit) return;
    await quoteSwap({ chain: activeChain, tokenIn: inToken, tokenOut: outToken, amountIn });
  }

  async function onConfirm() {
    const result = await submit();
    if (result) {
      setAmountIn('');
      void refresh();
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-1">Swap</h1>
      <p className="text-slate-400 text-sm mb-8">
        Swapping on <span className="text-arc-400">{activeChain.label}</span>
      </p>

      {!canSwapHere && (
        <div className="glass p-4 mb-6 text-sm">
          <p className="text-amber-300 mb-3">
            App Kit has no swap routes on {activeChain.label}. Switch to a chain that supports
            swaps:
          </p>
          <div className="flex flex-wrap gap-2">
            {swapChains.slice(0, 6).map((c) => (
              <button
                key={c.id}
                onClick={() => void switchChain(c)}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="glass p-6 space-y-5">
        <div>
          <div className="flex justify-between text-sm text-slate-400 mb-2">
            <label>From</label>
            {balance && (
              <button
                onClick={() => setAmountIn(balance.formatted.replace(/,/g, ''))}
                className="text-arc-400 hover:underline"
              >
                Max: {balance.formatted}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="0.00"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-lg focus:border-arc-500 outline-none"
            />
            <select
              value={inToken}
              onChange={(e) => setTokenIn(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm outline-none focus:border-arc-500"
            >
              {tokens.map((t) => (
                <option key={t} value={t} className="bg-arc-dark">
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => {
              // Swap both sides so the pair stays valid.
              setTokenIn(outToken);
              setTokenOut(inToken);
            }}
            disabled={!outToken}
            className="w-9 h-9 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center disabled:opacity-40"
            aria-label="Reverse tokens"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">To</label>
          <select
            value={outToken}
            onChange={(e) => setTokenOut(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-arc-500"
          >
            {tokens
              .filter((t) => t !== inToken)
              .map((t) => (
                <option key={t} value={t} className="bg-arc-dark">
                  {t}
                </option>
              ))}
          </select>
          {/* No fabricated output estimate: the real quote comes from App Kit
              and is shown for approval before anything is signed. */}
          <p className="text-xs text-slate-500 mt-2">
            The exact rate and fees are quoted before you sign.
          </p>
        </div>

        {validationError && amountIn && <p className="text-sm text-amber-400">{validationError}</p>}

        {!hasQuote && state.stage !== 'success' && (
          <button
            onClick={onQuote}
            disabled={!canSubmit}
            className="btn-arc w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isBusy ? 'Working…' : 'Get quote'}
          </button>
        )}

        <OpStatus
          state={state}
          chain={activeChain}
          onConfirm={onConfirm}
          onCancel={cancelQuote}
        />

        {(state.stage === 'success' || state.stage === 'error') && !isBusy && (
          <button onClick={reset} className="w-full text-sm text-slate-400 hover:text-white">
            New swap
          </button>
        )}
      </div>
    </div>
  );
}
