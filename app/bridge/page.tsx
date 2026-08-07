'use client';
/**
 * Bridge — cross-chain USDC over CCTP, driven by Arc App Kit.
 *
 * Both source and destination are user-selected from the SDK's own chain list.
 * Selecting a new source immediately triggers a wallet network-switch request.
 * If the wallet is already on that chain the request is a no-op. After the
 * switch (or skip), balances and the destination chain list refresh
 * automatically because they both derive from the selected source.
 *
 * Nothing about available routes is hardcoded: bridgeChains is whatever
 * getSupportedChains('bridge') returns for the current network mode.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAddress, parseUnits, type Address } from 'viem';
import { getEnvChains, type ArcChain } from '@/lib/chains';
import { useNetworkMode } from '@/lib/network';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { useChainBalances } from '@/lib/useBalances';
import { useAppKitOps } from '@/lib/useAppKitOps';
import { useOpNotifications } from '@/lib/notifications';
import { OpStatus } from '@/components/OpStatus';

// Small arrow icon so we can avoid an icon dependency.
function ArrowRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

function SwapIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 7h14M14 3l4 4-4 4M17 13H3M6 9l-4 4 4 4" />
    </svg>
  );
}

function ChainSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
  sublabel,
}: {
  id: string;
  label: string;
  value: string;
  options: ArcChain[];
  onChange: (chain: ArcChain) => void;
  disabled?: boolean;
  sublabel?: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const next = options.find((c) => c.id === e.target.value);
          if (next) onChange(next);
        }}
        disabled={disabled || options.length === 0}
        className="w-full px-3 py-2.5 rounded-xl bg-black/25 border border-white/10 text-sm text-white
                   hover:border-white/[0.14]
                   focus:border-arc-500/50 focus:bg-black/35 focus:ring-[3px] focus:ring-arc-500/[0.12]
                   transition-all duration-200 outline-none
                   disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {options.map((c) => (
          <option key={c.id} value={c.id} className="bg-[#0e1117]">
            {c.label}
          </option>
        ))}
        {options.length === 0 && (
          <option value="" disabled>
            No chains available
          </option>
        )}
      </select>
      {sublabel && <p className="mt-1 text-xs text-slate-500">{sublabel}</p>}
    </div>
  );
}

export default function BridgePage() {
  const { address, switchChain, error: walletError, clearError, chainId } = useWallet();
  const activeChain = useActiveChain();
  const { isTestnet } = useNetworkMode();
  const { state, isBusy, hasQuote, quoteBridge, submit, cancelQuote, reset } = useAppKitOps();

  // All chains App Kit can bridge USDC from/to in the current network mode.
  const bridgeChains = useMemo(
    () => getEnvChains(isTestnet, 'bridge').filter((c) => c.type === 'evm' && c.tokens.USDC),
    [isTestnet]
  );

  // Source chain — user-selected, but initialises from the wallet's active chain.
  // When the wallet is not on any bridge chain, fall back to the first available.
  const defaultSource = useMemo(() => {
    const walletMatch = bridgeChains.find((c) => c.id === activeChain.id);
    return walletMatch ?? bridgeChains[0] ?? null;
  }, [bridgeChains, activeChain.id]);

  const [source, setSource] = useState<ArcChain | null>(defaultSource);
  // Network-switch request is in flight (wallet popup open).
  const [switching, setSwitching] = useState(false);

  /**
   * Follow the wallet's chain.
   *
   * This fires both when the wallet honours a switch we requested and when the
   * user changes network in MetaMask directly. Both are treated identically on
   * purpose: bridging can only burn on the chain the wallet is actually on, so
   * a source selection that disagrees with the wallet is never actionable.
   * Mirroring the wallet keeps the dropdown describing reality.
   */
  useEffect(() => {
    const walletChain = bridgeChains.find((c) => c.id === activeChain.id);
    if (walletChain) {
      setSource((current) => (current?.id === walletChain.id ? current : walletChain));
    } else {
      // Wallet is on a chain that cannot bridge; keep a usable default selected
      // so the destination list and balances still have something to work from.
      setSource((current) => current ?? defaultSource);
    }
  }, [activeChain.id, bridgeChains, defaultSource]);

  // Valid destination chains: everything except the selected source.
  const destChains = useMemo(
    () => bridgeChains.filter((c) => c.id !== (source?.id ?? '')),
    [bridgeChains, source]
  );

  const [destination, setDestination] = useState<ArcChain | null>(null);

  // Keep destination valid when source changes.
  useEffect(() => {
    if (!destination || destination.id === source?.id) {
      setDestination(destChains[0] ?? null);
    }
  }, [source?.id, destChains, destination]);

  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [useCustomRecipient, setUseCustomRecipient] = useState(false);

  // Balances follow the selected source. Because the effect above keeps that in
  // step with the wallet, this re-reads on its own after a successful switch —
  // no explicit refresh call is needed at the switch site.
  const { balances, refresh } = useChainBalances(source, address as Address | null);
  const usdc = balances.find((b) => b.symbol === 'USDC');

  useOpNotifications(state, source ?? activeChain);

  /**
   * Handle source chain change.
   *
   * 1. Update local source selection immediately so the UI responds.
   * 2. If the wallet is already on this chain, do nothing extra.
   * 3. If not, request a network switch via the wallet's standard popup.
   *    - If the chain isn't in the wallet yet, `switchChain` adds it first.
   *    - If the user declines, the source selection reverts (UX stays honest).
   */
  const handleSourceChange = useCallback(
    async (next: ArcChain) => {
      setSource(next);
      clearError();

      // Already on the requested chain; nothing to do.
      const walletAlreadyOnChain =
        next.chainId !== undefined && chainId === next.chainId;
      if (walletAlreadyOnChain || !address) return;

      setSwitching(true);
      try {
        // switchChain reports failure by returning false rather than throwing;
        // it surfaces the reason through the wallet `error` field itself.
        const ok = await switchChain(next);
        if (!ok) {
          // Declined or failed. Roll the selection back to the chain the wallet
          // is really on, so the form does not claim a network we never reached.
          setSource(
            bridgeChains.find((c) => c.id === activeChain.id) ?? defaultSource
          );
        }
        // On success the wallet emits chainChanged and the effect above syncs.
      } finally {
        setSwitching(false);
      }
    },
    [address, chainId, switchChain, clearError, bridgeChains, activeChain.id, defaultSource]
  );

  /** Swap source and destination. Also triggers a network-switch if needed. */
  const handleSwapDirection = useCallback(async () => {
    if (!destination) return;
    const newSource = destination;
    const newDest = source;
    setDestination(newDest);
    await handleSourceChange(newSource);
  }, [destination, source, handleSourceChange]);

  const walletOnSelectedSource =
    !address || (source?.chainId !== undefined && chainId === source.chainId);

  const validationError = useMemo(() => {
    if (!address) return 'Connect your wallet.';
    if (!source) return 'No bridge chains available.';
    if (!destination) return 'Pick a destination chain.';
    if (!walletOnSelectedSource)
      return `Switch your wallet to ${source.label} to bridge from it.`;
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
    source,
    destination,
    walletOnSelectedSource,
    useCustomRecipient,
    recipient,
    amount,
    usdc,
  ]);

  const canSubmit =
    !!address &&
    !!source &&
    !!destination &&
    !!amount &&
    !validationError &&
    !isBusy &&
    !hasQuote &&
    !switching;

  async function onQuote() {
    if (!canSubmit || !source || !destination) return;
    await quoteBridge({
      from: source,
      to: destination,
      amount,
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

  const networkMismatch = address && !walletOnSelectedSource && !switching;

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      {/* Header */}
      <h1 className="text-3xl font-bold mb-1">Bridge</h1>
      <p className="text-slate-400 text-sm mb-8">
        Move USDC across chains via Circle CCTP.
      </p>

      {/* Network mismatch banner */}
      {networkMismatch && source && (
        <div className="mb-5 glass p-4 border border-amber-500/20 rounded-xl">
          <p className="text-amber-300 text-sm mb-2">
            Your wallet is on a different network. Switch to{' '}
            <strong>{source.label}</strong> to bridge from it.
          </p>
          <button
            onClick={() => void handleSourceChange(source)}
            className="px-3 py-1.5 text-xs rounded-lg bg-amber-500/15 border border-amber-500/30
                       hover:bg-amber-500/25 text-amber-200 transition-colors"
          >
            Switch to {source.label}
          </button>
        </div>
      )}

      {/* Wallet error banner (e.g. user declined) */}
      {walletError && (
        <div className="mb-5 glass p-3 border border-red-500/20 rounded-xl flex items-start gap-2">
          <span className="text-red-400 text-xs mt-0.5">⚠</span>
          <p className="text-red-300 text-sm flex-1">{walletError}</p>
          <button
            onClick={clearError}
            className="text-slate-500 hover:text-slate-300 text-xs shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <div className="glass p-6 space-y-5">

        {/* Chain selector row */}
        <div className="flex items-end gap-2">
          <ChainSelect
            id="bridge-source"
            label="From"
            value={source?.id ?? ''}
            options={bridgeChains}
            onChange={(c) => void handleSourceChange(c)}
            disabled={isBusy || switching}
            sublabel={
              switching
                ? 'Requesting network switch…'
                : usdc
                  ? `Balance: ${usdc.formatted} USDC`
                  : undefined
            }
          />

          {/* Direction swap */}
          <button
            onClick={() => void handleSwapDirection()}
            disabled={!destination || isBusy || switching}
            title="Swap direction"
            // Matches the swap page's toggle: same rotation, same easing, so the
            // two flows feel like one product.
            className="mb-6 p-2 rounded-2xl bg-slate-850 border border-white/10 text-slate-300
                       hover:bg-white/10 hover:border-arc-500/40 hover:text-arc-300 hover:rotate-180
                       active:scale-95
                       disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:rotate-0
                       shadow-card transition-all duration-300 ease-premium shrink-0"
            aria-label="Swap source and destination"
          >
            {switching ? (
              <span className="inline-block w-5 h-5 rounded-full border-2 border-slate-500 border-t-arc-400 animate-spin" />
            ) : (
              <SwapIcon className="w-5 h-5 text-slate-400" />
            )}
          </button>

          <ChainSelect
            id="bridge-destination"
            label="To"
            value={destination?.id ?? ''}
            options={destChains}
            onChange={setDestination}
            disabled={isBusy || switching || destChains.length === 0}
          />
        </div>

        {/* Route arrow (visual only, desktop) */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 -mt-2 -mb-1">
          <span className="truncate max-w-[120px]">{source?.label}</span>
          <ArrowRight className="w-4 h-4 shrink-0" />
          <span className="truncate max-w-[120px]">{destination?.label ?? '—'}</span>
          <span className="ml-auto text-arc-400 shrink-0">CCTP</span>
        </div>

        {/* Amount */}
        <div>
          <div className="flex justify-between text-sm text-slate-400 mb-2">
            <label htmlFor="bridge-amount">Amount (USDC)</label>
            {usdc && (
              <button
                onClick={() => setAmount(usdc.formatted.replace(/,/g, ''))}
                className="text-arc-400 hover:underline"
                tabIndex={-1}
              >
                Max: {usdc.formatted}
              </button>
            )}
          </div>
          <input
            id="bridge-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="0.00"
            disabled={isBusy}
            className="w-full bg-black/25 border border-white/10 rounded-xl px-4 py-3 text-lg text-white
                       tabular-nums hover:border-white/[0.14]
                       focus:border-arc-500/50 focus:bg-black/35 focus:ring-[3px] focus:ring-arc-500/[0.12]
                       transition-all duration-200 outline-none
                       disabled:opacity-40"
          />
        </div>

        {/* Custom recipient */}
        <div>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useCustomRecipient}
              onChange={(e) => setUseCustomRecipient(e.target.checked)}
              className="rounded border-white/20 bg-white/5 accent-arc-500"
            />
            Send to a different address
          </label>
          {useCustomRecipient && (
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              placeholder="0x…"
              spellCheck={false}
              className="mt-2 w-full bg-black/25 border border-white/10 rounded-xl px-4 py-3 text-white
                         font-mono text-sm hover:border-white/[0.14] transition-all duration-200
                         focus:border-arc-500/50 focus:bg-black/35 focus:ring-[3px] focus:ring-arc-500/[0.12]
                         outline-none"
            />
          )}
        </div>

        {/* Inline validation */}
        {validationError && amount && (
          <p className="text-sm text-amber-400">{validationError}</p>
        )}

        {/* Primary CTA */}
        {!hasQuote && state.stage !== 'success' && (
          <button
            onClick={onQuote}
            disabled={!canSubmit}
            className="btn-arc w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {switching
              ? 'Switching network…'
              : isBusy
                ? 'Working…'
                : 'Review bridge'}
          </button>
        )}

        {/* Info line */}
        <p className="text-xs text-slate-500 leading-relaxed">
          Bridging burns USDC on{' '}
          <span className="text-slate-400">{source?.label ?? 'the source chain'}</span> and mints it on{' '}
          <span className="text-slate-400">{destination?.label ?? 'the destination'}</span> after
          Circle attests the transfer. Keep this tab open — the sequence takes a few minutes.
        </p>

        {/* Op status (quote review + submit) */}
        <OpStatus
          state={state}
          chain={source ?? activeChain}
          onConfirm={onConfirm}
          onCancel={cancelQuote}
        />

        {(state.stage === 'success' || state.stage === 'error') && !isBusy && (
          <button onClick={reset} className="w-full text-sm text-slate-400 hover:text-white">
            New bridge
          </button>
        )}
      </div>

      {/* Unsupported chains note */}
      <div className="mt-6 text-xs text-slate-600 space-y-0.5">
        <p>Only networks supported by Circle CCTP appear in the list above.</p>
        <p>BNB Chain is not a CCTP domain and cannot be routed to.</p>
      </div>
    </div>
  );
}
