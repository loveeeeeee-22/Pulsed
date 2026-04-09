'use client'

import { useEffect } from 'react'

const GREEN = '#22C55E'
const RED = '#EF4444'

/**
 * Bottom-right toast for a newly inserted trade (e.g. MT5 realtime).
 * Auto-dismisses after 5s; RLS ensures only the user’s rows trigger UI.
 */
export default function NewTradeToast({ trade, onClose }) {
  useEffect(() => {
    if (!trade) return undefined
    const t = setTimeout(() => {
      onClose()
    }, 5000)
    return () => clearTimeout(t)
  }, [trade?.id, onClose])

  if (!trade) return null

  const pnl = Number(trade.net_pnl ?? 0)
  const borderColor = pnl >= 0 ? GREEN : RED
  const sym = trade.symbol ?? '—'
  const dir = trade.direction != null ? String(trade.direction) : '—'
  const pnlStr = `${pnl >= 0 ? '+' : ''}$${Number.isFinite(pnl) ? pnl.toFixed(2) : '0.00'}`

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 200,
        maxWidth: 'min(360px, calc(100vw - 32px))',
        padding: '14px 16px',
        borderRadius: '12px',
        background: 'var(--card-bg, #1a1a1a)',
        border: `1px solid ${borderColor}`,
        boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
        color: 'var(--text, #f4f4f5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3, #a1a1aa)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            New trade recorded
          </div>
          <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.35 }}>
            <span style={{ color: 'var(--text, #fafafa)' }}>{sym}</span>
            <span style={{ color: 'var(--text3, #a1a1aa)', margin: '0 6px' }}>·</span>
            <span style={{ color: 'var(--text2, #d4d4d8)' }}>{dir}</span>
          </div>
          <div style={{ marginTop: '6px', fontSize: '15px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: borderColor }}>
            {pnlStr}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          style={{
            flexShrink: 0,
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            border: '1px solid var(--border, #333)',
            background: 'var(--bg3, #262626)',
            color: 'var(--text2, #d4d4d8)',
            cursor: 'pointer',
            fontSize: '18px',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
