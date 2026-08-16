'use client';
/**
 * Send — same-chain transfer of any token the active chain supports.
 *
 * App Kit handles the ERC-20 mechanics; this page's job is to only ever submit
 * a valid request: real balance, checksummed recipient, amount within funds.
 */
import { useEffect, useMemo, useState } from 'react';
import { isAddress, parseUnits, type Address } from 'viem';
import { getChainTokens, type TokenAlias } from '@/lib/chains';
import { useWallet, useActiveChain } from '@/lib/WalletProvider';
import { useNetworkMode } from '@/lib/network';
import { useChainBalances } from '@/lib/useBalances';
import { useAppKitOps } from '@/lib/useAppKitOps';
import { useOpNotifications } from '@/lib/notifications';
import { OpStatus } from '@/components/OpStatus';
import { TokenSelector } from '@/components/TokenSelector';
import { RecipientPicker } from '@/components/RecipientPicker';
import { TokenMark } from '@/components/BrandMark';
import { tokensForChain, shortAddress } from '@/lib/swapTokens';
import { useAddressBook, MAX_LABEL_LENGTH } from '@/lib/addressBook';
import { useRecentRecipients } from '@/lib/useRecentRecipients';
import { checkGas, checkRecipient, mergeReports, type SafetyReport } from '@/lib/safety';

export default function SendPage() {
  const { address, adapter, isUnsupportedChain } = useWallet();
  const chain = useActiveChain();
  const { balances, refresh } = useChainBalances(chain, address as Address | null);
  const { state, isBusy, hasQuote, quoteSend, submit, cancelQuote, reset } = useAppKitOps();

  // Surface this transfer in the notification feed once it is broadcast, so it
  // is still visible after navigating away from the success screen.
  useOpNotifications(state, chain);

  const { isTestnet } = useNetworkMode();
  const book = useAddressBook(address ?? null);
  const recents = useRecentRecipients(address as Address | null, isTestnet);

  const tokens = useMemo(() => getChainTokens(chain), [chain]);
  const [token, setToken] = useState<TokenAlias>('USDC');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);

  /** Recipient and gas checks for the transfer currently quoted. */
  const [safety, setSafety] = useState<SafetyReport | null>(null);
  const [safetyPending, setSafetyPending] = useState(false);

  /** Name field for the post-transfer save prompt. */
  const [saveLabel, setSaveLabel] = useState('');
  /** The address just paid, held so it survives clearing the form. */
  const [justSent, setJustSent] = useState('');

  // The selected token may not exist on a newly selected chain.
  const activeToken = tokens.includes(token) ? token : tokens[0];

  /**
   * The selected token as a display record, for the chip's logo and symbol.
   *
   * Derived from `activeToken` rather than tracked separately, so the thing
   * shown is always the alias the transaction will actually use — including
   * after a network change silently falls back to the chain's first token.
   */
  const selectedToken = useMemo(
    () => tokensForChain(chain).find((t) => t.alias === activeToken) ?? null,
    [chain, activeToken]
  );

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

  /** The saved contact for the address in the field, when there is one. */
  const matchedContact = useMemo(() => book.lookup(to), [book, to]);

  /**
   * The transfer amount in native base units, or zero when the asset is a token.
   *
   * Only meaningful for a native send, where the amount and the fee are drawn
   * from the same balance — that is the case `checkGas` must add together, and
   * the one where sending the full balance cannot succeed. A token transfer
   * leaves the gas balance untouched, so it contributes nothing here.
   */
  const nativeValue = useMemo(() => {
    if (activeToken !== 'NATIVE' || !amount) return 0n;
    try {
      return parseUnits(amount, chain.nativeCurrency.decimals);
    } catch {
      // Unparseable input is already reported by `validationError`; inventing a
      // number here would produce a gas verdict about an amount nobody entered.
      return 0n;
    }
  }, [activeToken, amount, chain]);

  /**
   * Run the recipient and gas checks when — and only when — a quote appears.
   *
   * Tied to the quote rather than to keystrokes for three reasons: every check
   * costs RPC calls, which typing would fire on each character; the report
   * belongs to a specific reviewed transfer, so recomputing it while the
   * confirm card is open would let the text change under the user's cursor; and
   * the gas check needs the quote's own fee lines, which do not exist until the
   * SDK has answered.
   */
  useEffect(() => {
    if (state.stage !== 'quoted' || !isAddress(to) || !address) {
      setSafety(null);
      setSafetyPending(false);
      return;
    }

    let active = true;
    setSafetyPending(true);
    setSafety(null);

    // Both run together: one waiting on the other would double the delay in
    // front of the confirm button for two independent reads.
    void Promise.all([
      checkRecipient({
        chain,
        to,
        knownRecipient: book.knownAddresses.has(to.toLowerCase()),
        sentBefore: recents.sentBefore(to),
      }),
      checkGas({ chain, from: address, quote: state.quote, value: nativeValue }),
    ]).then(([recipient, gas]) => {
      // Discarded when the quote was cancelled or replaced mid-flight, so a
      // stale report can never be attached to a different transfer.
      if (!active) return;
      setSafety(mergeReports(recipient, gas));
      setSafetyPending(false);
    });

    return () => {
      active = false;
    };
    // `book` and `recents` are intentionally read at quote time only: adding
    // them here would re-run the checks when an unrelated contact is saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.stage, state.quote, to, chain, address, nativeValue]);

  /** Step 1: fetch a real quote. Nothing is signed here. */
  async function onQuote() {
    if (!canSubmit) return;
    await quoteSend({ chain, to, amount, token: activeToken });
  }

  /** Step 2: submit what was quoted, then clear the form on success. */
  async function onConfirm() {
    const recipient = to;
    const result = await submit();
    if (result) {
      // Counters move only for money that actually moved, which is why this
      // sits after the SDK resolves rather than beside the quote.
      book.recordUse(recipient);
      setJustSent(recipient);
      setSaveLabel('');
      setAmount('');
      setTo('');
      void refresh();
    }
  }

  /** Name the address just paid, from the success panel. */
  function onSaveRecipient() {
    if (!saveLabel.trim() || !isAddress(justSent)) return;
    book.save({ address: justSent, label: saveLabel, chainId: chain.id });
    // Credit the transfer that prompted the save: it happened, and a contact
    // created this way would otherwise show a zero count next to it.
    book.recordUse(justSent);
    setJustSent('');
    setSaveLabel('');
  }

  return (
    <div className="max-w-lg mx-auto animate-in">
      <h1 className="text-3xl font-bold mb-1">Send</h1>
      <p className="text-ink-secondary text-sm mb-8">
        Transfer on <span className="text-accent-text">{chain.label}</span>. Change networks from the
        navbar.
      </p>

      <div className="glass p-6 space-y-5">
        <div>
          <label className="block text-sm text-ink-secondary mb-2">Token</label>
          {/*
            One chip opening the shared picker, rather than a button per token.
            The row of buttons could not show logos or search, and it grew wider
            with every token a chain supports; a chip stays a fixed size and
            hands the list to the same modal the Swap page uses.
          */}
          <button
            onClick={() => setPickerOpen(true)}
            disabled={isBusy}
            aria-haspopup="dialog"
            className="w-full flex items-center gap-3 pl-2 pr-3 py-2 rounded-2xl
                       bg-surface-input border border-hairline
                       hover:bg-surface-hover/[0.06] hover:border-arc-500/30 active:scale-[0.99]
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface-hover/[0.06]
                       transition-all duration-200 ease-premium"
          >
            {selectedToken ? (
              <>
                <TokenMark token={selectedToken} size={36} />
                <span className="text-left leading-tight min-w-0">
                  <span className="block text-sm font-bold">{selectedToken.symbol}</span>
                  <span className="block text-[11px] text-ink-muted truncate">
                    {selectedToken.name}
                  </span>
                </span>
              </>
            ) : (
              <span className="pl-1 text-sm text-ink-secondary">Select token</span>
            )}
            <svg
              className="w-4 h-4 text-ink-muted shrink-0 ml-auto"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm text-ink-secondary">Recipient</label>
            <button
              onClick={() => setRecipientPickerOpen(true)}
              disabled={isBusy}
              aria-haspopup="dialog"
              className="text-xs text-accent-text hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Contacts
              {book.contacts.length > 0 && ` (${book.contacts.length})`}
            </button>
          </div>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value.trim())}
            placeholder="0x… or pick a contact"
            spellCheck={false}
            className="w-full bg-surface-input border border-hairline rounded-xl px-4 py-3 font-mono text-sm focus:border-arc-500 outline-none"
          />

          {/*
            Naming the matched contact under the field is the confirmation that
            the picker chose what the user intended — a hex string alone cannot
            be checked by eye.
          */}
          {matchedContact && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold">{matchedContact.label}</span>
              {matchedContact.useCount > 0 && (
                <span className="text-ink-muted">
                  · paid {matchedContact.useCount}
                  {matchedContact.useCount === 1 ? ' time' : ' times'}
                </span>
              )}
            </p>
          )}
        </div>

        <div>
          <div className="flex justify-between text-sm text-ink-secondary mb-2">
            <label>Amount</label>
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
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="0.00"
            className="w-full bg-surface-input border border-hairline rounded-xl px-4 py-3 text-lg focus:border-arc-500 outline-none"
          />
        </div>

        {validationError && to && <p className="text-sm text-warning">{validationError}</p>}

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
          safety={safety}
          safetyPending={safetyPending}
        />

        {/*
          Offered after success, not before: at this point the transfer is known
          to have worked, which is the evidence that the address was right. A
          prompt beforehand would invite saving an address that is about to fail
          — and quietly auto-saving every recipient would fill the book with
          one-off addresses nobody chose to keep.
        */}
        {state.stage === 'success' && justSent && !book.knownAddresses.has(justSent.toLowerCase()) && (
          <div className="rounded-xl border border-hairline bg-surface-input p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold">Save this recipient?</p>
              <p className="text-xs text-ink-muted font-mono mt-0.5">{shortAddress(justSent, 10, 8)}</p>
            </div>
            <div className="flex gap-2">
              <input
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value.slice(0, MAX_LABEL_LENGTH))}
                placeholder="Name, e.g. Alice"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveRecipient();
                }}
                className="flex-1 min-w-0 bg-surface-card border border-hairline rounded-xl px-3 py-2 text-sm focus:border-arc-500 outline-none"
              />
              <button
                onClick={onSaveRecipient}
                disabled={!saveLabel.trim()}
                className="btn-arc px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                Save
              </button>
              <button
                onClick={() => setJustSent('')}
                className="px-3 py-2 rounded-xl text-sm text-ink-secondary hover:text-ink-primary shrink-0"
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {(state.stage === 'success' || state.stage === 'error') && !isBusy && (
          <button onClick={reset} className="w-full text-sm text-ink-secondary hover:text-ink-primary">
            Start another transfer
          </button>
        )}
      </div>

      {/*
        Locked to the active chain: a transfer here is same-chain, so a token on
        any other network could not be sent even if it were selectable. The
        picker's own `alias` is what the transaction uses, so selection needs no
        translation.
      */}
      <TokenSelector
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(t) => setToken(t.alias)}
        lockedChain={chain}
        title={`Send on ${chain.label}`}
      />

      {/*
        Saved contacts plus counterparties from scanned history. Both write to
        the same field the user can still edit by hand: the picker is a
        shortcut, never a lock, so an address that is not in either list is
        never harder to send to than before.
      */}
      <RecipientPicker
        isOpen={recipientPickerOpen}
        onClose={() => setRecipientPickerOpen(false)}
        onSelect={setTo}
        contacts={book.contacts}
        recents={recents.recipients}
        recentsLoading={recents.loading}
        onSave={(input) => book.save({ ...input, chainId: chain.id })}
        onRemove={book.remove}
      />
    </div>
  );
}
