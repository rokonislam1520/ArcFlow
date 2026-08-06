'use client';
/**
 * Swap — a Sell card above a Buy card, with the direction toggle floating
 * between them, following the reference design.
 *
 * Everything shown is real: balances come from chain RPCs, prices from App
 * Kit's rate service, and the received amount, minimum, and fees come from
 * `estimateSwap`. Where a figure genuinely is not available it says so instead
 * of showing a plausible-looking number:
 *
 *  - The Buy amount stays empty until a quote returns. Multiplying by a spot
 *    price would display an amount the route never promised.
 *  - Price impact needs a market price for both sides; without one it is
 *    reported as uncomputable rather than as 0%.
 *  - Route venue and confirmation time are not in App Kit's estimate, so they
 *    are labelled as undisclosed rather than guessed.
 *
 * Swaps settle on one chain, so the pair is always kept on a single chain and
 * the wallet is asked to switch when it is elsewhere.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { parseUnits, type Address } from 'viem';
import { useNetworkMode } from '@/lib/network';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { useChainBalances } from '@/lib/useBalances';
import { useAppKitOps } from '@/lib/useAppKitOps';
import { useOpNotifications } from '@/lib/notifications';
import { useRates, rateFor, nativeRate } from '@/lib/rates';
import { formatUSD } from '@/lib/portfolio';
import { OpStatus } from '@/components/OpStatus';
import { TokenSelector } from '@/components/TokenSelector';
import {
  type SwapToken,
  useTokenUniverse,
  tokensForChain,
  defaultPair,
  tokenAccent,
  chainAccent,
} from '@/lib/swapTokens';

export default function SwapPage() {
  const { address, adapter, switchChain, connect, wallets, wallet } = useWallet();
  const activeChain = useActiveChain();
  const { isTestnet } = useNetworkMode();
  const { state, isBusy, hasQuote, quoteSwap, submit, cancelQuote, reset } = useAppKitOps();

  useOpNotifications(state, activeChain);

  const universe = useTokenUniverse(isTestnet);

  const [sell, setSell] = useState<SwapToken | null>(null);
  const [buy, setBuy] = useState<SwapToken | null>(null);
  const [amountIn, setAmountIn] = useState('');
  const [picking, setPicking] = useState<'sell' | 'buy' | null>(null);

  /**
   * Seed the pair once per network mode.
   *
   * Keyed on a ref rather than on whether the current pair looks valid: a chain
   * that offers only one routable token leaves one side null, and re-deriving
   * from validity would then set state on every render forever.
   */
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    const mode = isTestnet ? 'testnet' : 'mainnet';
    if (seededFor.current === mode || universe.length === 0) return;
    seededFor.current = mode;

    const base = universe.some((t) => t.chain.id === activeChain.id)
      ? activeChain
      : universe[0].chain;
    const pair = defaultPair(base);
    setSell(pair.sell ?? null);
    setBuy(pair.buy ?? null);
    setAmountIn('');
  }, [isTestnet, universe, activeChain]);

  // The chain the swap would execute on. Both sides are always on it.
  const pairChain = sell?.chain ?? activeChain;
  const needsChainSwitch = !!address && pairChain.id !== activeChain.id;

  // Prices and balances are read for the pair's chain, not the wallet's, so
  // figures are correct before the user has switched networks.
  const { rates } = useRates(pairChain);
  const { balances, refresh } = useChainBalances(pairChain, address as Address | null);

  const priceOf = useCallback(
    (token: SwapToken | null): number | null => {
      if (!token) return null;
      const rate = token.isNative ? nativeRate(rates) : rateFor(rates, token.address);
      return rate?.priceUSD ?? null;
    },
    [rates]
  );

  const sellBalance = useMemo(
    () => balances.find((b) => b.symbol === sell?.symbol),
    [balances, sell]
  );

  /** Selecting on one side keeps the other side on the same chain. */
  const choose = useCallback(
    (side: 'sell' | 'buy', token: SwapToken) => {
      const counterpart = side === 'sell' ? buy : sell;
      const setSide = side === 'sell' ? setSell : setBuy;
      const setOther = side === 'sell' ? setBuy : setSell;

      setSide(token);

      if (counterpart && counterpart.chain.id !== token.chain.id) {
        // A pair spanning two chains is not a swap. Move the other side to a
        // token on the newly chosen chain rather than silently quoting a
        // route that cannot exist.
        const options = tokensForChain(token.chain).filter((t) => t.key !== token.key);
        setOther(options[0] ?? null);
      }
    },
    [buy, sell]
  );

  const flip = useCallback(() => {
    if (!sell || !buy) return;
    setSell(buy);
    setBuy(sell);
    setAmountIn('');
  }, [sell, buy]);

  /* ------------------------------------------------------- quote lifecycle */

  // A quote is only valid for the exact inputs it was requested with.
  const signature = `${sell?.key ?? ''}|${buy?.key ?? ''}|${amountIn}`;
  const quotedSignature = useRef<string | null>(null);

  useEffect(() => {
    if (quotedSignature.current !== null && quotedSignature.current !== signature) {
      // Inputs moved on. Drop the stale quote so "Confirm" can never submit an
      // amount the user is no longer looking at.
      quotedSignature.current = null;
      reset();
    }
  }, [signature, reset]);

  const amountNumber = Number(amountIn);
  const amountValid = amountIn !== '' && Number.isFinite(amountNumber) && amountNumber > 0;

  const insufficient = useMemo(() => {
    if (!amountValid || !sellBalance) return false;
    try {
      return parseUnits(amountIn, sellBalance.decimals) > sellBalance.raw;
    } catch {
      return false;
    }
  }, [amountValid, amountIn, sellBalance]);

  const tooPrecise = useMemo(() => {
    if (!amountValid || !sellBalance) return false;
    try {
      parseUnits(amountIn, sellBalance.decimals);
      return false;
    } catch {
      return true;
    }
  }, [amountValid, amountIn, sellBalance]);

  const canQuote =
    !!address &&
    !!adapter &&
    !!sell &&
    !!buy &&
    amountValid &&
    !insufficient &&
    !tooPrecise &&
    !needsChainSwitch &&
    !isBusy &&
    !hasQuote;

  const onQuote = useCallback(async () => {
    if (!canQuote || !sell || !buy) return;
    const result = await quoteSwap({
      chain: pairChain,
      tokenIn: sell.alias,
      tokenOut: buy.alias,
      amountIn,
    });
    if (result) quotedSignature.current = signature;
  }, [canQuote, sell, buy, pairChain, amountIn, quoteSwap, signature]);

  const onConfirm = useCallback(async () => {
    const result = await submit();
    if (result) {
      setAmountIn('');
      quotedSignature.current = null;
      void refresh();
    }
  }, [submit, refresh]);

  /* ------------------------------------------------- figures from the quote */

  const quote = state.quote;
  const receivedAmount = quote?.output?.amount ?? null;

  const sellPrice = priceOf(sell);
  const buyPrice = priceOf(buy);

  const sellValueUSD = sellPrice !== null && amountValid ? amountNumber * sellPrice : null;
  const buyValueUSD =
    buyPrice !== null && receivedAmount !== null ? Number(receivedAmount) * buyPrice : null;

  /** Execution price implied by the quote: how much Buy per one Sell. */
  const executionPrice =
    receivedAmount !== null && amountValid ? Number(receivedAmount) / amountNumber : null;

  /**
   * Price impact against the market rate.
   *
   * Requires a quoted price for both sides. Without both, this is not
   * computable and is reported as such — a 0% would assert the trade moves the
   * market not at all, which we have no basis to claim.
   */
  const priceImpact =
    sellValueUSD !== null && buyValueUSD !== null && sellValueUSD > 0
      ? (buyValueUSD - sellValueUSD) / sellValueUSD
      : null;

  /** Slippage the route itself allows, from its stop limit. */
  const slippage = useMemo(() => {
    const out = Number(quote?.output?.amount);
    const min = Number(quote?.minOutput?.amount);
    if (!Number.isFinite(out) || !Number.isFinite(min) || out <= 0) return null;
    return (out - min) / out;
  }, [quote]);

  /* ------------------------------------------------------------ call to action */

  const cta = useMemo(() => {
    if (!address) return { label: 'Connect Wallet', action: () => void connect(), disabled: false };
    if (!sell || !buy) return { label: 'Select Token', action: () => setPicking('sell'), disabled: false };
    if (needsChainSwitch)
      return {
        label: `Switch to ${pairChain.label}`,
        action: () => void switchChain(pairChain),
        disabled: false,
      };
    if (!amountValid) return { label: 'Enter Amount', action: undefined, disabled: true };
    if (tooPrecise) return { label: 'Too many decimals', action: undefined, disabled: true };
    if (insufficient)
      return { label: `Insufficient ${sell.symbol}`, action: undefined, disabled: true };
    if (isBusy) return { label: 'Working…', action: undefined, disabled: true };
    if (hasQuote) return { label: 'Confirm Swap', action: onConfirm, disabled: false };
    return { label: 'Get Quote', action: onQuote, disabled: !canQuote };
  }, [
    address,
    connect,
    sell,
    buy,
    needsChainSwitch,
    pairChain,
    switchChain,
    amountValid,
    tooPrecise,
    insufficient,
    isBusy,
    hasQuote,
    onConfirm,
    onQuote,
    canQuote,
  ]);

  return (
    <div className="min-h-screen px-4 py-8 sm:py-12">
      <div className="max-w-[480px] mx-auto">
        <header className="flex items-end justify-between mb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Swap</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Settles on <span className="text-arc-400">{pairChain.label}</span>
            </p>
          </div>
          <WalletChip
            address={address}
            walletName={wallet?.name}
            multiple={wallets.length > 1}
            onClick={() => void connect()}
          />
        </header>

        {/* Sell */}
        <div className="relative">
          <AssetCard
            label="Sell"
            token={sell}
            onPickToken={() => setPicking('sell')}
            amount={
              <input
                value={amountIn}
                onChange={(e) => {
                  // One dot, digits only: a malformed amount would be rejected
                  // by parseUnits later with a far less obvious message.
                  const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                  const parts = cleaned.split('.');
                  setAmountIn(
                    parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned
                  );
                }}
                inputMode="decimal"
                placeholder="0"
                aria-label="Amount to sell"
                className="w-full bg-transparent text-4xl sm:text-[42px] font-semibold tracking-tight outline-none placeholder:text-slate-700 tabular-nums"
              />
            }
            subValue={
              sellValueUSD !== null ? (
                formatUSD(sellValueUSD)
              ) : amountValid ? (
                <span title="No price quote for this token">Unpriced</span>
              ) : (
                formatUSD(0)
              )
            }
            footer={
              sellBalance ? (
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">
                    Balance {sellBalance.formatted} {sell?.symbol}
                  </span>
                  <button
                    onClick={() => setAmountIn(sellBalance.formatted.replace(/,/g, ''))}
                    className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-arc-300 bg-arc-500/15 hover:bg-arc-500/25 transition-colors"
                  >
                    MAX
                  </button>
                </div>
              ) : address ? (
                <span className="text-slate-600">No {sell?.symbol} on {pairChain.label}</span>
              ) : null
            }
          />

          {/* Direction toggle, floating over the seam between the cards. */}
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-5 z-10">
            <button
              onClick={flip}
              disabled={!sell || !buy}
              aria-label="Switch sell and buy"
              className="w-10 h-10 rounded-xl bg-slate-900 border border-white/10 hover:border-arc-500/40 hover:text-arc-300 shadow-lg flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0l-5-5m5 5l5-5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Buy */}
        <div className="mt-2">
          <AssetCard
            label="Buy"
            token={buy}
            onPickToken={() => setPicking('buy')}
            amount={
              <div className="text-4xl sm:text-[42px] font-semibold tracking-tight tabular-nums truncate">
                {receivedAmount ?? <span className="text-slate-700">0</span>}
              </div>
            }
            subValue={
              buyValueUSD !== null ? (
                formatUSD(buyValueUSD)
              ) : receivedAmount !== null ? (
                <span title="No price quote for this token">Unpriced</span>
              ) : (
                formatUSD(0)
              )
            }
            footer={
              receivedAmount === null ? (
                <span className="text-slate-600">
                  Quoted by the route, not estimated from a price.
                </span>
              ) : (
                <span className="text-slate-500">Estimated by App Kit</span>
              )
            }
          />
        </div>

        {/* Quote detail */}
        {quote && (
          <div className="glass-sm mt-3 p-4 space-y-2.5 text-xs animate-in">
            <Row label="Rate">
              {executionPrice !== null && sell && buy ? (
                <>
                  1 {sell.symbol} ={' '}
                  {executionPrice.toLocaleString('en-US', { maximumSignificantDigits: 8 })}{' '}
                  {buy.symbol}
                </>
              ) : (
                <Unknown>Not quoted</Unknown>
              )}
            </Row>

            <Row label="Price impact">
              {priceImpact === null ? (
                <Unknown>Needs a market price for both tokens</Unknown>
              ) : (
                <span
                  className={
                    priceImpact < -0.01
                      ? 'text-amber-300'
                      : priceImpact < 0
                        ? 'text-slate-300'
                        : 'text-mint-400'
                  }
                >
                  {(priceImpact * 100).toFixed(2)}%
                </span>
              )}
            </Row>

            <Row label="Max slippage">
              {slippage === null ? (
                <Unknown>Not disclosed</Unknown>
              ) : (
                `${(slippage * 100).toFixed(2)}%`
              )}
            </Row>

            <Row label="Minimum received">
              {quote.minOutput ? (
                `${quote.minOutput.amount} ${quote.minOutput.token}`
              ) : (
                <Unknown>Not disclosed</Unknown>
              )}
            </Row>

            <Row label="Route">
              Same-chain on {pairChain.label}
              <span className="text-slate-600"> · venue not disclosed</span>
            </Row>

            {quote.fees.length > 0 ? (
              quote.fees.map((fee, i) => (
                <Row key={`${fee.label}-${i}`} label={<span className="capitalize">{fee.label}</span>}>
                  {fee.amount} {fee.token}
                </Row>
              ))
            ) : (
              <Row label="Fees">
                <Unknown>No breakdown returned — not necessarily free</Unknown>
              </Row>
            )}

            <Row label="Confirmation time">
              <Unknown>Not provided by App Kit</Unknown>
            </Row>
          </div>
        )}

        {/* Warnings that must not be buried in the button label. */}
        {sell?.isNative && amountValid && (
          <Notice>
            {sell.symbol} pays for gas on {pairChain.label}. Selling the full balance will
            leave nothing to cover the transaction.
          </Notice>
        )}
        {sell && buy && sell.chain.id !== buy.chain.id && (
          <Notice>
            A swap settles on one chain. To move USDC between chains, use{' '}
            <Link href="/bridge" className="text-arc-400 hover:underline">
              Bridge
            </Link>
            .
          </Notice>
        )}

        {/* Primary action */}
        <button
          onClick={cta.action}
          disabled={cta.disabled}
          className="btn-arc w-full mt-4 py-4 text-base font-bold tracking-wide uppercase rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {cta.label}
        </button>

        <div className="mt-3">
          <OpStatus state={state} chain={pairChain} onConfirm={onConfirm} onCancel={cancelQuote} />
        </div>

        {(state.stage === 'success' || state.stage === 'error') && !isBusy && (
          <button
            onClick={() => {
              quotedSignature.current = null;
              reset();
            }}
            className="w-full mt-3 text-sm text-slate-400 hover:text-white"
          >
            New swap
          </button>
        )}
      </div>

      <TokenSelector
        isOpen={picking !== null}
        onClose={() => setPicking(null)}
        onSelect={(token) => picking && choose(picking, token)}
        exclude={picking === 'sell' ? (buy ?? undefined) : (sell ?? undefined)}
        title={picking === 'buy' ? 'Select token to buy' : 'Select token to sell'}
      />
    </div>
  );
}

/** One side of the trade. */
function AssetCard({
  label,
  token,
  amount,
  subValue,
  footer,
  onPickToken,
}: {
  label: string;
  token: SwapToken | null;
  amount: React.ReactNode;
  subValue: React.ReactNode;
  footer: React.ReactNode;
  onPickToken: () => void;
}) {
  return (
    <section className="glass p-5 rounded-3xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-400">{label}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">{amount}</div>
        <TokenPill token={token} onClick={onPickToken} />
      </div>

      <div className="flex items-center justify-between gap-3 mt-3 text-xs">
        <span className="text-slate-500 tabular-nums">{subValue}</span>
        <span className="text-right">{footer}</span>
      </div>
    </section>
  );
}

/** Token icon, chain badge, symbol and chain name — the reference's pill. */
function TokenPill({ token, onClick }: { token: SwapToken | null; onClick: () => void }) {
  if (!token) {
    return (
      <button
        onClick={onClick}
        className="shrink-0 flex items-center gap-2 pl-4 pr-3 py-3 rounded-2xl bg-arc-500/15 border border-arc-500/30 hover:bg-arc-500/25 transition-colors"
      >
        <span className="text-sm font-bold uppercase tracking-wide text-arc-200">
          Select token
        </span>
        <Chevron />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="shrink-0 flex items-center gap-2.5 pl-2 pr-2.5 py-2 rounded-2xl bg-white/[0.06] border border-white/10 hover:bg-white/[0.1] hover:border-arc-500/30 transition-colors"
    >
      <span className="relative shrink-0">
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
          style={{ backgroundColor: tokenAccent(token) }}
        >
          {token.symbol.slice(0, 4)}
        </span>
        <span
          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-slate-900 flex items-center justify-center text-[7px] font-bold text-white"
          style={{ backgroundColor: chainAccent(token.chain) }}
          aria-hidden
        >
          {token.chain.label.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase()}
        </span>
      </span>
      <span className="text-left leading-tight">
        <span className="block text-sm font-bold">{token.symbol}</span>
        <span className="block text-[11px] text-slate-500 max-w-[92px] truncate">
          {token.chain.label}
        </span>
      </span>
      <Chevron />
    </button>
  );
}

function Chevron() {
  return (
    <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

/**
 * The connected account.
 *
 * Swaps return the bought token to the account that sold, so there is no
 * separate destination to choose; this names the one account involved. It
 * opens the wallet picker only when more than one wallet was discovered.
 */
function WalletChip({
  address,
  walletName,
  multiple,
  onClick,
}: {
  address: string | null;
  walletName?: string;
  multiple: boolean;
  onClick: () => void;
}) {
  if (!address) {
    return (
      <button onClick={onClick} className="text-sm font-semibold text-arc-400 hover:text-arc-300">
        Select wallet
      </button>
    );
  }
  return (
    <button
      onClick={multiple ? onClick : undefined}
      title={multiple ? 'Switch wallet' : walletName}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/10 text-xs ${
        multiple ? 'hover:bg-white/10' : 'cursor-default'
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-mint-400" />
      <span className="font-mono">
        {address.slice(0, 6)}…{address.slice(-4)}
      </span>
      {multiple && <Chevron />}
    </button>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-300 text-right tabular-nums">{children}</span>
    </div>
  );
}

/** Marks a figure the SDK did not supply, so it reads as absent, not as zero. */
function Unknown({ children }: { children: React.ReactNode }) {
  return <span className="text-slate-600">{children}</span>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-xs text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl px-3 py-2.5">
      {children}
    </p>
  );
}
