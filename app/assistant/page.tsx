'use client';
import { useState } from 'react';
import { useWallet } from '@/lib/useWallet';
import { useTokenBalances, formatAmount } from '@/lib/useTokenBalance';
import { useActivity, shortenAddress } from '@/lib/useActivity';
import { WalletGuard } from '@/components/WalletGuard';
import { AVAILABLE_TOKENS, USDC_DECIMALS, CHAIN_NAME } from '@/lib/config';

/**
 * There is no LLM backend in this repo, so rather than fake a conversation the
 * assistant answers a fixed set of questions from real on-chain data. Anything
 * outside that set says so instead of inventing a response.
 */

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const suggestions = [
  'What are my balances?',
  'How much have I sent?',
  'How much have I received?',
  'Show my recent transfers',
];

function AssistantView() {
  const { address } = useWallet();
  const { balances } = useTokenBalances(address, AVAILABLE_TOKENS);
  const { activity } = useActivity(address, 50);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text:
        `Connected as ${address}.\n\n` +
        `I answer from on-chain data on ${CHAIN_NAME}. I am not a language model, ` +
        `so I can only handle the questions listed below.`,
    },
  ]);

  /** Deterministic answers derived from chain reads. No invented numbers. */
  const answer = (question: string): string => {
    const q = question.toLowerCase();

    if (q.includes('balance') || q.includes('hold')) {
      const lines = AVAILABLE_TOKENS.map((t) => {
        const raw = balances[t.symbol];
        return `• ${t.symbol}: ${raw === undefined ? 'unavailable' : formatAmount(raw, t.decimals)}`;
      });
      return lines.length > 0
        ? `Your balances on ${CHAIN_NAME}:\n\n${lines.join('\n')}`
        : 'No token addresses are configured, so I cannot read any balances.';
    }

    if (q.includes('sent') || q.includes('spend') || q.includes('spent')) {
      const sent = activity.filter((a) => a.direction === 'sent');
      if (sent.length === 0) return 'I found no outgoing transfers in the scanned block range.';
      const total = sent.reduce((sum, a) => sum + a.amount, 0n);
      const fees = sent.reduce((sum, a) => sum + a.fee, 0n);
      return (
        `You have sent ${formatAmount(total, USDC_DECIMALS)} USDC across ${sent.length} ` +
        `transfer${sent.length === 1 ? '' : 's'}, paying ${formatAmount(fees, USDC_DECIMALS)} USDC in fees.`
      );
    }

    if (q.includes('received') || q.includes('income')) {
      const received = activity.filter((a) => a.direction === 'received');
      if (received.length === 0) return 'I found no incoming transfers in the scanned block range.';
      const total = received.reduce((sum, a) => sum + a.amount, 0n);
      return `You have received ${formatAmount(total, USDC_DECIMALS)} USDC across ${received.length} transfer${received.length === 1 ? '' : 's'}.`;
    }

    if (q.includes('transfer') || q.includes('recent') || q.includes('activity') || q.includes('history')) {
      if (activity.length === 0) return 'I found no transfers in the scanned block range.';
      const lines = activity
        .slice(0, 5)
        .map(
          (a) =>
            `• ${a.direction === 'sent' ? 'Sent' : 'Received'} ${formatAmount(a.amount, USDC_DECIMALS)} USDC ` +
            `${a.direction === 'sent' ? 'to' : 'from'} ${shortenAddress(a.counterparty)} (block ${a.blockNumber})`
        );
      return `Your most recent transfers:\n\n${lines.join('\n')}`;
    }

    return (
      'I cannot answer that. I only read on-chain data and have no AI backend, so I am ' +
      'limited to balances and transfer history. Try one of the suggested questions.'
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
          <p className="text-slate-400">Answers read directly from {CHAIN_NAME}</p>
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
                      ? 'bg-arc-500/20 border border-arc-500/30 text-white'
                      : 'bg-white/[0.05] border border-white/10 text-slate-300'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="text-arc-400 text-xs font-semibold mb-1">On-chain data</div>
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
                className="px-3 py-1.5 rounded-full bg-white/5 text-slate-400 text-xs hover:bg-white/10 hover:text-white transition-all"
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
