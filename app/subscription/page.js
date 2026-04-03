'use client'

import { useEffect } from 'react'
import Link from 'next/link'

const planRow = {
  border: '1px solid var(--border)',
  borderRadius: '10px',
  background: 'var(--bg3)',
  padding: '14px 18px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: '8px',
}

export default function SubscriptionPlansPage() {
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', '#7C3AED')
  }, [])

  const plans = [
    {
      name: 'Free',
      badge: 'Current',
      highlight: true,
      blurb: 'Everything you use today — journaling, dashboards, and core tools.',
      note: 'No payment required.',
    },
    {
      name: 'Pro',
      badge: 'Coming later',
      highlight: false,
      blurb: 'Advanced analytics, deeper backtests, and priority features as we ship them.',
      note: 'Pricing and perks will be announced when this tier opens.',
    },
    {
      name: 'Team',
      badge: 'Coming later',
      highlight: false,
      blurb: 'Shared workspaces and coaching workflows for groups — planned for a future release.',
      note: 'Details TBD.',
    },
  ]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--page-bg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          background: 'var(--card-bg)',
          padding: '28px 26px 32px',
          boxSizing: 'border-box',
          textAlign: 'center',
        }}
      >
        <div style={{ marginBottom: '18px', textAlign: 'center' }}>
          <Link
            href="/settings"
            style={{
              fontSize: '12px',
              fontFamily: 'monospace',
              color: 'var(--accent)',
              textDecoration: 'none',
            }}
          >
            ← Back to settings
          </Link>
        </div>

        <header style={{ marginBottom: '22px' }}>
          <p
            style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              color: 'var(--text3)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              margin: 0,
            }}
          >
            Subscription
          </p>
          <h1 style={{ marginTop: '8px', marginBottom: 0, fontSize: '26px', fontWeight: 700 }}>Plans & offers</h1>
          <p
            style={{
              marginTop: '12px',
              marginBottom: 0,
              fontSize: '14px',
              color: 'var(--text2)',
              lineHeight: 1.55,
            }}
          >
            You are on the <strong style={{ color: 'var(--text)' }}>free</strong> plan. Paid tiers and add-ons will appear here as the product grows — nothing to buy yet, but this page is where all offers will live.
          </p>
        </header>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {plans.map(p => (
            <div
              key={p.name}
              style={{
                ...planRow,
                borderColor: p.highlight ? 'var(--accent)' : 'var(--border)',
                boxShadow: p.highlight ? '0 0 0 1px rgba(124, 58, 237, 0.2)' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)' }}>{p.name}</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: p.highlight ? 'var(--accent)' : 'var(--text3)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '3px 8px',
                  }}
                >
                  {p.badge}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5, margin: 0, maxWidth: '100%' }}>{p.blurb}</p>
              <p style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', margin: 0 }}>{p.note}</p>
            </div>
          ))}
        </div>

        <p
          style={{
            marginTop: '22px',
            marginBottom: 0,
            fontSize: '11px',
            color: 'var(--text3)',
            fontFamily: 'monospace',
            lineHeight: 1.5,
          }}
        >
          When new plans go live, you will be able to upgrade or change billing from this page.
        </p>
      </div>
    </div>
  )
}
