'use client';
import { FeatureCard } from '@/components/FeatureCard';
import { useWallet } from '@/lib/useWallet';

const features = [
  { icon: '💸', title: 'Send Money', description: 'Send USDC instantly to anyone, anywhere. Zero gas fees on ARC.', href: '/send' },
  { icon: '🔄', title: 'Smart Swap', description: 'Swap stablecoins with AI-powered routing for the best rates.', href: '/swap' },
  { icon: '🌉', title: 'Bridge', description: 'Move USDC across 9+ chains seamlessly with Circle CCTP v2.', href: '/bridge' },
  { icon: '📊', title: 'Portfolio', description: 'Track all your stablecoin holdings across chains in one view.', href: '/portfolio' },
  { icon: '🤖', title: 'AI Assistant', description: 'Get spending insights, budgeting tips, and smart suggestions.', href: '/assistant' },
  { icon: '💳', title: 'Pay Merchant', description: 'Scan & pay at any merchant accepting stablecoins.', href: '/merchant' },
];

const stats = [
  { label: 'Volume Processed', value: '$18.5M+' },
  { label: 'Active Users', value: '42,000+' },
  { label: 'Chains Supported', value: '9' },
  { label: 'Avg. Transfer Time', value: '<2s' },
];

export default function HomePage() {
  const { connect } = useWallet();
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative pt-20 pb-32 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-1/3 w-[500px] h-[500px] bg-arc-500/10 rounded-full blur-[150px] animate-pulse-slow" />
          <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] bg-mint-500/8 rounded-full blur-[120px] animate-pulse-slow" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-arc-500/10 border border-arc-500/20 text-accent-text text-sm font-medium mb-8">
              <span className="w-2 h-2 rounded-full bg-arc-400 animate-pulse" />
              Built on ARC — The Economic OS
            </div>

            <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-6">
              <span className="text-ink-primary">Your Money,</span>
              <br />
              <span className="text-gradient">Flowing Freely.</span>
            </h1>

            <p className="text-xl text-ink-secondary mb-10 max-w-2xl mx-auto leading-relaxed">
              Send, swap, bridge, pay & manage your stablecoins — all in one app.
              Built on ARC for sub-second finality and zero gas on USDC.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/dashboard" className="btn-arc px-8 py-4 text-lg inline-flex items-center justify-center gap-2">
                Launch App
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </a>
              <a href="#features" className="btn-outline px-8 py-4 text-lg inline-flex items-center justify-center">
                Explore Features
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-arc-500/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-gradient">{s.value}</div>
                <div className="text-ink-muted text-sm mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need</h2>
            <p className="text-ink-secondary text-lg max-w-2xl mx-auto">
              One app for all your stablecoin needs. No more switching between wallets, bridges, and exchanges.
            </p>
          </div>

          {/* Three across, so the six cards fill two even rows rather than
              leaving a short trailing row. */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-24 border-t border-arc-500/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How ArcFlow Works</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Connect', desc: 'Link your wallet in one click. No KYC needed for basic features.' },
              { step: '02', title: 'Fund', desc: 'Deposit USDC from any chain, or buy directly with card/bank.' },
              { step: '03', title: 'Flow', desc: 'Send, swap, pay, and manage — all with sub-second finality.' },
            ].map((s) => (
              <div key={s.step} className="glass p-8 text-center">
                <div className="text-4xl font-extrabold text-arc-500/30 mb-4">{s.step}</div>
                <h3 className="text-xl font-bold mb-2">{s.title}</h3>
                <p className="text-ink-secondary text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-4">
          <div className="glass p-10 text-center glow-teal relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-arc-500/5 to-mint-500/5" />
            <div className="relative">
              <h2 className="text-3xl font-bold mb-4">Ready to Flow?</h2>
              <p className="text-ink-secondary mb-8">Join thousands using ArcFlow for everyday stablecoin finance.</p>
              <button onClick={connect} className="btn-arc px-10 py-4 text-lg">Connect Wallet & Start</button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-arc-500/10 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-arc-500 to-mint-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-ink-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="font-bold text-gradient">ArcFlow</span>
            </div>
            <div className="flex gap-6 text-sm text-ink-muted">
              <a href="#" className="hover:text-ink-primary">Docs</a>
              <a href="#" className="hover:text-ink-primary">Twitter</a>
              <a href="#" className="hover:text-ink-primary">Discord</a>
              <a href="#" className="hover:text-ink-primary">GitHub</a>
            </div>
            <p className="text-sm text-ink-muted">© 2026 ArcFlow. Built on ARC.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
