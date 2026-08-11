'use client';
/**
 * Assistant — answers questions from real on-chain data.
 *
 * There is no LLM backend in this repo, so rather than fake a conversation the
 * assistant answers a fixed set of questions by reading balances and transfer
 * history from the chain the wallet is actually connected to. Anything outside
 * that set says so instead of inventing a response.
 *
 * Every read here goes through the same hooks the rest of the app uses —
 * `useActiveChain`, `useChainBalances`, `useTransfers` — so the Assistant sees
 * exactly what Send, Swap, Bridge and Dashboard see. It holds no chain list,
 * no token addresses and no RPC configuration of its own; an earlier version
 * did, which is why it reported that no tokens were configured while every
 * other page was reading balances perfectly well.
 */
import { useState } from 'react';
import type { Address } from 'viem';
import { useWallet, useActiveChain, useChainMismatch } from '@/lib/WalletProvider';
import { useChainBalances, prettyAmount, type TokenBalance } from '@/lib/useBalances';
import { useTransfers, shortAddress, type Transfer } from '@/lib/useTransfers';
import { getChainTokens } from '@/lib/chains';
import { WalletGuard } from '@/components/WalletGuard';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const suggestions = [
  'What are my balances?',
  'How much have I sent?',
  'How much have I received?',
  'Show my recent transfers',
  'Which network am I on?',
];

/**
 * Sum transfers per token symbol.
 *
 * Totals stay per symbol rather than collapsing into one figure: a chain can
 * hold USDC, EURC and USDT at once, and those are different currencies with
 * independent decimals. Adding them together would invent an exchange rate the
 * app has not been given.
 */
function totalBySymbol(list: Transfer[]): string {
  const bySymbol = new Map<string, { raw: bigint; decimals: number }>();
  for (const t of list) {
    const existing = bySymbol.get(t.symbol);
    if (existing) existing.raw += t.raw;
    else bySymbol.set(t.symbol, { raw: t.raw, decimals: t.decimals });
  }
  return [...bySymbol.entries()]
    .map(([symbol, v]) => `${prettyAmount(v.raw, v.decimals)} ${symbol}`)
    .join(', ');
}

/** Native asset is flagged, since an empty gas balance is why sends fail. */
function describeBalance(b: TokenBalance): string {
  return `• ${b.symbol}: ${b.formatted}${b.address === undefined ? ' (gas)' : ''}`;
}

function AssistantView() {
  const { address } = useWallet();
  const chain = useActiveChain();
  const mismatch = useChainMismatch();

  const owner = (address as Address | null) ?? null;
  const {
    balances,
    isLoading: balancesLoading,
    error: balancesError,
  } = useChainBalances(chain, owner);
  const {
    transfers,
    loading: transfersLoading,
    error: transfersError,
  } = useTransfers(chain, owner, 25);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text:
        `Connected as ${address ? shortAddress(address) : '—'}.\n\n` +
        `I read live data from whichever network ArcFlow is on — currently ` +
        `${chain.label}. I am not a language model, so I can only answer the ` +
        `questions listed below.`,
    },
  ]);

  /** Deterministic answers derived from chain reads. No invented numbers. */
  const answer = (question: string): string => {
    const q = question.toLowerCase();

    // A wallet on a chain App Kit cannot route has nothing readable on it, so
    // say which network to move to rather than reporting an empty balance.
    if (mismatch) {
      return (
        `Your wallet is on a network ArcFlow cannot read ` +
        `${mismatch.reason === 'wrong-network-mode' ? '(it belongs to the other network mode)' : '(unsupported by App Kit)'}. ` +
        `Switch to ${mismatch.target.label} to see your balances and history.`
      );
    }

    if (q.includes('balance') || q.includes('hold') || q.includes('how much do i have')) {
      if (balancesLoading) return 'Reading balances from the chain…';
      if (balancesError) {
        return `I could not read balances from ${chain.label}: ${balancesError}`;
      }
      if (balances.length === 0) {
        return (
          `${chain.label} exposes no token contracts in the App Kit registry and ` +
          `returned no native balance, so there is nothing for me to report.`
        );
      }
      return `Your balances on ${chain.label}:\n\n${balances.map(describeBalance).join('\n')}`;
    }

    if (q.includes('sent') || q.includes('spend') || q.includes('spent')) {
      if (transfersLoading) return 'Scanning transfer history…';
      if (transfersError) return `I could not read your history: ${transfersError}`;
      const sent = transfers.filter((t) => t.direction === 'sent');
      if (sent.length === 0) {
        return `I found no outgoing transfers on ${chain.label} in the scanned block range.`;
      }
      return (
        `You have sent ${totalBySymbol(sent)} across ${sent.length} ` +
        `transfer${sent.length === 1 ? '' : 's'} in the scanned block range.`
      );
    }

    if (q.includes('received') || q.includes('income')) {
      if (transfersLoading) return 'Scanning transfer history…';
      if (transfersError) return `I could not read your history: ${transfersError}`;
      const received = transfers.filter((t) => t.direction === 'received');
      if (received.length === 0) {
        return `I found no incoming transfers on ${chain.label} in the scanned block range.`;
      }
      return (
        `You have received ${totalBySymbol(received)} across ${received.length} ` +
        `transfer${received.length === 1 ? '' : 's'} in the scanned block range.`
      );
    }

    if (q.includes('transfer') || q.includes('recent') || q.includes('activity') || q.includes('history')) {
      if (transfersLoading) return 'Scanning transfer history…';
      if (transfersError) return `I could not read your history: ${transfersError}`;
      if (transfers.length === 0) {
        return `I found no transfers on ${chain.label} in the scanned block range.`;
      }
      const lines = transfers.slice(0, 5).map((t) => {
        const verb = t.direction === 'sent' ? 'Sent' : 'Received';
        const preposition = t.direction === 'sent' ? 'to' : 'from';
        return (
          `• ${verb} ${prettyAmount(t.raw, t.decimals)} ${t.symbol} ` +
          `${preposition} ${shortAddress(t.counterparty)} (block ${t.blockNumber})`
        );
      });
      return `Your most recent transfers:\n\n${lines.join('\n')}`;
    }

    if (q.includes('network') || q.includes('chain')) {
      const tokens = getChainTokens(chain).filter((t) => t !== 'NATIVE');
      return (
        `You are on ${chain.label} (chain id ${chain.chainId ?? 'n/a'}).\n` +
        `Gas is paid in ${chain.nativeCurrency.symbol}.\n` +
        `Tokens I can read here: ${tokens.length > 0 ? tokens.join(', ') : 'none'}.`
      );
    }

    return (
      'I cannot answer that. I only read on-chain data and have no AI backend, so I am ' +
      'limited to balances, transfer history and network details. Try one of the ' +
      'suggested questions.'
    );
  };

  const handleSend = (text?: string) => {
    const question = (text ?? input).trim();
    if (!question) return;
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: question },
      { role: 'assistant', text: answer(question) },
    ]);
    setInput('');
  };

  return (
    <div className="animate-in">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Assistant</h1>
          <p className="text-ink-secondary">Answers read directly from {chain.label}</p>
        </div>

        <div className="glass p-6 min-h-[500px] flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-4 mb-6">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line break-words ${
                    msg.role === 'user'
                      ? 'bg-accent/12 border border-accent/30 text-accent-text'
                      : 'bg-surface-input border border-hairline text-ink-secondary'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="text-accent-text text-xs font-semibold mb-1">On-chain data</div>
                  )}
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="px-3 py-1.5 rounded-full bg-surface-input text-ink-secondary text-xs hover:bg-surface-hover/[0.06] hover:text-ink-primary transition-all"
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about your balances or transfers…"
              className="input-arc flex-1 text-base"
            />
            <button onClick={() => handleSend()} className="btn-arc px-6" aria-label="Send">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AssistantPage() {
  return (
    <WalletGuard featureName="Assistant">
      <AssistantView />
    </WalletGuard>
  );
}
