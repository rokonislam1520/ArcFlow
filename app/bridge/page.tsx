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
 *
 * Layout note: the two-panel form (send card, circular switch, receive card)
 * is presentation only. Every value, handler, and guard below is the same one
 * the previous single-column form used.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAddress, parseUnits, type Address } from 'viem';
import { getEnvChains, type ArcChain } from '@/lib/chains';
import { useNetworkMode } from '@/lib/network';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { useChainBalances } from '@/lib/useBalances';
import { useAppKitOps } from '@/lib/useAppKitOps';
import { useOpNotifications } from '@/lib/notifications';
import { OpStatus } from '@/components/OpStatus';
import { ChainMark, TokenMark } from '@/components/BrandMark';
import { tokensForChain, type SwapToken } from '@/lib/swapTokens';

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
      <path d="M10 3v14M6 13l4 4 4-4" />
    </svg>
  );
}

function CaretIcon({ className }: { className?: string }) {
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
      <path d="M6 8l4 4 4-4" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 6.5A1.5 1.5 0 014.5 5h11A1.5 1.5 0 0117 6.5v7A1.5 1.5 0 0115.5 15h-11A1.5 1.5 0 013 13.5v-7z" />
      <path d="M13.5 10.5h.5" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

/**
 * Chain picker rendered as a logo chip with a popover list.
 *
 * Replaces the native <select> purely for looks; it calls the same onChange
 * with the same ArcChain the <select> resolved, so the network-switch path is
 * untouched. Keyboard users keep a real button, Escape closes, and the list
 * is a listbox with the current chain marked selected.
 */
function ChainChip({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: ArcChain | null;
  options: ArcChain[];
  onChange: (chain: ArcChain) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape. Both listeners are only attached while
  // the popover is open, so a closed chip costs nothing.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isDisabled = disabled || options.length === 0;

  return (
    <div className="relative" ref={wrapRef}>
      <span id={`${id}-label`} className="sr-only">
        {label} network
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isDisabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label`}
        className="group flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-full
                   bg-white/[0.06] border border-white/10 text-sm font-medium text-white
                   hover:bg-white/10 hover:border-white/20 active:scale-[0.98]
                   disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/[0.06]
                   shadow-card transition-all duration-200 ease-premium"
      >
        {value ? (
          <ChainMark chain={value} size={22} />
        ) : (
          <span className="w-[22px] h-[22px] rounded-full bg-white/10" />
        )}
        <span className="truncate max-w-[110px] sm:max-w-[140px]">
          {value?.label ?? 'Select'}
        </span>
        <CaretIcon
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-labelledby={`${id}-label`}
          className="absolute z-30 mt-2 left-0 w-60 max-h-72 overflow-y-auto
                     glass rounded-2xl border border-white/10 p-1.5
                     shadow-float animate-in"
        >
          {options.map((c) => {
            const selected = c.id === value?.id;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setOpen(false);
                  onChange(c);
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-sm
                            transition-colors duration-150
                            ${
                              selected
                                ? 'bg-arc-500/12 text-white'
                                : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
                            }`}
              >
                <ChainMark chain={c} size={22} />
                <span className="flex-1 truncate">{c.label}</span>
                {selected && <CheckIcon className="w-4 h-4 text-arc-400 shrink-0" />}
              </button>
            );
          })}
          {options.length === 0 && (
            <p className="px-2.5 py-3 text-sm text-slate-500">No chains available</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Token chip.
 *
 * Deliberately static. Bridging here is USDC over Circle CCTP — the chain list
 * itself is filtered to chains with a USDC address — so a picker offering other
 * assets would let someone choose a token the bridge cannot quote. The chip
 * matches the selector shape used elsewhere without implying a choice that
 * does not exist.
 */
function TokenChip({ token }: { token: SwapToken | null }) {
  return (
    <div
      title="Bridging is USDC-only over Circle CCTP"
      className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full
                 bg-white/[0.06] border border-white/10 shadow-card shrink-0"
    >
      {token ? (
        <TokenMark token={token} size={22} badge={false} />
      ) : (
        <span className="w-[22px] h-[22px] rounded-full bg-white/10" />
      )}
      <span className="text-sm font-semibold text-white">USDC</span>
    </div>
  );
}

/** USD line under each amount. USDC is dollar-denominated, so this is 1:1. */
function usdLine(amount: string): string {
  const n = Number(amount);
  if (!amount || !Number.isFinite(n)) return '$0.00';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
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
   * Mirroring the wallet keeps the chip describing reality.
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

  // Destination-side balance, shown so the user can see where funds land.
  const { balances: destBalances } = useChainBalances(destination, address as Address | null);
  const destUsdc = destBalances.find((b) => b.symbol === 'USDC');

  // USDC as a token record on each side, for the logo chips.
  const sourceToken = useMemo(
    () => (source ? tokensForChain(source).find((t) => t.alias === 'USDC') ?? null : null),
    [source]
  );
  const destToken = useMemo(
    () => (destination ? tokensForChain(destination).find((t) => t.alias === 'USDC') ?? null : null),
    [destination]
  );

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
    <div className="max-w-xl mx-auto px-4 py-10 sm:py-14">
      {/* Header */}
      <div className="mb-7">
        <h1 className="text-3xl font-bold mb-1">Bridge</h1>
        <p className="text-slate-400 text-sm">Move USDC across chains via Circle CCTP.</p>
      </div>

      {/* Network mismatch banner */}
      {networkMismatch && source && (
        <div className="mb-4 glass p-4 border border-amber-500/20 rounded-2xl">
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
        <div className="mb-4 glass p-3 border border-red-500/20 rounded-2xl flex items-start gap-2">
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

      {/* ---- Send panel ---- */}
      <section className="glass rounded-3xl p-5 sm:p-6" aria-label="Send">
        <div className="flex items-center justify-between gap-3 mb-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            From
          </span>
          <ChainChip
            id="bridge-source"
            label="From"
            value={source}
            options={bridgeChains}
            onChange={(c) => void handleSourceChange(c)}
            disabled={isBusy || switching}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="bridge-amount" className="sr-only">
              Amount in USDC
            </label>
            <input
              id="bridge-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="0.00"
              disabled={isBusy}
              className="w-full bg-transparent border-0 p-0 outline-none
                         text-[2rem] sm:text-[2.5rem] leading-none font-semibold tracking-tight
                         text-white tabular-nums placeholder:text-slate-600
                         disabled:opacity-40"
            />
          </div>
          <TokenChip token={sourceToken} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500 tabular-nums">{usdLine(amount)}</p>

          <div className="flex items-center gap-2 text-sm text-slate-400 min-w-0">
            <WalletIcon className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="tabular-nums truncate">
              {switching ? 'Switching…' : usdc ? usdc.formatted : '—'}
            </span>
            {usdc && (
              <button
                onClick={() => setAmount(usdc.formatted.replace(/,/g, ''))}
                className="px-2 py-0.5 rounded-md text-xs font-semibold
                           bg-arc-500/12 text-arc-300 border border-arc-500/25
                           hover:bg-arc-500/20 active:scale-95
                           transition-all duration-150 shrink-0"
              >
                MAX
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ---- Direction switch, seated on the seam between the panels ---- */}
      <div className="relative flex justify-center -my-4 z-10">
        <button
          onClick={() => void handleSwapDirection()}
          disabled={!destination || isBusy || switching}
          title="Swap direction"
          // The thick border matches the page background so the button reads as
          // a notch punched through the seam rather than a chip floating on it.
          className="w-12 h-12 grid place-items-center rounded-full
                     bg-slate-850 border-4 border-slate-975 text-slate-300
                     hover:text-arc-300 hover:bg-slate-800 hover:shadow-glow-arc
                     active:scale-95
                     disabled:opacity-40 disabled:cursor-not-allowed
                     shadow-float transition-all duration-300 ease-premium"
          aria-label="Swap source and destination"
        >
          {switching ? (
            <span className="w-5 h-5 rounded-full border-2 border-slate-600 border-t-arc-400 animate-spin" />
          ) : (
            <SwapIcon className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* ---- Receive panel ---- */}
      <section className="glass rounded-3xl p-5 sm:p-6" aria-label="Receive">
        <div className="flex items-center justify-between gap-3 mb-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            To
          </span>
          <ChainChip
            id="bridge-destination"
            label="To"
            value={destination}
            options={destChains}
            onChange={setDestination}
            disabled={isBusy || switching}
          />
        </div>

        <div className="flex items-center gap-3">
          <p
            className="min-w-0 flex-1 text-[2rem] sm:text-[2.5rem] leading-none font-semibold
                       tracking-tight tabular-nums truncate
                       text-white/90"
          >
            {amount || <span className="text-slate-600">0.00</span>}
          </p>
          <TokenChip token={destToken} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500 tabular-nums">{usdLine(amount)}</p>
          <div className="flex items-center gap-2 text-sm text-slate-400 min-w-0">
            <WalletIcon className="w-4 h-4 shrink-0 text-slate-500" />
            <span className="tabular-nums truncate">
              {destUsdc ? destUsdc.formatted : '—'}
            </span>
          </div>
        </div>
      </section>

      {/* ---- Options, validation, CTA ---- */}
      <div className="mt-5 space-y-4">
        {/* Custom recipient */}
        <div className="glass rounded-2xl p-4">
          <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer select-none">
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
              aria-label="Recipient address"
              className="mt-3 w-full bg-black/25 border border-white/10 rounded-xl px-4 py-3 text-white
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
            className="btn-arc w-full py-3.5 text-base disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {switching ? 'Switching network…' : isBusy ? 'Working…' : 'Review bridge'}
          </button>
        )}

        {/* Info line */}
        <p className="text-xs text-slate-500 leading-relaxed">
          Bridging burns USDC on{' '}
          <span className="text-slate-400">{source?.label ?? 'the source chain'}</span> and mints it
          on <span className="text-slate-400">{destination?.label ?? 'the destination'}</span> after
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
        <p>Only networks supported by Circle CCTP appear in the lists above.</p>
        <p>BNB Chain is not a CCTP domain and cannot be routed to.</p>
      </div>
    </div>
  );
}
