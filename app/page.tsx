'use client';
import { FeatureCard } from '@/components/FeatureCard';
import { Logo } from '@/components/Logo';
import { useWallet } from '@/lib/useWallet';


const features = [
  { icon: '💸', title: 'Send Money', description: 'Send USDC instantly to anyone, anywhere. Zero gas fees on ARC.', href: '/send' },
  { icon: '🔄', title: 'Smart Swap', description: 'Swap stablecoins with AI-powered routing for the best rates.', href: '/swap' },
  { icon: '🌉', title: 'Bridge', description: 'Move USDC across 9+ chains seamlessly with Circle CCTP v2.', href: '/bridge' },
  { icon: '📊', title: 'Portfolio', description: 'Track all your stablecoin holdings across chains in one view.', href: '/portfolio' },
  { icon: '🤖', title: 'AI Assistant', description: 'Get spending insights, budgeting tips, and smart suggestions.', href: '/assistant' },
  { icon: '💳', title: 'Pay Merchant', description: 'Scan & pay at any merchant accepting stablecoins.', href: '/merchant' },
];

/*
 * Capability figures, not traction figures.
 *
 * This strip previously read "$18.5M+ volume processed" and "42,000+ active
 * users". Nothing in the app produces those numbers — they were invented, and
 * on a product with no users yet they are a false claim, the kind that collapses
 * the moment anyone asks how it was measured. Everything here is instead a fact
 * about what is built, and each one can be checked in the repository: the chain
 * count comes from `lib/chains.ts`, the contract count from `contracts/`, and
 * the settlement claim from ARC's own finality rather than from our metrics.
 */
const stats = [
  { label: 'Chains supported', value: '9' },
  { label: 'Stablecoins routed', value: 'USDC · EURC · USDT' },
  { label: 'Onchain contracts', value: '4' },
  { label: 'Gas on USDC transfers', value: 'Zero' },
];


export default function HomePage() {
  const { connect } = useWallet();
  return (
    <div className="min-h-screen">
      {/* Hero */}
      {/* Left-aligned rather than centred, and no blurred colour pools behind
          it. Centred hero copy over two glows is the layout every crypto
          landing page uses; an asymmetric masthead set against the page's own
          grid is the editorial reference this design is built on. */}
      <section className="relative pt-16 pb-24 border-b-2 border-hairline">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 border-2 border-hairline bg-accent text-accent-contrast label-mono !text-accent-contrast mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-contrast" />
              Built on ARC — The Economic OS
            </div>

            {/* Tight leading and heavy tracking-in: at this size the type is the
                design, so it is set as a masthead rather than as a sentence. */}
            <h1 className="font-display text-6xl md:text-8xl font-bold leading-[0.92] tracking-[-0.045em] mb-6">
              <span className="text-ink-primary">Your money,</span>
              <br />
              <span className="text-ink-primary">flowing</span>{' '}
              {/* The one accent on the page, used as a printed highlight —
                  ink on chartreuse, so it reads at any size in either theme. */}
              <span className="bg-accent text-accent-contrast px-2 border-2 border-hairline">
                freely.
              </span>
            </h1>

            <p className="text-lg md:text-xl text-ink-secondary mb-10 max-w-2xl leading-relaxed">
              Send, swap, bridge, pay and manage your stablecoins — all in one app.
              Built on ARC for sub-second finality and zero gas on USDC.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">

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

      {/* Stats. Divided by rules rather than floated in space, so the strip
          reads as one table of facts instead of four unrelated numbers. */}
      <section className="border-b-2 border-hairline">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-y-2 md:divide-y-0 md:divide-x-2 divide-hairline">
            {stats.map((s) => (
              <div key={s.label} className="py-8 md:px-6 first:md:pl-0 last:md:pr-0">
                {/* Ink, not the accent: these are facts, and reserving the
                    accent for a single highlight is what keeps it loud. */}
                <div className="text-2xl md:text-3xl font-bold tracking-tight text-ink-primary">
                  {s.value}
                </div>
                <div className="label-mono mt-2">{s.label}</div>
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
          {/* Flat accent panel — no glow, no gradient wash. */}
          <div className="border-2 border-hairline bg-accent p-10 text-center shadow-float">
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-accent-contrast mb-3">
              Ready to flow?
            </h2>
            {/*
              Was "Join thousands using ArcFlow" — the same invented traction as
              the old stats strip, and not a claim this project can make. What is
              true is that it needs no signup, which is also the more persuasive
              line to someone deciding whether to click.
            */}
            <p className="text-accent-contrast/75 mb-8 max-w-md mx-auto">
              Connect a wallet to start. No signup, no KYC for core features, and
              nothing custodial — your keys stay yours.
            </p>
            <button
              onClick={connect}
              className="px-10 py-4 text-lg font-semibold border-2 border-hairline
                bg-surface-card text-ink-primary shadow-card
                hover:-translate-y-0.5 active:translate-y-0 transition-transform duration-150"
            >
              Connect wallet &amp; start
            </button>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-arc-500/10 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent border-2 border-hairline flex items-center justify-center">
                <Logo className="w-5 h-5 text-accent-contrast" />
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
