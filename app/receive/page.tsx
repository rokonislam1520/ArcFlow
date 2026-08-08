'use client';
/**
 * Receive — show the user's address as a scannable code and a copyable string.
 *
 * The QR is generated locally rather than through an image API, because
 * sending the address to a third party to be rendered would leak it and make
 * the page dependent on a service that could go away.
 *
 * The encoded payload follows EIP-681, so a wallet scanning it can prefill the
 * chain, token and amount instead of the user retyping them.
 */
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { parseUnits } from 'viem';
import { getChainTokens } from '@/lib/chains';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { useChainBalances } from '@/lib/useBalances';

/**
 * Build an EIP-681 request URI.
 *
 * Native transfers use `ethereum:<addr>@<chainId>?value=`, whereas ERC-20s
 * address the *token* contract and call `transfer`. Getting this wrong makes a
 * scanning wallet send the wrong asset, so the two are kept distinct.
 */
function buildPaymentUri(args: {
  address: string;
  chainId: number;
  token: string;
  tokenAddress?: string;
  amount?: string;
  decimals: number;
}): string {
  const { address, chainId, token, tokenAddress, amount, decimals } = args;

  let base: string;
  const params: string[] = [];

  if (token === 'NATIVE' || !tokenAddress) {
    base = `ethereum:${address}@${chainId}`;
    if (amount) {
      try {
        params.push(`value=${parseUnits(amount, decimals).toString()}`);
      } catch {
        // An unparseable amount simply yields an address-only request.
      }
    }
  } else {
    base = `ethereum:${tokenAddress}@${chainId}/transfer`;
    params.push(`address=${address}`);
    if (amount) {
      try {
        params.push(`uint256=${parseUnits(amount, decimals).toString()}`);
      } catch {
        /* ignore */
      }
    }
  }

  return params.length ? `${base}?${params.join('&')}` : base;
}

export default function ReceivePage() {
  const { address } = useWallet();
  const chain = useActiveChain();
  const { balances } = useChainBalances(chain, (address as `0x${string}`) ?? null);

  const tokens = useMemo(() => getChainTokens(chain), [chain]);
  const [token, setToken] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<'address' | 'uri' | null>(null);

  const activeToken = tokens.includes(token as never) ? token : tokens[0];

  // Decimals come from the live balance read, not a hardcoded 6, so the
  // encoded amount is correct for tokens that differ.
  const decimals =
    balances.find((b) =>
      activeToken === 'NATIVE' ? b.address === undefined : b.symbol === activeToken
    )?.decimals ?? (activeToken === 'NATIVE' ? chain.nativeCurrency.decimals : 6);

  const uri = useMemo(() => {
    if (!address || chain.chainId === undefined) return '';
    return buildPaymentUri({
      address,
      chainId: chain.chainId,
      token: activeToken,
      // Narrowed to the registry's known symbols; anything else has no address
      // and correctly falls back to a native-value request.
      tokenAddress:
        activeToken === 'NATIVE'
          ? undefined
          : chain.tokens[activeToken as keyof typeof chain.tokens],
      amount: amount || undefined,
      decimals,
    });
  }, [address, chain, activeToken, amount, decimals]);

  useEffect(() => {
    if (!uri) {
      setQr(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(uri, {
      width: 320,
      margin: 2,
      // High correction keeps the code scannable even if partly obscured.
      errorCorrectionLevel: 'H',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  async function copy(text: string, what: 'address' | 'uri') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard can be blocked; the value stays visible for manual copying.
    }
  }

  if (!address) {
    return (
      <div className="max-w-lg mx-auto animate-in">
        <h1 className="text-3xl font-bold mb-1">Receive</h1>
        <div className="glass p-6 mt-8 text-center text-slate-400 text-sm">
          Connect your wallet to show your address.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto animate-in">
      <h1 className="text-3xl font-bold mb-1">Receive</h1>
      <p className="text-slate-400 text-sm mb-8">
        Share this to be paid on <span className="text-arc-400">{chain.label}</span>.
      </p>

      <div className="glass p-6 space-y-5">
        <div className="flex justify-center">
          {qr ? (
            <img
              src={qr}
              alt={`QR code containing a payment request to ${address}`}
              className="rounded-xl w-56 h-56 bg-white p-1"
            />
          ) : (
            <div className="w-56 h-56 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs text-slate-500">
              Generating…
            </div>
          )}
        </div>

        {/* Same address on every EVM chain, but funds only arrive on the one
            the sender uses — worth stating plainly. */}
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-xs text-amber-200/90">
          Only send assets on {chain.label}. Funds sent on another network will not appear here.
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">Asset</label>
          <div className="flex flex-wrap gap-2">
            {tokens.map((t) => (
              <button
                key={t}
                onClick={() => setToken(t)}
                className={`px-4 py-2 rounded-xl text-sm border transition-colors ${
                  activeToken === t
                    ? 'border-arc-500 bg-arc-500/15 text-arc-300'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                {t === 'NATIVE' ? chain.nativeCurrency.symbol : t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">
            Requested amount <span className="text-slate-600">(optional)</span>
          </label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="Any amount"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-arc-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">Your address</label>
          <div className="flex gap-2">
            <code className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3 font-mono text-xs break-all">
              {address}
            </code>
            <button
              onClick={() => void copy(address, 'address')}
              className="px-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm shrink-0"
            >
              {copied === 'address' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <button
          onClick={() => void copy(uri, 'uri')}
          className="w-full py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 hover:bg-white/10"
        >
          {copied === 'uri' ? 'Payment link copied' : 'Copy payment link'}
        </button>
      </div>
    </div>
  );
}
