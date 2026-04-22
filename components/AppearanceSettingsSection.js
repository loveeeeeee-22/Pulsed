'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/lib/ThemeContext'

const ACCENT_SWATCHES = ['#7C3AED', '#2563EB', '#22C55E', '#F59E0B', '#EF4444', '#14B8A6', '#EC4899', '#64748B']

export default function AppearanceSettingsSection() {
  const { theme, setThemePreference } = useTheme()
  const [accent, setAccent] = useState('#7C3AED')

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem('accentColor') : null
    const next = raw && /^#[0-9A-Fa-f]{6}$/.test(raw.trim()) ? raw.trim() : '#7C3AED'
    setAccent(next)
  }, [])

  function selectAccent(hex) {
    setAccent(hex)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('accentColor', hex)
      document.documentElement.style.setProperty('--accent', hex)
    }
  }

  return (
    <div style={{ marginTop: '16px', display: 'grid', gap: '20px' }}>
      <div>
        <div
          style={{
            fontSize: '11px',
            fontFamily: 'monospace',
            color: 'var(--text3)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '8px',
          }}
        >
          Theme
        </div>
        <div style={{ display: 'inline-flex', borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setThemePreference('dark')}
            style={{
              border: 'none',
              background: theme === 'dark' ? 'var(--accent-subtle)' : 'var(--bg3)',
              color: theme === 'dark' ? 'var(--accent)' : 'var(--text2)',
              padding: '10px 18px',
              fontSize: '13px',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Dark
          </button>
          <button
            type="button"
            onClick={() => setThemePreference('light')}
            style={{
              border: 'none',
              borderLeft: '1px solid var(--border)',
              background: theme === 'light' ? 'var(--accent-subtle)' : 'var(--bg3)',
              color: theme === 'light' ? 'var(--accent)' : 'var(--text2)',
              padding: '10px 18px',
              fontSize: '13px',
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Light
          </button>
        </div>
        <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text3)' }}>
          Preference is saved in this browser and matches the app theme elsewhere.
        </p>
      </div>

      <div>
        <div
          style={{
            fontSize: '11px',
            fontFamily: 'monospace',
            color: 'var(--text3)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '8px',
          }}
        >
          Accent color
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {ACCENT_SWATCHES.map(c => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => selectAccent(c)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '999px',
                border: accent === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                boxShadow: accent === c ? `0 0 0 2px ${c}` : 'none',
                background: c,
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
        <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text3)' }}>
          Applied across navigation, buttons, and highlights. Saved in this browser.
        </p>
      </div>
    </div>
  )
}
