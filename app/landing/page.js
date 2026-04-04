import Link from 'next/link'

const accent = '#7C3AED'

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)', color: 'var(--text)', padding: '28px 16px 42px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '980px', margin: '0 auto' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '26px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pulsed</div>
            <div style={{ fontSize: '26px', fontWeight: 900, lineHeight: 1.05 }}>Track trades. Learn faster.</div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Link
              href="/auth?mode=signup"
              style={{
                textDecoration: 'none',
                background: accent,
                color: '#fff',
                borderRadius: '10px',
                padding: '10px 16px',
                fontSize: '13px',
                fontFamily: 'monospace',
                fontWeight: 600,
              }}
            >
              Sign up
            </Link>
            <Link
              href="/auth?mode=login"
              style={{
                textDecoration: 'none',
                border: '1px solid var(--border)',
                background: 'var(--bg3)',
                color: 'var(--text)',
                borderRadius: '10px',
                padding: '10px 16px',
                fontSize: '13px',
                fontFamily: 'monospace',
                fontWeight: 600,
              }}
            >
              Log in
            </Link>
          </div>
        </header>

        <section style={{ marginTop: '10px' }}>
          <h1 style={{ fontSize: '40px', margin: '0 0 12px', fontWeight: 900, letterSpacing: '-0.02em' }}>
            Structure your trading. Replay what matters.
          </h1>
          <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.7, color: 'var(--text2)', maxWidth: '760px' }}>
            Pulsed helps you journal with structure, replay decision-making, and turn results into actionable insights. Start with free essentials, then expand into pro analytics over time.
          </p>
        </section>

        <section style={{ marginTop: '26px' }}>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
            Features
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '14px' }}>
            {[
              { title: 'Journal with rules', desc: 'Track entry/exit behavior and link trades to your playbooks.' },
              { title: 'Trade Replay', desc: 'Visualize how the trade moved and review your decisions clearly.' },
              { title: 'Smart insights', desc: 'Equity curves, KPIs, and deeper breakdowns as you grow.' },
              { title: 'Multi-account ready', desc: 'Organize prop and personal accounts without losing clarity.' },
            ].map(card => (
              <div key={card.title} style={{ border: '1px solid var(--border)', borderRadius: '14px', background: 'var(--card-bg)', padding: '16px 16px 18px' }}>
                <div style={{ fontSize: '14px', fontFamily: 'monospace', fontWeight: 800, marginBottom: '8px' }}>{card.title}</div>
                <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>{card.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: '26px' }}>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
            Pricing
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '14px' }}>
            {[
              {
                title: 'Free',
                price: '$0',
                desc: 'Start journaling and reviewing your trades.',
                bullets: ['Core KPIs', 'Equity + Daily P&L', 'Basic Trade Replay'],
                cta: { href: '/auth?mode=signup', label: 'Start free' },
              },
              {
                title: 'Pro',
                price: '$9/mo',
                desc: 'Unlock deeper insights and performance breakdowns.',
                bullets: ['Advanced Analytics', 'Drawdown + streaks', 'Symbol performance tables'],
                cta: { href: '/auth?mode=signup', label: 'Go Pro' },
              },
            ].map(plan => (
              <div key={plan.title} style={{ border: `1px solid ${plan.title === 'Pro' ? 'rgba(124,58,237,0.6)' : 'var(--border)'}`, borderRadius: '14px', background: 'var(--card-bg)', padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ fontSize: '14px', fontFamily: 'monospace', fontWeight: 900 }}>{plan.title}</div>
                  <div style={{ fontSize: '22px', fontFamily: 'monospace', fontWeight: 900, color: plan.title === 'Pro' ? accent : 'var(--text)' }}>{plan.price}</div>
                </div>
                <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>{plan.desc}</div>
                <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
                  {plan.bullets.map(b => (
                    <div key={b} style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px', color: 'var(--text2)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: accent, display: 'inline-block' }} />
                      <span style={{ fontFamily: 'monospace' }}>{b}</span>
                    </div>
                  ))}
                </div>
                <Link
                  href={plan.cta.href}
                  style={{
                    marginTop: '14px',
                    display: 'inline-flex',
                    textDecoration: 'none',
                    background: plan.title === 'Pro' ? accent : 'var(--bg3)',
                    color: plan.title === 'Pro' ? '#fff' : 'var(--text)',
                    border: plan.title === 'Pro' ? 'none' : '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    justifyContent: 'center',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  {plan.cta.label}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: '26px' }}>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
            Testimonials
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '14px' }}>
            {[
              { quote: 'Finally, my rules make sense when I can see what I followed and what I missed.', by: 'Trader A' },
              { quote: 'Trade replay helped me spot the exact moment my plan broke down.', by: 'Trader B' },
              { quote: 'The KPIs are clean and easy to understand. Less guessing.', by: 'Trader C' },
            ].map(t => (
              <div key={t.by} style={{ border: '1px solid var(--border)', borderRadius: '14px', background: 'var(--card-bg)', padding: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.7 }}>&quot;{t.quote}&quot;</div>
                <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'monospace' }}>{t.by}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: '26px', border: '1px solid var(--border)', borderRadius: '16px', background: 'var(--card-bg)', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Ready to start?
              </div>
              <div style={{ marginTop: '6px', fontSize: '18px', fontWeight: 900 }}>Join Pulsed and turn trades into insight.</div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <Link
                href="/auth?mode=signup"
                style={{
                  textDecoration: 'none',
                  background: accent,
                  color: '#fff',
                  borderRadius: '12px',
                  padding: '12px 18px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  fontWeight: 800,
                }}
              >
                Sign up
              </Link>
              <Link
                href="/auth?mode=login"
                style={{
                  textDecoration: 'none',
                  border: '1px solid var(--border)',
                  background: 'var(--bg3)',
                  color: 'var(--text)',
                  borderRadius: '12px',
                  padding: '12px 18px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  fontWeight: 800,
                }}
              >
                Log in
              </Link>
            </div>
          </div>
        </section>

        <footer style={{ marginTop: '30px', color: 'var(--text3)', fontFamily: 'monospace', fontSize: '11px' }}>
          © {new Date().getFullYear()} Pulsed. Built for traders who want clarity.
        </footer>
      </div>
    </div>
  )
}

