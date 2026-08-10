'use client';
/**
 * Checkout — the screen a customer lands on from a merchant's payment link.
 *
 * Everything shown comes from the URL, so this page works for anyone who
 * receives the link, with no lookup and no account. The payment itself is an
 * ordinary App Kit transfer, quoted before it is signed, so the customer sees
 * the real fee and can decline without a wallet prompt having fired.
 *
 * The request is untrusted input: it arrives from a link that anyone can edit.
 * It is therefore validated before a payable form is rendered, and the details
 * the customer is agreeing to — who is paid, on which chain — are shown in
 * full rather than summarised.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Address } from 'viem';
import { getChainById } from '@/lib/chains';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { useChainBalances } from '@/lib/useBalances';
import { useAppKitOps } from '@/lib/useAppKitOps';
import { useOpNotifications } from '@/lib/notifications';
import { OpStatus } from '@/components/OpStatus';
import { decodeRequest } from '@/lib/merchant';

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="max-w-lg mx-auto animate-in">{children}</div>;
}

function Checkout() {
  const params = useSearchParams();
  const { address, adapter } = useWallet();
  const activeChain = useActiveChain();
  const { state, isBusy, hasQuote, quoteSend, submit, cancelQuote, reset } = useAppKitOps();

  // Parsed from the URL, so a tampered or truncated link fails closed.
  const request = useMemo(() => decodeRequest(new URLSearchParams(params.toString())), [params]);

  // The link names the chain; the customer must be on it for the transfer to
  // reach the merchant, so this is resolved from the request, not the app's
  // current selection.
  const target = useMemo(
    () => (request ? getChainById(request.chain) : undefined),
    [request]
  );

  const { balances } = useChainBalances(target ?? null, (address as Address) ?? null);

  const [amount, setAmount] = useState('');
  // A request with a fixed amount pre-fills it; an open request lets the
  // customer decide. Either way the field is the single source of truth.
  useEffect(() => {
    if (request?.amount) setAmount(request.amount);
  }, [request?.amount]);

  useOpNotifications(state, target ?? activeChain);

  if (!request) {
    return (
      <Shell>
        <h1 className="text-3xl font-bold mb-1">Payment request</h1>
        <div className="glass p-10 text-center mt-8">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-lg font-semibold mb-2">This payment link is not valid</h2>
          <p className="text-ink-secondary text-sm">
            It is missing the merchant address or the network. Ask the merchant for a new
            link.
          </p>
        </div>
      </Shell>
    );
  }

  if (!target) {
    return (
      <Shell>
        <h1 className="text-3xl font-bold mb-1">Payment request</h1>
        <div className="glass p-10 text-center mt-8">
          <div className="text-4xl mb-3">🌐</div>
          <h2 className="text-lg font-semibold mb-2">Unsupported network</h2>
          <p className="text-ink-secondary text-sm">
            This link asks for a payment on{' '}
            <span className="font-mono">{request.chain.replace(/_/g, ' ')}</span>, which this
            app does not support.
          </p>
        </div>
      </Shell>
    );
  }

  const balance = balances.find((b) =>
    request.token === 'NATIVE' ? b.address === undefined : b.symbol === request.token
  );

  const numeric = Number(amount);
  const amountValid = amount !== '' && Number.isFinite(numeric) && numeric > 0;
  const exceedsBalance =
    amountValid && balance ? numeric > Number(balance.formatted.replace(/,/g, '')) : false;
  // The link is fixed-price when the merchant set an amount; editing it would
  // under- or overpay an invoice, so it is displayed read-only in that case.
  const fixedAmount = request.amount !== '';

  const validationError = !address
    ? 'Connect your wallet to pay.'
    : !adapter
      ? 'Connect your wallet to pay.'
      : address.toLowerCase() === request.to.toLowerCase()
        ? 'This request is addressed to your own wallet.'
        : exceedsBalance
          ? `Not enough ${request.token} on ${target.label}.`
          : null;

  const canPay = Boolean(address && adapter) && amountValid && !validationError && !isBusy;

  async function onQuote() {
    if (!canPay || !target) return;
    await quoteSend({ chain: target, to: request!.to, amount, token: request!.token });
  }

  return (
    <Shell>
      <h1 className="text-3xl font-bold mb-1">
        {request.name ? `Pay ${request.name}` : 'Payment request'}
      </h1>
      <p className="text-ink-secondary text-sm mb-8">
        on <span className="text-accent-text">{target.label}</span>
        {request.ref && (
          <>
            {' · '}
            <span className="text-ink-muted">Ref </span>
            <span className="font-mono text-ink-secondary">{request.ref}</span>
          </>
        )}
      </p>

      <div className="glass p-6 space-y-5">
        {request.memo && (
          <div className="rounded-xl bg-surface-input border border-hairline p-3">
            <p className="text-[11px] text-ink-muted mb-1">Note from merchant</p>
            <p className="text-sm text-ink-secondary break-words">{request.memo}</p>
          </div>
        )}

        <div>
          <div className="flex justify-between text-sm text-ink-secondary mb-2">
            <label>Amount ({request.token})</label>
            {balance && !fixedAmount && (
              <button
                onClick={() => setAmount(balance.formatted.replace(/,/g, ''))}
                className="text-accent-text hover:underline"
              >
                Max: {balance.formatted}
              </button>
            )}
          </div>
          {fixedAmount ? (
            <div className="w-full bg-surface-input border border-hairline rounded-xl px-4 py-3 text-2xl font-bold tabular-nums">
              {request.amount}{' '}
              <span className="text-base font-normal text-ink-secondary">{request.token}</span>
            </div>
          ) : (
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="0.00"
              className="w-full bg-surface-input border border-hairline rounded-xl px-4 py-3 text-lg focus:border-arc-500 outline-none"
            />
          )}
        </div>

        {/* Shown in full: this is the address that will receive the money. */}
        <div>
          <p className="text-sm text-ink-secondary mb-2">Paying to</p>
          <code className="block bg-surface-input border border-hairline rounded-xl px-3 py-3 font-mono text-xs break-all text-ink-secondary">
            {request.to}
          </code>
        </div>

        {validationError && <p className="text-sm text-warning">{validationError}</p>}

        {!hasQuote && state.stage !== 'success' && (
          <button
            onClick={() => void onQuote()}
            disabled={!canPay}
            className="btn-arc w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isBusy ? 'Working…' : 'Review payment'}
          </button>
        )}

        <OpStatus
          state={state}
          chain={target}
          onConfirm={() => void submit()}
          onCancel={cancelQuote}
        />

        {state.stage === 'success' && (
          <div className="rounded-xl bg-mint-500/10 border border-mint-500/25 p-4 text-center">
            <p className="text-sm font-semibold text-success mb-1">Payment sent</p>
            <p className="text-xs text-ink-secondary">
              {request.name ? `${request.name} has` : 'The merchant has'} been paid
              {request.ref ? ` — quote reference ${request.ref}` : ''}.
            </p>
          </div>
        )}

        {(state.stage === 'success' || state.stage === 'error') && !isBusy && (
          <button
            onClick={reset}
            className="w-full text-sm text-ink-secondary hover:text-ink-primary"
          >
            Make another payment
          </button>
        )}
      </div>

      <p className="text-xs text-ink-muted mt-4 text-center">
        Funds go directly to the merchant&apos;s wallet. ArcFlow never holds them.{' '}
        <Link href="/merchant" className="text-accent-text hover:underline">
          Accept payments yourself
        </Link>
      </p>
    </Shell>
  );
}

export default function MerchantPayPage() {
  // useSearchParams needs a Suspense boundary, otherwise this route opts the
  // whole page out of static rendering at build time.
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
      <Checkout />
    </Suspense>
  );
}
