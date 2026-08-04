'use client';
/**
 * Bridge — cross-chain USDC over CCTP, driven entirely by App Kit.
 *
 * App Kit performs the burn on the source chain, waits for Circle's
 * attestation, and mints on the destination. Both chain lists come from
 * `getSupportedChains('bridge')`, so an unsupported route can't be selected.
 */
import { useEffect, useMemo, useState } from 'react';
import { isAddress, parseUnits, type Address } from 'viem';
import { getEnvChains, type ArcChain } from '@/lib/chains';
import { useNetworkMode } from '@/lib/network';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { useChainBalances } from '@/lib/useBalances';
import { useAppKitOps } from '@/lib/useAppKitOps';
import { OpStatus } from '@/components/OpStatus';

export default function BridgePage() {
  const { address, adapter, switchChain } = useWallet();
  const activeChain = useActiveChain();
  const { isTestnet } = useNetworkMode();
  const { state, isBusy, hasQuote, quoteBridge, submit, cancelQuote, reset } = useAppKitOps();

  // Bridge requires USDC on both ends.
  const bridgeChains = useMemo(
    () => getEnvChains(isTestnet, 'bridge').filter((c) => c.type === 'evm' && c.tokens.USDC),
    [isTestnet]
  );

  const [destination, setDestination] = useState<ArcChain | null>(null);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [useCustomRecipient, setUseCustomRecipient] = useState(false);

  // Default the destination to the first chain that isn't the source.
  useEffect(() => {
    if (!destination || destination.id === activeChain.id) {
      setDestination(bridgeChains.find((c) => c.id !== activeChain.id) ?? null);
    }
  }, [activeChain.id, bridgeChains, destination]);

  const { balances, refresh } = useChainBalances(activeChain, address as Address | null);
  const usdc = balances.find((b) => b.symbol === 'USDC');

  const sourceSupported = bridgeChains.some((c) => c.id === activeChain.id);

  const validationError = useMemo(() => {
    if (!address) return 'Connect your wallet.';
    if (!sourceSupported) return `${activeChain.label} cannot bridge USDC.`;
    if (!destination) return 'Pick a destination chain.';
    if (useCustomRecipient && recipient && !isAddress(recipient)) {
      return 'Recipient is not a valid address.';
    }
    if (!amount) return null;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 'Enter an amount greater than zero.';
    if (usdc) {
      try {
        if (parseUnits(amount, usdc.decimals) > usdc.raw) {
          return `Insufficient USDC. You have ${usdc.formatted}.`;
        }
      } catch {
        return 'Too many decimal places.';
      }
    }
    return null;
  }, [
    address,
    sourceSupported,
    activeChain.label,
    destination,
    useCustomRecipient,
    recipient,
    amount,
    usdc,
  ]);

  const canSubmit =
    !!address &&
    !!adapter &&
    !!destination &&
    !!amount &&
    !validationError &&
    !isBusy &&
    !hasQuote;

  /**
   * Step 1: quote the route. This reveals gas on both chains, which is the
   * whole point of quoting a bridge before committing.
   */
  async function onQuote() {
    if (!canSubmit || !destination) return;
    await quoteBridge({
      from: activeChain,
      to: destination,
      amount,
      // Omitted when unchecked so App Kit defaults to the sender's own address.
      recipient: useCustomRecipient && recipient ? recipient : undefined,
    });
  }

  async function onConfirm() {
    const result = await submit();
    if (result) {
      setAmount('');
      void refresh();
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-1">Bridge</h1>
      <p className="text-slate-400 text-sm mb-8">
        Move USDC across chains over Circle CCTP.
      </p>

      {!sourceSupported && (
        <div className="glass p-4 mb-6 text-sm">
          <p className="text-amber-300 mb-3">
            Bridging is not available from {activeChain.label}. Switch to a supported source chain:
          </p>
          <div className="flex flex-wrap gap-2">
            {bridgeChains.slice(0, 6).map((c) => (
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-400 mb-2">From</label>
            <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm">
              {activeChain.label}
            </div>
            <p className="text-xs text-slate-500 mt-1">Set by your wallet</p>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-2">To</label>
            <select
              value={destination?.id ?? ''}
              onChange={(e) =>
                setDestination(bridgeChains.find((c) => c.id === e.target.value) ?? null)
              }
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm outline-none focus:border-arc-500"
            >
              {bridgeChains
                .filter((c) => c.id !== activeChain.id)
                .map((c) => (
                  <option key={c.id} value={c.id} className="bg-arc-dark">
                    {c.label}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm text-slate-400 mb-2">
            <label>Amount (USDC)</label>
            {usdc && (
              <button
                onClick={() => setAmount(usdc.formatted.replace(/,/g, ''))}
                className="text-arc-400 hover:underline"
              >
                Max: {usdc.formatted}
              </button>
            )}
          </div>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="0.00"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-lg focus:border-arc-500 outline-none"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={useCustomRecipient}
              onChange={(e) => setUseCustomRecipient(e.target.checked)}
              className="rounded border-white/20 bg-white/5"
            />
            Send to a different address
          </label>
          {useCustomRecipient && (
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              placeholder="0x…"
              spellCheck={false}
              className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-mono text-sm focus:border-arc-500 outline-none"
            />
          )}
        </div>

        {validationError && amount && <p className="text-sm text-amber-400">{validationError}</p>}

        {!hasQuote && state.stage !== 'success' && (
          <button
            onClick={onQuote}
            disabled={!canSubmit}
            className="btn-arc w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isBusy ? 'Working…' : 'Review bridge'}
          </button>
        )}

        {/* Attestation takes time; saying so avoids the impression of failure.
            App Kit's bridge() waits for it, so the call itself is long-running. */}
        <p className="text-xs text-slate-500">
          Bridging burns USDC on {activeChain.label} and mints it on{' '}
          {destination?.label ?? 'the destination'} after Circle attests the transfer. Keep this tab
          open: the whole sequence can take several minutes.
        </p>

        <OpStatus
          state={state}
          chain={activeChain}
          onConfirm={onConfirm}
          onCancel={cancelQuote}
        />

        {(state.stage === 'success' || state.stage === 'error') && !isBusy && (
          <button onClick={reset} className="w-full text-sm text-slate-400 hover:text-white">
            New bridge
          </button>
        )}
      </div>
    </div>
  );
}
