'use client';
import { useState } from 'react';

const suggestions = [
  'How much did I spend this month?',
  'Show my portfolio breakdown',
  'What are the best yield options?',
  'Set up auto-savings',
  'Analyze my spending patterns',
];

const chatHistory = [
  { role: 'user', text: 'How much USDC do I have across all chains?' },
  { role: 'ai', text: 'You have a total of $12,653.50 in stablecoins across 4 chains:\n\n• ARC: $9,733.50 (USDC + EURC)\n• Ethereum: $2,100.00 (USDC)\n• Polygon: $500.00 (USDT)\n• Arbitrum: $320.00 (DAI)\n\nYour ARC wallet holds 76% of your total portfolio.' },
  { role: 'user', text: 'Any suggestions to earn more?' },
  { role: 'ai', text: 'Based on your holdings, here are my top recommendations:\n\n1. **USDC Savings Vault** — Move $5,000 to the ARC vault for 8.5% APR\n2. **EURC/USDC LP** — Provide liquidity for 12% APR\n3. **Bridge ETH USDC to ARC** — Save on gas and earn ARC rewards\n\nShall I set up any of these for you?' },
];

export default function AssistantPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(chatHistory);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages([...messages, { role: 'user', text: input }]);
    setInput('');
    setTimeout(() => {
      setMessages((prev) => [...prev, { role: 'ai', text: 'I\'m analyzing your request. This feature will be connected to the AI backend soon. For now, try one of the suggested prompts below!' }]);
    }, 1000);
  };

  return (
    <div className="min-h-screen py-8 animate-in">
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">AI Assistant</h1>
          <p className="text-slate-400">Your personal stablecoin financial advisor</p>
        </div>

        {/* Chat Area */}
        <div className="glass p-6 min-h-[500px] flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-6">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-arc-500/20 border border-arc-500/30 text-white'
                    : 'bg-white/[0.05] border border-white/10 text-slate-300'
                }`}>
                  {msg.role === 'ai' && <div className="text-arc-400 text-xs font-semibold mb-1">ArcFlow AI</div>}
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Suggestions */}
          <div className="flex flex-wrap gap-2 mb-4">
            {suggestions.map((s) => (
              <button key={s} onClick={() => setInput(s)} className="px-3 py-1.5 rounded-full bg-white/5 text-slate-400 text-xs hover:bg-white/10 hover:text-white transition-all">
                {s}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about your finances..."
              className="input-arc flex-1 text-base"
            />
            <button onClick={handleSend} className="btn-arc px-6">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </div>
        </div>

        {/* AI Capabilities */}
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          {[
            { icon: '📊', title: 'Spending Insights', desc: 'Track where your money goes' },
            { icon: '💰', title: 'Yield Optimization', desc: 'Find the best earning opportunities' },
            { icon: '🔔', title: 'Smart Alerts', desc: 'Get notified about important events' },
          ].map((c) => (
            <div key={c.title} className="glass p-5 text-center">
              <div className="text-2xl mb-2">{c.icon}</div>
              <div className="font-semibold text-sm mb-1">{c.title}</div>
              <div className="text-slate-400 text-xs">{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
