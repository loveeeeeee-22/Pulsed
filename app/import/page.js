'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const LABELS = {
  mt5: 'MetaTrader 5',
  mt4: 'MetaTrader 4',
  tradovate: 'Tradovate',
}

function ImportContent() {
  const searchParams = useSearchParams()
  const broker = (searchParams.get('broker') || 'mt5').toLowerCase()
  const name = LABELS[broker] || LABELS.mt5

  return (
    <>
      <p style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pulsed</p>
      <h1 style={{ fontSize: '26px', fontWeight: 700, marginTop: '8px' }}>Import trades</h1>
      <p style={{ fontSize: '14px', color: 'var(--text3)', marginTop: '8px' }}>
        Platform preset: <strong style={{ color: 'var(--text)' }}>{name}</strong> — CSV import UI will live here. Upload your broker export when this flow is
        ready.
      </p>
      <div style={{ marginTop: '24px' }}>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
            color: 'var(--accent)',
            padding: '10px 18px',
            fontSize: '13px',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Back to dashboard
        </Link>
      </div>
    </>
  )
}

export default function ImportPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--page-bg)',
        color: 'var(--text)',
        padding: '32px 24px',
        maxWidth: '720px',
        margin: '0 auto',
      }}
    >
      <Suspense fallback={<p style={{ color: 'var(--text3)' }}>Loading…</p>}>
        <ImportContent />
      </Suspense>
    </div>
  )
}
