'use client';
/**
 * Send — same-chain transfer of any token the active chain supports.
 *
 * App Kit handles the ERC-20 mechanics; this page's job is to only ever submit
 * a valid request: real balance, checksummed recipient, amount within funds.
 */
import { useMemo, useState } from 'react';
import { isAddress, parseUnits, type Address } from 'viem';
import { getChainTokens } from '@/lib/chains';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { useChainBalances } from '@/lib/useBalances';
import { useAppKitOps } from '@/lib/useAppKitOps';
import { OpStatus } from '@/components/OpStatus';

export default function SendPage() {
  const { address, adapter, isUnsupportedChain } = useWallet();
  const chain = useActiveChain();
  const { balances, refresh } = useChainBalances(chain, address as Address | null);
  const { state, isBusy, hasQuote, quoteSend, submit, cancelQuote, reset } = useAppKitOps();

  const tokens = useMemo(() => getChainTokens(chain), [chain]);
  const [token, setToken] = useState<string>('USDC');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');

  // The selected token may not exist on a newly selected chain.
  const activeToken = tokens.includes(token as never) ? token : tokens[0];

  const balance = balances.find((b) =>
    activeToken === 'NATIVE' ? b.address === undefined : b.symbol === activeToken
  );

  /** Validation shown inline, so the wallet is never opened for a doomed tx. */
  const validationError = useMemo(() => {
    if (!address) return 'Connect your wallet to continue.';
    if (isUnsupportedChain) return 'Switch to a supported network.';
    if (to && !isAddress(to)) return 'Recipient is not a valid address.';
    // The SDK rejects self-transfers outright, so say so before quoting.
    if (to && address && to.toLowerCase() === address.toLowerCase()) {
      return 'That is your own address.';
    }
    if (!amount) return null;

    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) return 'Enter an amount greater than zero.';

    if (balance) {
      try {
        // Compare in base units: float math would misjudge amounts near the balance.
        if (parseUnits(amount, balance.decimals) > balance.raw) {
          return `Insufficient ${balance.symbol}. You have ${balance.formatted}.`;
        }
      } catch {
        return 'Amount has too many decimal places.';
      }
    }
    return null;
  }, [address, isUnsupportedChain, to, amount, balance]);

  const canSubmit =
    !!address && !!adapter && !!to && !!amount && !validationError && !isBusy && !hasQuote;

  /** Step 1: fetch a real quote. Nothing is signed here. */
  async function onQuote() {
    if (!canSubmit) return;
    await quoteSend({ chain, to, amount, token: activeToken });
  }

  /** Step 2: submit what was quoted, then clear the form on success. */
  async function onConfirm() {
    const result = await submit();
    if (result) {
      setAmount('');
      setTo('');
      void refresh();
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-1">Send</h1>
      <p className="text-slate-400 text-sm mb-8">
        Transfer on <span className="text-arc-400">{chain.label}</span>. Change networks from the
        navbar.
      </p>

      <div className="glass p-6 space-y-5">
        <div>
          <label className="block text-sm text-slate-400 mb-2">Token</label>
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
          <label className="block text-sm text-slate-400 mb-2">Recipient</label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 font-mono text-sm focus:border-arc-500 outline-none"
          />
        </div>

        <div>
          <div className="flex justify-between text-sm text-slate-400 mb-2">
            <label>Amount</label>
            {balance && (
              <button
                onClick={() => setAmount(balance.formatted.replace(/,/g, ''))}
                className="text-arc-400 hover:underline"
              >
                Max: {balance.formatted}
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

        {validationError && to && <p className="text-sm text-amber-400">{validationError}</p>}

        {/* Hidden while a quote is on screen: the confirm action lives there. */}
        {!hasQuote && state.stage !== 'success' && (
          <button
            onClick={onQuote}
            disabled={!canSubmit}
            className="btn-arc w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isBusy ? 'Working…' : 'Review transfer'}
          </button>
        )}

        <OpStatus
          state={state}
          chain={chain}
          onConfirm={onConfirm}
          onCancel={cancelQuote}
        />

        {(state.stage === 'success' || state.stage === 'error') && !isBusy && (
          <button onClick={reset} className="w-full text-sm text-slate-400 hover:text-white">
            Start another transfer
          </button>
        )}
      </div>
    </div>
  );
}
