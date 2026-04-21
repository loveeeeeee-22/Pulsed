'use client'

import { useEffect } from 'react'

/**
 * Short-lived bottom-right message (success or error styling).
 */
export default function BriefToast({ message, variant = 'success', onClose }) {
  useEffect(() => {
    if (!message) return undefined
    const t = setTimeout(() => onClose(), 4000)
    return () => clearTimeout(t)
  }, [message, onClose])

  if (!message) return null

  const borderColor = variant === 'error' ? '#EF4444' : '#22C55E'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 320,
        maxWidth: 'min(380px, calc(100vw - 32px))',
        padding: '14px 16px',
        borderRadius: '12px',
        background: 'var(--card-bg, #1a1a1a)',
        border: `1px solid ${borderColor}`,
        boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
        color: 'var(--text, #f4f4f5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ fontSize: '13px', lineHeight: 1.45, fontFamily: 'monospace' }}>{message}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
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
