'use client';
/**
 * Merchant Pay — set up a merchant profile, raise a payment request, and watch
 * real payments arrive.
 *
 * Settlement is a plain on-chain transfer executed by App Kit, the same path
 * Send uses, so this works on every chain the SDK supports with no deployment
 * and no contract addresses to configure. The custom `ArcFlowPay` contract is
 * deliberately not used: it has only ever been deployed to a local Hardhat
 * node, so a page built on it could not take a real payment — which is exactly
 * why this screen used to say "Not Configured".
 *
 * The consequence worth knowing: because payment is a direct transfer, the
 * Payments tab lists incoming transfers to the payout wallet. It cannot prove
 * *which* request a given payment settles — the reference travels in the link
 * for the customer to quote, not on-chain.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { isAddress, type Address } from 'viem';
import { getChainTokens, explorerTxUrl, type TokenAlias } from '@/lib/chains';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { useTransfers, relativeTime, shortAddress } from '@/lib/useTransfers';
import {
  clearProfile,
  loadProfile,
  newReference,
  requestUrl,
  saveProfile,
  PAY_PATH,
  type MerchantProfile,
  type PaymentRequest,
} from '@/lib/merchant';

const inputClass =
  'w-full bg-surface-input border border-hairline rounded-xl px-4 py-3 text-sm focus:border-arc-500 outline-none';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-ink-secondary mb-2">
        {label}
        {hint && <span className="text-ink-muted"> {hint}</span>}
      </label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------- onboarding */

/**
 * Shown until a profile exists. This replaces the old "Not Configured" panel,
 * which asked the visitor to deploy contracts and edit `.env.local` — a thing
 * a public user can neither do nor be expected to understand.
 */
function Setup({
  address,
  initial,
  onSave,
  onCancel,
}: {
  address: string | null;
  initial: MerchantProfile | null;
  onSave: (profile: MerchantProfile) => void;
  onCancel: (() => void) | null;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [wallet, setWallet] = useState(initial?.wallet ?? address ?? '');

  // The connected wallet is the sensible payout default, but it is only known
  // after connection, so fill it in when it arrives rather than leaving blank.
  useEffect(() => {
    if (address && !wallet) setWallet(address);
  }, [address, wallet]);

  const walletValid = isAddress(wallet.trim());
  const canSave = name.trim().length > 0 && walletValid;

  return (
    <div className="max-w-lg mx-auto animate-in">
      <h1 className="text-3xl font-bold mb-1">Set up Merchant</h1>
      <p className="text-ink-secondary text-sm mb-8">
        Add your business details to start accepting payments. This is saved on this device
        only — nothing is published and no account is created.
      </p>

      <div className="glass p-6 space-y-5">
        <Field label="Business name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Blue Bottle Coffee"
            maxLength={60}
            className={inputClass}
          />
        </Field>

        <Field label="Category" hint="(optional)">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Coffee shop"
            maxLength={40}
            className={inputClass}
          />
        </Field>

        <Field label="Payout wallet" hint="— where payments arrive">
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
            className={`${inputClass} font-mono`}
          />
        </Field>

        {wallet !== '' && !walletValid && (
          <p className="text-sm text-warning">That is not a valid wallet address.</p>
        )}

        <button
          onClick={() =>
            onSave({ name: name.trim(), category: category.trim(), wallet: wallet.trim() })
          }
          disabled={!canSave}
          className="btn-arc w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {initial ? 'Save changes' : 'Start accepting payments'}
        </button>

        {onCancel && (
          <button
            onClick={onCancel}
            className="w-full text-sm text-ink-secondary hover:text-ink-primary"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- request builder */

function RequestBuilder({ profile, chainId }: { profile: MerchantProfile; chainId: string }) {
  const chain = useActiveChain();
  const tokens = useMemo(() => getChainTokens(chain), [chain]);

  const [amount, setAmount] = useState('');
  // Typed as an alias rather than a bare string, so the value handed to the
  // request is always one the chain registry actually knows.
  const [token, setToken] = useState<TokenAlias>('USDC');
  const [memo, setMemo] = useState('');
  const [reference, setReference] = useState(newReference);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // The selected token may not exist on a newly selected chain.
  const activeToken = tokens.includes(token) ? token : tokens[0];

  const request: PaymentRequest = useMemo(
    () => ({
      to: profile.wallet,
      name: profile.name,
      amount,
      token: activeToken,
      chain: chainId,
      memo,
      ref: reference,
    }),
    [profile, amount, activeToken, chainId, memo, reference]
  );

  const url = useMemo(() => requestUrl(request), [request]);
  const query = useMemo(() => url.split('?')[1] ?? '', [url]);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      // High correction keeps the code scannable on a screen at an angle.
      errorCorrectionLevel: 'H',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((data) => {
        if (!cancelled) setQr(data);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked; the link stays on screen to copy manually.
    }
  }

  return (
    <div className="glass p-6 space-y-5">
      <div className="flex justify-center">
        {qr ? (
          // The QR is a data: URL generated in the browser, so next/image has
          // nothing to optimise and would only add a loader around it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qr}
            alt={`QR code for a payment to ${profile.name}`}
            className="rounded-xl w-52 h-52 bg-white p-1"
          />
        ) : (
          <div className="w-52 h-52 rounded-xl bg-surface-input border border-hairline flex items-center justify-center text-xs text-ink-muted">
            Generating…
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Amount" hint="(optional)">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="Any amount"
            className={inputClass}
          />
        </Field>

        <Field label="Asset">
          <div className="flex flex-wrap gap-2">
            {tokens.map((t) => (
              <button
                key={t}
                onClick={() => setToken(t)}
                className={`px-3 py-2 rounded-xl text-sm border transition-colors ${
                  activeToken === t
                    ? 'border-arc-500 bg-arc-500/15 text-accent-text'
                    : 'border-hairline bg-surface-input hover:bg-surface-hover/[0.06]'
                }`}
              >
                {t === 'NATIVE' ? chain.nativeCurrency.symbol : t}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Note" hint="(optional — shown to the customer)">
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="e.g. Invoice 1043"
          maxLength={120}
          className={inputClass}
        />
      </Field>

      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-ink-muted">
          Reference <span className="font-mono text-ink-secondary">{reference}</span>
        </span>
        <button
          onClick={() => setReference(newReference())}
          className="text-accent-text hover:underline"
        >
          New reference
        </button>
      </div>

      <div className="rounded-xl bg-surface-input border border-hairline p-3">
        <p className="text-[11px] text-ink-muted mb-1.5">Payment link</p>
        <code className="block font-mono text-[11px] break-all text-ink-secondary">{url}</code>
      </div>

      <div className="flex gap-2">
        <button onClick={() => void copyLink()} className="btn-arc flex-1 py-3">
          {copied ? 'Link copied' : 'Copy payment link'}
        </button>
        <Link
          href={`${PAY_PATH}?${query}`}
          className="px-4 py-3 rounded-xl text-sm bg-surface-input border border-hairline hover:bg-surface-hover/[0.06] shrink-0"
        >
          Preview
        </Link>
      </div>

      <p className="text-xs text-ink-muted">
        Customers pay on <span className="text-accent-text">{chain.label}</span>. Funds arrive
        directly in your payout wallet — ArcFlow never holds them.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- payments */

function Payments({ profile }: { profile: MerchantProfile }) {
  const chain = useActiveChain();
  const { transfers, loading, error, refresh } = useTransfers(
    chain,
    profile.wallet as Address,
    25
  );

  // Only incoming transfers are payments; the merchant's own spending is not.
  const received = useMemo(
    () => transfers.filter((t) => t.direction === 'received'),
    [transfers]
  );

  return (
    <div className="glass p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Payments received</h2>
        <button
          onClick={() => void refresh()}
          className="text-xs text-accent-text hover:underline"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : loading && received.length === 0 ? (
        <p className="text-sm text-ink-secondary">Reading from {chain.label}…</p>
      ) : received.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-ink-secondary">No payments yet.</p>
          <p className="text-xs text-ink-muted mt-1">
            Share a payment link and confirmed payments appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {received.map((t) => {
            const url = explorerTxUrl(chain, t.txHash);
            const row = (
              <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-hover/[0.06] transition-colors duration-200">
                <span className="w-8 h-8 rounded-full bg-mint-500/15 border border-mint-500/25 text-success flex items-center justify-center text-sm shrink-0">
                  ↓
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    From{' '}
                    <span className="font-mono text-xs text-ink-secondary">
                      {shortAddress(t.counterparty)}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-muted flex items-center gap-1.5 flex-wrap">
                    {/* Anything listed here was read from a mined block's
                        logs, so it is confirmed by definition — this label
                        reports that fact rather than tracking a status we do
                        not hold. Pending payments simply do not appear yet. */}
                    <span className="text-success">Confirmed</span>
                    <span aria-hidden="true">·</span>
                    <span>{relativeTime(t.timestamp) ?? `block ${t.blockNumber.toString()}`}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{shortAddress(t.txHash)}</span>
                  </div>
                </div>
                <div className="text-sm font-semibold text-success tabular-nums shrink-0">
                  +{Number(t.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })}{' '}
                  <span className="text-xs font-normal text-ink-secondary">{t.symbol}</span>
                </div>
              </div>
            );
            return (
              <li key={`${t.txHash}-${t.symbol}`}>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="block">
                    {row}
                  </a>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-ink-muted mt-4">
        Only recent blocks are scanned, so older payments may not appear.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- page */

export default function MerchantPage() {
  const { address } = useWallet();
  const chain = useActiveChain();

  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  // localStorage is unavailable during SSR, so the profile can only be read
  // after mount. Nothing is rendered until then, to avoid a hydration flash
  // where an existing merchant is briefly shown the setup screen.
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<'request' | 'payments'>('request');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setReady(true);
  }, []);

  const handleSave = useCallback((next: MerchantProfile) => {
    saveProfile(next);
    setProfile(next);
    setEditing(false);
  }, []);

  if (!ready) {
    return (
      <div className="max-w-lg mx-auto animate-in">
        <div className="glass p-10 text-center text-sm text-ink-muted">Loading…</div>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="max-w-lg mx-auto animate-in">
        <h1 className="text-3xl font-bold mb-1">Merchant</h1>
        <p className="text-ink-secondary text-sm mb-8">
          Accept stablecoin payments with a shareable link or QR code.
        </p>
        <div className="glass p-10 text-center">
          <div className="text-5xl mb-4">🏪</div>
          <h2 className="text-2xl font-bold mb-2">Set up Merchant</h2>
          <p className="text-ink-secondary">
            Connect your wallet to start accepting payments.
          </p>
        </div>
      </div>
    );
  }

  if (!profile || editing) {
    return (
      <Setup
        address={address}
        initial={editing ? profile : null}
        onSave={handleSave}
        onCancel={editing && profile ? () => setEditing(false) : null}
      />
    );
  }

  return (
    <div className="max-w-lg mx-auto animate-in">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-3xl font-bold min-w-0 break-words">{profile.name}</h1>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-ink-secondary hover:text-ink-primary mt-2 shrink-0"
        >
          Edit
        </button>
      </div>
      <p className="text-ink-secondary text-sm mb-8">
        {profile.category ? `${profile.category} · ` : ''}Accepting on{' '}
        <span className="text-accent-text">{chain.label}</span>
      </p>

      <div className="flex gap-2 mb-6">
        {(
          [
            ['request', 'Payment request'],
            ['payments', 'Payments'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            // A solid accent fill needs ink chosen against *it*, not the page.
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
              tab === key
                ? 'bg-accent text-accent-contrast'
                : 'bg-surface-input text-ink-secondary hover:bg-surface-hover/[0.06]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'request' ? (
        <RequestBuilder profile={profile} chainId={chain.id} />
      ) : (
        <Payments profile={profile} />
      )}

      {/* The payout address is the one detail that, if wrong, misdirects every
          future payment, so it stays visible rather than hidden behind Edit. */}
      <div className="mt-6 flex items-center justify-between gap-3 text-xs text-ink-muted">
        <span className="font-mono truncate">{profile.wallet}</span>
        <button
          onClick={() => {
            clearProfile();
            setProfile(null);
          }}
          className="hover:text-ink-secondary shrink-0"
        >
          Remove profile
        </button>
      </div>
    </div>
  );
}
