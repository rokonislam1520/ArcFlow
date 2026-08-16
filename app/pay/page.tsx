'use client';
/**
 * Pay — the checkout a customer opens from a merchant's payment link or QR.
 *
 * Every detail shown is read from the link, so the page works for anyone who
 * receives it with no account and no lookup. Settlement reuses the same App Kit
 * transfer path as Send, quoted before it is signed, so the customer sees the
 * real fee and can decline without a wallet prompt having fired.
 *
 * The link is untrusted input — anyone can edit a URL — so the recipient and
 * network are validated before a payable form is rendered, and the wallet is
 * asked to switch to the network the *request* names rather than settling on
 * whichever chain happens to be selected. Paying on the wrong chain would send
 * real funds somewhere the merchant is not watching.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { isAddress, parseUnits, type Address } from 'viem';
import { getChainById, explorerTxUrl } from '@/lib/chains';
import { useWallet } from '@/lib/WalletProvider';
import { useNetworkMode } from '@/lib/network';
import { useChainBalances } from '@/lib/useBalances';
import { useAppKitOps } from '@/lib/useAppKitOps';
import { useOpNotifications } from '@/lib/notifications';
import { OpStatus } from '@/components/OpStatus';
import { ConnectButton } from '@/components/ConnectButton';
import { decodeRequest } from '@/lib/merchant';
import { useAddressBook } from '@/lib/addressBook';
import { useRecentRecipients } from '@/lib/useRecentRecipients';
import { checkGas, checkRecipient, mergeReports, type SafetyReport } from '@/lib/safety';

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="max-w-lg mx-auto animate-in">{children}</div>;
}

/** A dead end the customer cannot act on, so it explains rather than offers. */
function Unusable({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <Shell>
      <h1 className="text-3xl font-bold mb-1">Pay</h1>
      <p className="text-ink-secondary text-sm mb-8">Complete a merchant payment request.</p>
      <div className="glass p-8 sm:p-10 text-center">
        <div className="text-4xl mb-3">{icon}</div>
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <p className="text-ink-secondary text-sm">{children}</p>
      </div>
    </Shell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-2.5 border-b border-hairline last:border-0">
      <span className="text-sm text-ink-muted shrink-0">{label}</span>
      <span className="text-sm text-ink-primary text-right break-words min-w-0">{children}</span>
    </div>
  );
}

function Checkout() {
  const params = useSearchParams();
  const { address, adapter, chain: walletChain, switchChain } = useWallet();
  const { state, isBusy, hasQuote, quoteSend, submit, cancelQuote, reset } = useAppKitOps();

  const request = useMemo(
    () => decodeRequest(new URLSearchParams(params.toString())),
    [params]
  );

  // The chain named by the request, not the one the app happens to be showing.
  const target = useMemo(() => (request ? getChainById(request.chain) : undefined), [request]);

  const { balances, isLoading: balancesLoading } = useChainBalances(
    target ?? null,
    (address as Address) ?? null
  );

  const [amount, setAmount] = useState('');
  const [switching, setSwitching] = useState(false);

  /** Recipient and gas checks for the payment currently quoted. */
  const [safety, setSafety] = useState<SafetyReport | null>(null);
  const [safetyPending, setSafetyPending] = useState(false);

  useEffect(() => {
    if (request?.amount) setAmount(request.amount);
  }, [request?.amount]);

  useOpNotifications(state, target ?? null);

  /*
   * The same local knowledge Send draws on, so a merchant already paid is
   * recognised here too.
   *
   * Both hooks are called unconditionally and before any early return, because
   * the request may be invalid on this render and hook order cannot vary. The
   * mode comes from the app rather than the link: a request naming a testnet
   * chain is still read against whichever history the user is actually browsing.
   */
  const { isTestnet } = useNetworkMode();
  const book = useAddressBook(address ?? null);
  const recents = useRecentRecipients(address as Address | null, isTestnet);

  /**
   * The payment in native base units, or zero when a token is being sent.
   *
   * A native payment competes with its own fee for one balance, which is the
   * case `checkGas` has to add together; a token payment leaves gas untouched.
   */
  const nativeValue = useMemo(() => {
    if (!target || request?.token !== 'NATIVE' || !amount) return 0n;
    try {
      return parseUnits(amount, target.nativeCurrency.decimals);
    } catch {
      // Unparseable input is already caught by `amountValid`; a guessed number
      // here would produce a gas verdict about an amount nobody entered.
      return 0n;
    }
  }, [target, request?.token, amount]);

  /**
   * Run the checks when — and only when — a quote appears.
   *
   * The recipient comes from a URL, which makes these more valuable here than
   * on Send: the customer never typed the address and cannot spot a substituted
   * one, so "this is a contract" or "this wallet has never transacted" may be
   * the only signal that a link was tampered with. Nothing blocks — a legitimate
   * first-time merchant looks identical — but it is said before the signature.
   */
  useEffect(() => {
    const to = request?.to;
    if (state.stage !== 'quoted' || !target || !to || !isAddress(to) || !address) {
      setSafety(null);
      setSafetyPending(false);
      return;
    }

    let active = true;
    setSafetyPending(true);
    setSafety(null);

    void Promise.all([
      checkRecipient({
        chain: target,
        to,
        knownRecipient: book.knownAddresses.has(to.toLowerCase()),
        sentBefore: recents.sentBefore(to),
      }),
      checkGas({ chain: target, from: address, quote: state.quote, value: nativeValue }),
    ]).then(([recipient, gas]) => {
      // Dropped if the quote was cancelled or replaced while the reads were in
      // flight, so a stale report can never sit beside a different payment.
      if (!active) return;
      setSafety(mergeReports(recipient, gas));
      setSafetyPending(false);
    });

    return () => {
      active = false;
    };
    // `book` and `recents` are read at quote time only: including them would
    // re-run the checks whenever an unrelated contact or history entry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stage, state.quote, request?.to, target, address, nativeValue]);

  if (!request) {
    return (
      <Unusable icon="⚠️" title="This payment link is not valid">
        It is missing the merchant address or the network, so there is nothing safe to pay.
        Ask the merchant for a new link.
      </Unusable>
    );
  }

  if (!target) {
    return (
      <Unusable icon="🌐" title="Unsupported network">
        This request asks for payment on{' '}
        <span className="font-mono">{request.chain.replace(/_/g, ' ')}</span>, which this app
        cannot transact on.
      </Unusable>
    );
  }

  const symbol = request.token === 'NATIVE' ? target.nativeCurrency.symbol : request.token;
  const balance = balances.find((b) =>
    request.token === 'NATIVE' ? b.address === undefined : b.symbol === request.token
  );

  const numeric = Number(amount);
  const amountValid = amount !== '' && Number.isFinite(numeric) && numeric > 0;
  const available = balance ? Number(balance.formatted.replace(/,/g, '')) : null;
  const insufficient = amountValid && available !== null ? numeric > available : false;

  const fixedAmount = request.amount !== '';
  const connected = Boolean(address && adapter);
  const wrongNetwork = connected && walletChain?.id !== target.id;
  const payingSelf = address !== null && address.toLowerCase() === request.to.toLowerCase();

  const canPay =
    connected && !wrongNetwork && !payingSelf && amountValid && !insufficient && !isBusy;

  async function onQuote() {
    if (!canPay || !target || !request) return;
    await quoteSend({ chain: target, to: request.to, amount, token: request.token });
  }

  async function onSwitch() {
    if (!target) return;
    setSwitching(true);
    try {
      await switchChain(target);
    } finally {
      setSwitching(false);
    }
  }

  /** One honest line describing where the payment stands. */
  const status = !connected
    ? 'Waiting for wallet'
    : wrongNetwork
      ? 'Wrong network'
      : state.stage === 'quoting'
        ? 'Preparing payment'
        : state.stage === 'awaitingSignature'
          ? 'Confirm in your wallet'
          : state.stage === 'pending'
            ? 'Confirming transaction'
            : state.stage === 'success'
              ? 'Payment successful'
              : state.stage === 'error'
                ? 'Payment failed'
                : payingSelf
                  ? 'This request is your own wallet'
                  : insufficient
                    ? 'Insufficient balance'
                    : amountValid
                      ? 'Ready to pay'
                      : 'Enter an amount';

  const statusTone =
    state.stage === 'success'
      ? 'text-success'
      : state.stage === 'error' || wrongNetwork || insufficient || payingSelf
        ? 'text-warning'
        : 'text-ink-secondary';

  // A same-chain transfer produces a single hash; take the first rather than
  // assuming a shape that only holds for bridges.
  const txHash = state.hashes[0] ?? null;
  const txUrl = txHash ? explorerTxUrl(target, txHash) : null;

  return (
    <Shell>
      <h1 className="text-3xl font-bold mb-1">Pay</h1>
      <p className="text-ink-secondary text-sm mb-8">
        {request.name ? `Payment request from ${request.name}` : 'Merchant payment request'}
      </p>

      <div className="glass p-5 sm:p-6 space-y-5">
        {/* The amount leads: it is the decision being made. */}
        <div className="text-center py-2">
          {fixedAmount ? (
            <div className="text-4xl font-bold tabular-nums break-words">
              {request.amount}{' '}
              <span className="text-xl text-ink-secondary font-semibold">{symbol}</span>
            </div>
          ) : (
            <div className="text-left">
              <div className="flex justify-between text-sm text-ink-secondary mb-2">
                <label htmlFor="pay-amount">Amount ({symbol})</label>
                {balance && (
                  <button
                    onClick={() => setAmount(balance.formatted.replace(/,/g, ''))}
                    className="text-accent-text hover:underline"
                  >
                    Max: {balance.formatted}
                  </button>
                )}
              </div>
              <input
                id="pay-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full bg-surface-input border border-hairline rounded-xl px-4 py-3 text-lg focus:border-arc-500 outline-none"
              />
            </div>
          )}
        </div>

        <dl className="rounded-xl bg-surface-input border border-hairline px-4 py-1">
          {request.name && <Row label="Merchant">{request.name}</Row>}
          <Row label="Network">{target.label}</Row>
          <Row label="Asset">{symbol}</Row>
          {request.memo && <Row label="Memo">{request.memo}</Row>}
          {request.ref && (
            <Row label="Reference">
              <span className="font-mono text-xs">{request.ref}</span>
            </Row>
          )}
          {/* Shown in full: this address receives the money. */}
          <Row label="To">
            <span className="font-mono text-xs break-all">{request.to}</span>
          </Row>
        </dl>

        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-muted">Status</span>
          <span className={`font-medium ${statusTone}`}>{status}</span>
        </div>

        {/* Only one primary action is offered at a time, matching the state. */}
        {!connected ? (
          <div className="space-y-3">
            <ConnectButton />
            <p className="text-xs text-ink-muted text-center">
              Connect a wallet to pay this request.
            </p>
          </div>
        ) : wrongNetwork ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-xs text-warning/90">
              This request must be paid on {target.label}. Your wallet is on{' '}
              {walletChain?.label ?? 'another network'}.
            </div>
            <button
              onClick={() => void onSwitch()}
              disabled={switching}
              className="btn-arc w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {switching ? 'Check your wallet…' : `Switch to ${target.label}`}
            </button>
          </div>
        ) : (
          <>
            {payingSelf && (
              <p className="text-sm text-warning">
                This request is addressed to your own wallet.
              </p>
            )}
            {insufficient && (
              <p className="text-sm text-warning">
                You have {balance?.formatted ?? '0'} {symbol} on {target.label}.
              </p>
            )}
            {!balance && !balancesLoading && amountValid && (
              <p className="text-sm text-warning">
                No {symbol} balance found on {target.label}.
              </p>
            )}

            {!hasQuote && state.stage !== 'success' && (
              <button
                onClick={() => void onQuote()}
                disabled={!canPay}
                className="btn-arc w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isBusy
                  ? 'Working…'
                  : amountValid
                    ? `Pay ${amount} ${symbol}`
                    : `Pay ${symbol}`}
              </button>
            )}
          </>
        )}

        {/* Quote, signature, pending and failure all render here, from the
            SDK's own state — nothing about the result is assumed. */}
        <OpStatus
          state={state}
          chain={target}
          onConfirm={() => void submit()}
          onCancel={cancelQuote}
          safety={safety}
          safetyPending={safetyPending}
        />

        {state.stage === 'success' && (
          <div className="rounded-xl bg-mint-500/10 border border-mint-500/25 p-4 text-center space-y-2">
            <p className="text-sm font-semibold text-success">Payment successful</p>
            <p className="text-xs text-ink-secondary">
              {request.name ? `${request.name} has` : 'The merchant has'} been paid
              {request.ref ? ` — quote reference ${request.ref}` : ''}.
            </p>
            {txHash && (
              <p className="text-[11px] font-mono break-all text-ink-muted">{txHash}</p>
            )}
            {txUrl && (
              <a
                href={txUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-accent-text hover:underline"
              >
                View on explorer
              </a>
            )}
          </div>
        )}

        {(state.stage === 'success' || state.stage === 'error') && !isBusy && (
          <button
            onClick={reset}
            className="w-full text-sm text-ink-secondary hover:text-ink-primary"
          >
            Start again
          </button>
        )}
      </div>

      <p className="text-xs text-ink-muted mt-4 text-center">
        Funds go directly to the merchant&apos;s wallet — ArcFlow never holds them.{' '}
        <Link href="/merchant" className="text-accent-text hover:underline">
          Accept payments yourself
        </Link>
      </p>
    </Shell>
  );
}

/**
 * Landing state for someone who opens /pay with nothing attached.
 *
 * This is not an error: Pay is in the navigation, so arriving here empty is a
 * normal thing to do. It reads as a starting point and offers the one route
 * onward — creating a request — rather than leaving the visitor at a dead end
 * wondering what they did wrong. No placeholder request is invented to fill the
 * screen; there is genuinely nothing to pay until a real link arrives.
 */
function NoRequest() {
  return (
    <Shell>
      <h1 className="text-3xl font-bold mb-1">Pay</h1>
      <p className="text-ink-secondary text-sm mb-8">Complete a merchant payment request.</p>

      <div className="glass p-8 sm:p-10 text-center">
        {/* Theme tokens throughout, so the panel follows light and dark. */}
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-7 h-7 text-accent-text"
            aria-hidden="true"
          >
            <path d="M2 7h20v10H2zM2 11h20M6 15h4" />
          </svg>
        </div>

        <h2 className="text-lg font-semibold mb-2">No payment request yet</h2>
        <p className="text-ink-secondary text-sm max-w-sm mx-auto">
          Open a Merchant payment link or scan a QR code to continue.
        </p>

        <Link
          href="/merchant"
          className="btn-arc inline-flex items-center justify-center px-5 py-3 mt-6 w-full sm:w-auto"
        >
          Go to Merchant
        </Link>

        <p className="text-xs text-ink-muted mt-4">
          Accepting payments yourself? Create a request on the Merchant page.
        </p>
      </div>
    </Shell>
  );
}

function PayRoute() {
  const params = useSearchParams();
  // An empty query is someone arriving from the nav, not a broken link, so it
  // gets guidance rather than an error.
  if (params.toString() === '') return <NoRequest />;
  return <Checkout />;
}

export default function PayPage() {
  // useSearchParams needs a Suspense boundary or the route opts out of static
  // rendering at build time.
  return (
    <Suspense
      fallback={
        <Shell>
          <div className="glass p-10 text-center text-sm text-ink-muted">
            Loading payment request…
          </div>
        </Shell>
      }
    >
      <PayRoute />
    </Suspense>
  );
}
