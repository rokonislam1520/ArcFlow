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
 *  - MAX only reserves gas once a quote has priced it. Before that there is no
 *    real gas figure to subtract, and a guessed reserve would silently withhold
 *    funds the user asked to trade.
 *
 * Swaps settle on one chain, so the pair is always kept on a single chain and
 * the wallet is asked to switch when it is elsewhere.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { formatUnits, parseUnits, type Address } from 'viem';
import { useNetworkMode } from '@/lib/network';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { useChainBalances } from '@/lib/useBalances';
import { useAppKitOps } from '@/lib/useAppKitOps';
import { useOpNotifications } from '@/lib/notifications';
import { useRates, rateFor, nativeRate } from '@/lib/rates';
import { nativeFeeTotal } from '@/lib/safety';
import { shortAddress } from '@/lib/profile';
import { useViewingAddress } from '@/lib/useViewingAddress';
import { OpStatus } from '@/components/OpStatus';
import { TokenSelector } from '@/components/TokenSelector';
import { TokenMark } from '@/components/BrandMark';
import {
  AmountDisplay,
  AmountValueLine,
  AMOUNT_TEXT_CLASS,
} from '@/components/swap/AmountDisplay';
import { WalletSelector } from '@/components/swap/WalletSelector';
import { SwapSettings, type SlippageMode } from '@/components/swap/SwapSettings';
import { chainDisplayName } from '@/lib/chainBrand';
import { DEFAULT_SLIPPAGE_BPS, bpsToFraction, bpsToPercentText } from '@/lib/slippage';
import {
  type SwapToken,
  useTokenUniverse,
  tokensForChain,
  defaultPair,
  routeOf,
} from '@/lib/swapTokens';


/**
 * Price impact thresholds, as fractions of the input's market value.
 *
 * These bound a figure derived from real prices on both sides (see
 * `priceImpact` below), and they describe the whole gap between market value and
 * quoted value — which includes fees, not just pool depth. Naming that honestly
 * matters: a 1.2% "impact" on a small stablecoin trade is usually the fee, and
 * telling the user their trade moved the market would be wrong.
 */
const IMPACT_CAUTION = 0.01;
const IMPACT_SEVERE = 0.05;


export default function SwapPage() {
  const { address, adapter, switchChain, connect, wallet } = useWallet();
  const activeChain = useActiveChain();
  const { isTestnet } = useNetworkMode();
  const { state, isBusy, hasQuote, quoteSwap, submit, cancelQuote, reset } = useAppKitOps();

  useOpNotifications(state, activeChain);

  const universe = useTokenUniverse(isTestnet);

  const [sell, setSell] = useState<SwapToken | null>(null);
  const [buy, setBuy] = useState<SwapToken | null>(null);
  const [amountIn, setAmountIn] = useState('');
  const [picking, setPicking] = useState<'sell' | 'buy' | null>(null);
  /*
   * Which unit each card leads with. Presentation only — the amount traded is
   * always `amountIn` in token units, whichever way these are set. Tracked per
   * side because the two sides answer different questions: "how much of this am
   * I giving up" and "what is that worth to me".
   */
  const [sellShowUsd, setSellShowUsd] = useState(false);
  const [buyShowUsd, setBuyShowUsd] = useState(false);
  /**
   * Slippage tolerance in basis points, seeded from App Kit's own default so
   * the app never quietly quotes something tighter or looser than the SDK
   * would have on its own.
   *
   * `mode` records only how the figure was arrived at — Auto means the SDK
   * default, held fixed — so the settings panel can show which state it is in
   * without a second source of truth for the tolerance itself.
   */
  const [slippageMode, setSlippageMode] = useState<SlippageMode>('auto');
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);

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

  /*
   * Whose balances are on screen.
   *
   * Normally the connected wallet. A pasted address replaces it for reading
   * only: balances are public, so showing them is safe, but the address has no
   * provider behind it and cannot sign. `address` and `adapter` from
   * `WalletProvider` remain the sole inputs to quoting and submission, so this
   * cannot widen what the page is able to do.
   */
  const {
    displayAddress,
    kind: accountKind,
    isViewingOnly,
    setViewingAddress,
    clearViewingAddress,
  } = useViewingAddress(address as Address | null);

  const { balances, refresh } = useChainBalances(pairChain, displayAddress);

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

  // Shown on the Buy card so the user can see what they already hold of the
  // token arriving. Same multicall as the Sell side; no extra request.
  const buyBalance = useMemo(
    () => balances.find((b) => b.symbol === buy?.symbol),
    [balances, buy]
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

  // A quote is only valid for the exact inputs it was requested with — and the
  // tolerance is one of those inputs, since it determines the stop limit the
  // route commits to. Including it here means changing slippage invalidates the
  // quote through the same guard that handles an edited amount.
  const signature = `${sell?.key ?? ''}|${buy?.key ?? ''}|${amountIn}|${slippageBps}`;
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
    // While a pasted address is on screen, the balances and the signer are two
    // different accounts. Quoting then would price a trade against funds the
    // connected wallet does not hold, so the page asks the user to come back to
    // their own account first rather than producing a quote it cannot honour.
    !isViewingOnly &&
    !isBusy &&
    !hasQuote;

  const onQuote = useCallback(async () => {
    if (!canQuote || !sell || !buy) return;
    const result = await quoteSwap({
      chain: pairChain,
      // `routeOf`, not `.alias`: an address-resolved token carries its contract
      // in `route` and only a placeholder alias, so reading the alias would
      // submit a different asset than the one on screen.
      tokenIn: routeOf(sell),
      tokenOut: routeOf(buy),

      amountIn,
      slippageBps,
    });
    if (result) quotedSignature.current = signature;
  }, [canQuote, sell, buy, pairChain, amountIn, slippageBps, quoteSwap, signature]);

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

  /**
   * Slippage the route itself committed to, derived from its stop limit.
   *
   * Reported alongside the requested tolerance rather than instead of it: the
   * service may return a tighter limit than asked for, and this is the figure
   * that actually governs the on-chain revert.
   */
  const effectiveSlippage = useMemo(() => {
    const out = Number(quote?.output?.amount);
    const min = Number(quote?.minOutput?.amount);
    if (!Number.isFinite(out) || !Number.isFinite(min) || out <= 0) return null;
    return (out - min) / out;
  }, [quote]);

  /**
   * True when the route's own limit differs materially from what was requested.
   *
   * Half a basis point of tolerance absorbs the rounding inherent in deriving a
   * percentage from two decimal strings; anything beyond that is a real
   * difference and worth surfacing.
   */
  const slippageDiffers =
    effectiveSlippage !== null &&
    Math.abs(effectiveSlippage - bpsToFraction(slippageBps)) > 0.00005;

  /* --------------------------------------------------- gas-aware percentages */

  /**
   * Native gas priced by the current quote, if it priced any.
   *
   * `nativeFeeTotal` sums only the fee lines denominated in this chain's native
   * currency, so it returns null when the estimate contained no such line —
   * which is the honest answer, not zero.
   */
  const quotedNativeFee = useMemo(
    () => (quote ? nativeFeeTotal(quote, pairChain) : null),
    [quote, pairChain]
  );

  /**
   * Set the Sell amount to a fraction of the balance.
   *
   * Computed in base units from `raw`, never from the formatted string: the
   * display value is truncated for reading, so `Number(formatted)` on a balance
   * like 1,234.56789 would trade less than the user asked for and MAX would
   * leave a dust remainder behind.
   *
   * On the token that pays for gas, a full-balance selection subtracts the gas
   * the quote actually priced. Before a quote exists there is no real figure to
   * subtract, so MAX stays literal and the standing warning explains why.
   */
  const applyFraction = useCallback(
    (numerator: bigint, denominator: bigint) => {
      if (!sellBalance) return;

      let raw = (sellBalance.raw * numerator) / denominator;

      const isFullBalance = numerator === denominator;
      if (isFullBalance && sell?.isNative && quotedNativeFee !== null) {
        // Never below zero: if gas exceeds the balance the swap cannot proceed
        // anyway, and a negative amount would render as nonsense.
        raw = raw > quotedNativeFee ? raw - quotedNativeFee : 0n;
      }

      setAmountIn(formatUnits(raw, sellBalance.decimals));
    },
    [sellBalance, sell, quotedNativeFee]
  );

  /** True when MAX is currently reserving a real, quoted gas amount. */
  const maxReservesGas = !!sell?.isNative && quotedNativeFee !== null && quotedNativeFee > 0n;

  /* ------------------------------------------------------------ call to action */

  const cta = useMemo(() => {
    if (!address) return { label: 'Connect Wallet', action: () => void connect(), disabled: false };
    // Stated as an offer to fix it, not as a refusal: the user asked to look at
    // another address, and the way back to trading is one tap.
    if (isViewingOnly)
      return {
        label: 'Return to your wallet to swap',
        action: clearViewingAddress,
        disabled: false,
      };
    if (!sell || !buy) return { label: 'Select Token', action: () => setPicking('sell'), disabled: false };
    if (needsChainSwitch)
      return {
        label: `Switch to ${chainDisplayName(pairChain)}`,
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
    isViewingOnly,
    clearViewingAddress,
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
    <div className="animate-in">
      <div className="max-w-[480px] mx-auto">
        {/*
         * No account chip in the header: each card already names the account it
         * reads from, and a second copy would be one more thing to keep in sync
         * for no added information. The gear is the exception — slippage applies
         * to the whole trade, not to one side of it.
         *
         * `items-end` rather than `items-start`: the gear sat level with the top
         * of the "Swap" heading because the row aligned both children to their
         * top edge. Aligning to the bottom drops it beside the "Settles on…"
         * line, next to the card it configures rather than to the page title.
         * Done with alignment so the button stays in normal flow — a margin or
         * absolute offset would need re-tuning per breakpoint and could ride
         * over the heading when a long chain name wraps on a narrow screen.
         */}
        <header className="mb-5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Swap</h1>
            <p className="text-sm text-ink-muted mt-0.5">
              Settles on <span className="text-accent-text">{chainDisplayName(pairChain)}</span>
            </p>
          </div>
          <SwapSettings
            mode={slippageMode}
            bps={slippageBps}
            onChange={({ mode, bps }) => {
              setSlippageMode(mode);
              setSlippageBps(bps);
            }}
            // Locked once a signature has been requested: the params are already
            // in flight, so accepting a change would show a tolerance that is
            // not the one being signed.
            disabled={isBusy}
          />
        </header>

        {/* Sell */}
        <div className="relative">
          <AssetCard
            label="Sell"
            token={sell}
            onPickToken={() => setPicking('sell')}
            account={
              <WalletSelector
                kind={accountKind}
                address={displayAddress}
                connectedAddress={address}
                // Name and icon as the wallet announced them, so the chip shows
                // the provider that actually connected.
                walletName={wallet?.name}
                walletIcon={wallet?.icon}
                onUseViewingAddress={setViewingAddress}
                onClearViewingAddress={clearViewingAddress}
                label="Account selling from"
              />
            }
            amount={
              <AmountDisplay
                // The input keeps owning the token amount. Only its position on
                // the card changes when USD leads, so the value being typed is
                // never rewritten and never reinterpreted as dollars.
                tokenNode={
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
                    // Same type scale as the Buy readout and the USD promotion,
                    // so the figure does not resize as the card changes state.
                    className={`${AMOUNT_TEXT_CLASS} w-full bg-transparent outline-none placeholder:text-ink-muted`}
                  />
                }
                // Zero while nothing is typed, so the line reads $0.00 rather
                // than an em dash on a card the user has not filled in yet.
                usdValue={sellValueUSD ?? (sellPrice !== null ? 0 : null)}
                showUsdFirst={sellShowUsd}
              />
            }
            value={
              <AmountValueLine
                tokenText={amountIn === '' ? '0' : amountIn}
                usdValue={sellValueUSD ?? (sellPrice !== null ? 0 : null)}
                showUsdFirst={sellShowUsd}
                onToggle={() => setSellShowUsd((v) => !v)}
                symbol={sell?.symbol}
              />
            }
            footer={
              sellBalance ? (
                // A fragment, so the figure and the buttons are siblings in the
                // card's right-hand slot and centre with it. Wrapping them in
                // another flex box here would add a second set of alignment
                // rules for the same line.
                <>
                  <span
                    className="text-ink-muted truncate"
                    // The full figure stays reachable when a long balance is
                    // ellipsised — a balance that silently drops digits would
                    // be worse than one that visibly runs out of room.
                    title={`${sellBalance.formatted} ${sell?.symbol ?? ''}`}
                  >
                    Balance {sellBalance.formatted} {sell?.symbol}
                  </span>
                  {/*
                   * Withheld while viewing someone else's address: these exist
                   * to fill in an amount about to be traded, and this balance is
                   * not tradable from here. Offering them would be an invitation
                   * the confirm button then has to refuse.
                   */}
                  {!isViewingOnly && (
                    // `shrink-0` keeps the buttons at full size and lets the
                    // balance text give up the width instead.
                    <span className="flex items-center gap-1 shrink-0">
                      <FractionButton onClick={() => applyFraction(1n, 4n)}>25%</FractionButton>
                      <FractionButton onClick={() => applyFraction(1n, 2n)}>50%</FractionButton>
                      <FractionButton
                        onClick={() => applyFraction(1n, 1n)}
                        title={
                          maxReservesGas
                            ? 'Leaves behind the gas this quote priced'
                            : sell?.isNative
                              ? 'Full balance — no quoted gas figure to reserve yet'
                              : undefined
                        }
                      >
                        {maxReservesGas ? 'MAX − GAS' : 'MAX'}
                      </FractionButton>
                    </span>
                  )}
                </>
              ) : displayAddress ? (
                <span className="text-ink-muted">
                  No {sell?.symbol} on {chainDisplayName(pairChain)}
                </span>
              ) : null
            }
          />

          {/* Direction toggle, floating over the seam between the cards. */}
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-5 z-10">
            <button
              onClick={flip}
              disabled={!sell || !buy}
              aria-label="Switch sell and buy"
              // Rotates a half-turn on hover, which previews the reversal the
              // button performs. The `group` lets the icon inside animate too.
              className="group w-10 h-10 rounded-2xl bg-surface-card border border-hairline text-ink-secondary
                hover:border-arc-500/40 hover:text-accent-text hover:shadow-glow-arc hover:rotate-180
                active:scale-95 disabled:opacity-40 disabled:hover:rotate-0
                shadow-card flex items-center justify-center
                transition-all duration-300 ease-premium"
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
            /*
             * A swap returns the bought token to the account that sold it, so
             * this is the same account as the Sell side by construction — not a
             * second recipient field. It is shown here because "where does the
             * output land" is a fair question to ask of the Buy card, and the
             * answer should not require scrolling back up.
             */
            account={
              <WalletSelector
                kind={accountKind}
                address={displayAddress}
                connectedAddress={address}
                walletName={wallet?.name}
                walletIcon={wallet?.icon}
                onUseViewingAddress={setViewingAddress}
                onClearViewingAddress={clearViewingAddress}
                label="Account receiving the swap"
              />
            }
            amount={
              <AmountDisplay
                tokenNode={
                  <div className={`${AMOUNT_TEXT_CLASS} truncate`}>
                    {receivedAmount ?? <span className="text-ink-muted">0</span>}
                  </div>
                }
                usdValue={buyValueUSD ?? (buyPrice !== null && receivedAmount === null ? 0 : null)}
                showUsdFirst={buyShowUsd}
              />
            }
            value={
              <AmountValueLine
                tokenText={receivedAmount ?? '0'}
                usdValue={buyValueUSD ?? (buyPrice !== null && receivedAmount === null ? 0 : null)}
                showUsdFirst={buyShowUsd}
                onToggle={() => setBuyShowUsd((v) => !v)}
                symbol={buy?.symbol}
              />
            }
            footer={
              // Same row as Sell, so the two cards' bottom lines agree. The
              // balance truncates; the two explanatory strings are sentences
              // with nothing beside them, so they keep their full text.
              buyBalance ? (
                <span
                  className="text-ink-muted truncate"
                  title={`${buyBalance.formatted} ${buy?.symbol ?? ''}`}
                >
                  Balance {buyBalance.formatted} {buy?.symbol}
                </span>
              ) : (
                <span className="text-ink-muted">
                  {receivedAmount === null
                    ? 'Quoted by the route, not from a price.'
                    : 'Estimated by App Kit'}
                </span>
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

            <Row label="Quote vs. market">
              {priceImpact === null ? (
                <Unknown>Needs a market price for both tokens</Unknown>
              ) : (
                <span
                  className={
                    priceImpact <= -IMPACT_SEVERE
                      ? 'text-warning font-semibold'
                      : priceImpact <= -IMPACT_CAUTION
                        ? 'text-warning'
                        : priceImpact < 0
                          ? 'text-ink-secondary'
                          : 'text-success'
                  }
                >
                  {priceImpact > 0 ? '+' : ''}
                  {(priceImpact * 100).toFixed(2)}%
                </span>
              )}
            </Row>

            <Row label="Max slippage">
              {effectiveSlippage === null ? (
                // The requested tolerance is still worth stating: it was sent
                // to the service even when the response gave no stop limit to
                // derive the applied figure from.
                <>
                  {bpsToPercentText(slippageBps)}%{' '}
                  <span className="text-ink-muted">requested · limit not disclosed</span>
                </>
              ) : slippageDiffers ? (
                <>
                  {(effectiveSlippage * 100).toFixed(2)}%{' '}
                  <span className="text-ink-muted">
                    applied · {bpsToPercentText(slippageBps)}% requested
                  </span>
                </>
              ) : (
                `${(effectiveSlippage * 100).toFixed(2)}%`
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
              Same-chain on {chainDisplayName(pairChain)}
              <span className="text-ink-muted"> · venue not disclosed</span>
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

        {/*
         * Said once, plainly, where the decision is made. The balances above are
         * another account's, so the trade the cards describe is not one this
         * session can sign — and that has to be stated before the button, not
         * discovered by pressing it.
         */}
        {isViewingOnly && (
          <Notice>
            You are viewing {shortAddress(displayAddress ?? '')}, which this app cannot sign for.
            Balances and values above are that address&apos;s.{' '}
            <button onClick={clearViewingAddress} className="underline hover:text-warning">
              Switch back to your wallet
            </button>{' '}
            to swap.
          </Notice>
        )}

        {/* Warnings that must not be buried in the button label. */}
        {priceImpact !== null && priceImpact <= -IMPACT_CAUTION && (
          <Notice>
            {priceImpact <= -IMPACT_SEVERE ? (
              <>
                This quote returns {Math.abs(priceImpact * 100).toFixed(2)}% less than the market
                value of what you are selling.
              </>
            ) : (
              <>
                This quote is {Math.abs(priceImpact * 100).toFixed(2)}% below market value.
              </>
            )}{' '}
            The gap covers fees and the route&apos;s own pricing — compare it against the fee lines
            above before confirming.
          </Notice>
        )}
        {/*
         * Gas warning, in the two states that are actually true. Once a quote
         * has priced gas, MAX reserves it, so the blanket "leaves nothing for
         * gas" claim would be false.
         */}
        {sell?.isNative && amountValid && (
          <Notice>
            {maxReservesGas ? (
              <>
                MAX now holds back the {chainDisplayName(pairChain)} gas this quote priced. Re-quote
                after changing the amount, since the fee moves with it.
              </>
            ) : (
              <>
                {sell.symbol} pays for gas on {chainDisplayName(pairChain)}. Until a quote prices
                that gas, selling the full balance may leave nothing to cover the transaction.
              </>
            )}
          </Notice>
        )}
        {sell && buy && sell.chain.id !== buy.chain.id && (
          <Notice>
            A swap settles on one chain. To move USDC between chains, use{' '}
            <Link href="/bridge" className="text-accent-text hover:underline">
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
            className="w-full mt-3 text-sm text-ink-secondary hover:text-ink-primary"
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
  value,
  account,
  footer,
  onPickToken,
}: {
  label: string;
  token: SwapToken | null;
  /** The large figure, beside the token pill. */
  amount: React.ReactNode;
  /** The secondary value line and its unit toggle; see `AmountValueLine`. */
  value: React.ReactNode;
  /** The account this side reads from, in the card header beside the label. */
  account: React.ReactNode;
  /** The balance and anything acting on it, opposite `value`. */
  footer: React.ReactNode;
  onPickToken: () => void;
}) {
  return (
    // `card-float` lifts the panel on hover; the two swap cards are the subject
    // of this page, so they are where the effect belongs.
    // `p-4` rather than `p-5`: the card's three rows are each self-contained, so
    // the padding was doing more separating than it needed to.
    <section className="glass card-float p-4 rounded-3xl">
      {/*
       * "Sell" and the account sit on one line. The account belongs to the side,
       * not to the page, so it reads as part of the sentence the card makes:
       * sell — from this account.
       */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm text-ink-secondary">{label}</span>
        {account}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">{amount}</div>
        <TokenPill token={token} onClick={onPickToken} />
      </div>

      {/*
       * The bottom line: the secondary value on the left, the balance and
       * whatever acts on it on the right, all vertically centred on one row.
       *
       * `justify-between` puts the gap between the two groups rather than
       * distributing it, so each stays anchored to its own edge — the value line
       * under the amount it restates, the balance under the token pill it
       * describes. The row does not wrap, because the buttons must not drop
       * beneath the figure they apply to; the balance text carries `truncate` and
       * the buttons `shrink-0`, so on a narrow screen the text yields the width
       * instead of the row breaking.
       */}
      <div className="flex flex-nowrap items-center justify-between gap-x-3 mt-2 text-xs">
        {/* Both groups are flex rows themselves, so their contents centre too. */}
        <div className="flex items-center gap-1.5 min-w-0">{value}</div>
        <div className="flex items-center gap-2 min-w-0">{footer}</div>
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
        // The empty state is the call to action on a fresh swap, so it carries
        // the accent glow that the filled state does not need.
        className="shrink-0 flex items-center gap-2 pl-4 pr-3 py-2.5 rounded-2xl bg-arc-500/15 border border-arc-500/30
          text-accent-text font-medium hover:bg-arc-500/25 hover:shadow-glow-arc active:scale-[0.98]
          transition-all duration-200 ease-premium"
      >
        <span className="text-sm font-bold uppercase tracking-wide text-accent-text">
          Select token
        </span>
        <Chevron />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="shrink-0 flex items-center gap-2.5 pl-2 pr-2.5 py-1.5 rounded-2xl bg-surface-input border border-hairline
        hover:bg-surface-hover/[0.06] hover:border-arc-500/30 active:scale-[0.98]
        transition-all duration-200 ease-premium"
    >
      {/*
       * 32px keeps the pill inside the height of the amount beside it, so the
       * pill is no longer what sets how tall the middle row is.
       */}
      <TokenMark token={token} size={32} />
      <span className="text-left leading-tight">
        <span className="block text-sm font-bold">{token.symbol}</span>
        <span className="block text-[11px] text-ink-muted max-w-[92px] truncate">
          {chainDisplayName(token.chain)}
        </span>
      </span>
      <Chevron />
    </button>
  );
}

function Chevron() {
  return (
    <svg className="w-4 h-4 text-ink-muted shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

/**
 * A one-tap portion of the balance.
 *
 * `title` carries the explanation for MAX, whose meaning shifts once a quote
 * has priced gas — the label alone cannot say whether a reserve was applied.
 */
function FractionButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="px-2 py-0.5 rounded-md text-[11px] font-semibold text-accent-text bg-arc-500/15
        hover:bg-arc-500/25 active:scale-95 transition-all duration-200 whitespace-nowrap"
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="text-ink-muted shrink-0">{label}</span>
      <span className="text-ink-secondary text-right tabular-nums">{children}</span>
    </div>
  );
}

/** Marks a figure the SDK did not supply, so it reads as absent, not as zero. */
function Unknown({ children }: { children: React.ReactNode }) {
  return <span className="text-ink-muted">{children}</span>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-xs text-warning/90 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl px-3 py-2.5">
      {children}
    </p>
  );
}
