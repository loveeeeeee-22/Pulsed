'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PLATFORMS = [
  {
    id: 'mt5',
    name: 'MetaTrader 5 (MT5)',
    short: 'MT5',
    badgeNum: '5',
    color: '#1A3FA8',
    supported: 'Forex, Futures, CFDs, Crypto',
    status: 'AVAILABLE',
    tag: 'Most Popular',
  },
  {
    id: 'mt4',
    name: 'MetaTrader 4 (MT4)',
    short: 'MT4',
    badgeNum: '4',
    color: '#1565C0',
    supported: 'Forex, CFDs',
    status: 'AVAILABLE',
    tag: null,
  },
  {
    id: 'tradovate',
    name: 'Tradovate',
    short: 'TV',
    color: '#0D47A1',
    supported: 'Futures, Options',
    status: 'AVAILABLE',
    tag: 'Futures',
  },
]

const IMPORT_RANGES = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '6m', label: 'Last 6 months' },
  { value: 'all', label: 'All time' },
]

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--bg3)',
  color: 'var(--text)',
  padding: '10px 12px',
  fontSize: '13px',
  fontFamily: 'monospace',
}

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontFamily: 'monospace',
  color: 'var(--text3)',
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const SUCCESS = '#22C55E'

function CardCheck({ show }) {
  if (!show) return null
  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        width: '22px',
        height: '22px',
        borderRadius: '50%',
        background: SUCCESS,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 700,
      }}
    >
      ✓
    </div>
  )
}

function IconSync() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4V1M12 4a5 5 0 0 1 4.9 3.2M12 4a5 5 0 0 0-4.9 3.2M12 1v3M4.2 5.1l2.1 2.1M19.7 5.1l-2.1 2.1M12 20v3m0-3a5 5 0 0 0 4.9-3.2M12 20a5 5 0 0 1-4.9-3.2M12 23v-3M4.2 18.9l2.1-2.1M19.7 18.9l-2.1-2.1"
        stroke="var(--accent)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconUpload() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16V4m0 0l-4 4m4-4 4 4M4 20h16"
        stroke="var(--text2)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconPencil() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h3.5l9.2-9.2a2.3 2.3 0 0 0 0-3.2l-1.1-1.1a2.3 2.3 0 0 0-3.2 0L4 15.3V20Z"
        stroke="var(--text2)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function BrokerSyncModal({ isOpen, onClose, onSuccess }) {
  const router = useRouter()
  const [accent, setAccent] = useState('#7C3AED')
  const [step, setStep] = useState(1)
  const [platform, setPlatform] = useState(null)
  const [importMethod, setImportMethod] = useState(null)

  const [mtServer, setMtServer] = useState('')
  const [mtLogin, setMtLogin] = useState('')
  const [mtPassword, setMtPassword] = useState('')
  const [mtHistory, setMtHistory] = useState('90d')

  const [tvUser, setTvUser] = useState('')
  const [tvPassword, setTvPassword] = useState('')
  const [tvEnv, setTvEnv] = useState('live')
  const [tvHistory, setTvHistory] = useState('90d')

  const [saving, setSaving] = useState(false)
  /** 0 = form, 1–3 = in progress, 4 = all sub-steps done + final copy (Tradovate pending) */
  const [connStep, setConnStep] = useState(0)
  const [connectDone, setConnectDone] = useState(false)
  const [saveError, setSaveError] = useState('')
  /** MT4/MT5 MetaApi: post-connect success (step 4) */
  const [mtSuccess, setMtSuccess] = useState(false)
  const [successProgress, setSuccessProgress] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = window.localStorage.getItem('accentColor')
    if (raw && /^#[0-9A-Fa-f]{6}$/.test(raw.trim())) setAccent(raw.trim())
  }, [isOpen])

  const reset = useCallback(() => {
    setStep(1)
    setPlatform(null)
    setImportMethod(null)
    setMtServer('')
    setMtLogin('')
    setMtPassword('')
    setMtHistory('90d')
    setTvUser('')
    setTvPassword('')
    setTvEnv('live')
    setTvHistory('90d')
    setSaving(false)
    setConnStep(0)
    setConnectDone(false)
    setSaveError('')
    setMtSuccess(false)
    setSuccessProgress(0)
  }, [])

  useEffect(() => {
    if (isOpen) reset()
  }, [isOpen, reset])

  const platformLabel = useMemo(
    () => PLATFORMS.find((p) => p.id === platform)?.name || 'Platform',
    [platform]
  )

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const goContinueStep1 = () => {
    if (!platform) return
    setStep(2)
  }

  const goContinueStep2 = () => {
    if (!importMethod) return
    if (importMethod === 'file') {
      const q = platform === 'mt4' || platform === 'mt5' || platform === 'tradovate' ? platform : 'mt5'
      router.push(`/import?broker=${q}`)
      handleClose()
      onSuccess?.()
      return
    }
    if (importMethod === 'manual') {
      router.push('/new-trade')
      handleClose()
      onSuccess?.()
      return
    }
    if (importMethod === 'auto') {
      setStep(3)
    }
  }

  const runConnectAnimation = useCallback(() => {
    setConnStep(1)
    setTimeout(() => setConnStep(2), 900)
    setTimeout(() => setConnStep(3), 2000)
    setTimeout(() => {
      setConnStep(4)
      setConnectDone(true)
    }, 3000)
  }, [])

  useEffect(() => {
    if (!mtSuccess) return
    setSuccessProgress(0)
    const start = Date.now()
    const duration = 10_000
    const t = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / duration) * 100)
      setSuccessProgress(p)
      if (p >= 100) clearInterval(t)
    }, 100)
    return () => clearInterval(t)
  }, [mtSuccess])

  const handleConnectSubmit = async (e) => {
    e?.preventDefault?.()
    setSaveError('')

    if (platform === 'mt5' || platform === 'mt4') {
      if (!mtServer.trim() || !mtLogin.trim() || !mtPassword.trim()) {
        setSaveError('Please fill in server, account number, and investor password.')
        return
      }
      setSaving(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) {
        setSaveError('You must be signed in.')
        setSaving(false)
        return
      }
      try {
        const res = await fetch('/api/metaapi/connect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            login: mtLogin.trim(),
            password: mtPassword,
            server: mtServer.trim(),
            platform,
            environment: 'live',
            historyRange: mtHistory,
            pulsedAccountId: null,
          }),
        })
        const result = await res.json().catch(() => ({}))
        if (!res.ok) {
          setSaveError(result.error || 'Connection failed')
          setSaving(false)
          return
        }
        onSuccess?.()
        setSaving(false)
        setMtSuccess(true)
        setStep(4)
      } catch {
        setSaveError('Network error. Please try again.')
        setSaving(false)
      }
      return
    }

    if (platform === 'tradovate') {
      if (!tvUser.trim() || !tvPassword.trim()) {
        setSaveError('Please enter your Tradovate email and password.')
        return
      }
    } else {
      setSaveError('Select a platform.')
      return
    }

    setSaving(true)
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()
    if (userErr || !user?.id) {
      setSaveError('You must be signed in.')
      setSaving(false)
      return
    }

    const historyKey = platform === 'tradovate' ? tvHistory : mtHistory
    const brokerName = 'tradovate'
    const environment = tvEnv
    const credentials = {
      username: tvUser.trim().toLowerCase(),
      import_history: historyKey,
      tradovate_intent: true,
    }

    const { error: insErr } = await supabase.from('broker_connections').insert({
      user_id: user.id,
      broker_name: brokerName,
      environment: environment || null,
      sync_status: 'pending',
      is_active: true,
      credentials,
    })

    if (insErr) {
      setSaveError(
        insErr.message?.includes('sync_status') || insErr.message?.includes('check')
          ? 'Database may need migration for pending status. Run supabase/migrations/20260422120000_broker_sync_status_pending.sql in Supabase SQL.'
          : insErr.message || 'Could not save connection.'
      )
      setSaving(false)
      return
    }

    setSaving(false)
    onSuccess?.()
    runConnectAnimation()
  }

  if (!isOpen) return null

  const isMt = platform === 'mt4' || platform === 'mt5'
  const isTv = platform === 'tradovate'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="broker-sync-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => e.target === e.currentTarget && !saving && handleClose()}
    >
      <div
        style={{
          background: 'var(--page-bg)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          border: '1px solid var(--border)',
          position: 'relative',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '18px 20px 12px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            gap: '12px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path
                    d="M9 15.5S2 11 2 6.5A4.5 4.5 0 0 1 9 4.18 4.5 4.5 0 0 1 16 6.5C16 11 9 15.5 9 15.5Z"
                    fill="white"
                  />
                </svg>
              </div>
              <div>
                <h2 id="broker-sync-title" style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                  Connect a broker
                </h2>
                <p style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', margin: '2px 0 0' }}>
                  Step {mtSuccess ? 4 : step} of {mtSuccess ? 4 : 3}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            aria-label="Close"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg3)',
              color: 'var(--text2)',
              cursor: saving ? 'wait' : 'pointer',
              fontSize: '20px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Step tracker */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '12px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
          {(mtSuccess ? ['Platform', 'Method', 'Connect', 'Done'] : ['Platform', 'Method', 'Connect']).map((label, i) => {
            const n = i + 1
            const active = mtSuccess ? n === 4 : step === n
            const done = mtSuccess ? n < 4 : step > n
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {i > 0 ? (
                  <span style={{ color: 'var(--text3)', fontSize: '12px' }} aria-hidden>
                    →
                  </span>
                ) : null}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      background: done || active ? accent : 'var(--bg3)',
                      color: done || active ? '#fff' : 'var(--text3)',
                      border: active ? `2px solid ${accent}` : '1px solid var(--border)',
                    }}
                  >
                    {done ? '✓' : n}
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      color: active ? 'var(--text)' : 'var(--text3)',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 8px' }}>
          {saveError && (
            <div
              style={{
                marginBottom: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(239,68,68,0.45)',
                background: 'rgba(239,68,68,0.08)',
                color: '#fca5a5',
                padding: '10px 12px',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
            >
              {saveError}
            </div>
          )}

          {/* Step 1 */}
          {step === 1 && (
            <div
              style={{
                animation: 'bsFade 0.25s ease-out',
              }}
            >
              <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '8px 0 6px', color: 'var(--text)' }}>Select your trading platform</h3>
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '20px' }}>
                Choose the platform you use to execute your trades
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                }}
              >
                {PLATFORMS.map((p) => {
                  const selected = platform === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlatform(p.id)}
                      style={{
                        position: 'relative',
                        textAlign: 'left',
                        padding: '24px',
                        borderRadius: '12px',
                        background: selected ? 'var(--accent-subtle)' : 'var(--card-bg)',
                        border: selected ? `2px solid ${accent}` : '1px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'border 0.15s, background 0.15s',
                        color: 'var(--text)',
                      }}
                    >
                      <CardCheck show={selected} />
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          background: p.id === 'tradovate' ? p.color : p.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: '12px',
                          fontSize: p.id === 'tradovate' ? '12px' : '16px',
                          fontWeight: 800,
                          color: '#fff',
                          fontFamily: 'monospace',
                        }}
                      >
                        {p.id === 'tradovate' ? 'TV' : p.badgeNum}
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>{p.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.4, marginBottom: '8px' }}>{p.supported}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                        {p.tag && (
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              padding: '3px 8px',
                              borderRadius: '999px',
                              background: `${accent}22`,
                              color: accent,
                            }}
                          >
                            {p.tag}
                          </span>
                        )}
                        <span style={{ fontSize: '9px', fontFamily: 'monospace', color: SUCCESS }}>{p.status}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div style={{ animation: 'bsFade 0.25s ease-out' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '8px 0 6px', color: 'var(--text)' }}>How would you like to add trades?</h3>
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '18px' }}>
                Platform: <strong style={{ color: 'var(--text)' }}>{platformLabel}</strong>
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setImportMethod('auto')}
                  style={{
                    position: 'relative',
                    textAlign: 'left',
                    padding: '20px 16px',
                    borderRadius: '12px',
                    background: importMethod === 'auto' ? 'var(--accent-subtle)' : 'var(--card-bg)',
                    border: importMethod === 'auto' ? `2px solid ${accent}` : '1px solid var(--border)',
                    boxShadow: importMethod === 'auto' ? `0 0 24px ${accent}22` : '0 0 0 1px rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    transition: '0.15s',
                  }}
                >
                  <CardCheck show={importMethod === 'auto'} />
                  <div style={{ marginBottom: '8px' }}>
                    <IconSync />
                  </div>
                  <div style={{ display: 'inline-block', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: accent, marginBottom: '6px' }}>
                    Recommended
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Auto-sync</div>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.5, marginBottom: '10px' }}>
                    Connect your broker directly. Trades sync automatically in real time.
                  </p>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: 1.6 }}>
                    {['Real-time sync', 'No manual work', 'Historical import', 'Always up to date'].map((f) => (
                      <li key={f} style={{ display: 'flex', gap: '6px' }}>
                        <span style={{ color: SUCCESS }}>✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMethod('file')}
                  style={{
                    position: 'relative',
                    textAlign: 'left',
                    padding: '20px 16px',
                    borderRadius: '12px',
                    background: importMethod === 'file' ? 'var(--accent-subtle)' : 'var(--card-bg)',
                    border: importMethod === 'file' ? `2px solid ${accent}` : '1px solid var(--border)',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    transition: '0.15s',
                  }}
                >
                  <CardCheck show={importMethod === 'file'} />
                  <div style={{ marginBottom: '8px' }}>
                    <IconUpload />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>File upload</div>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.5, marginBottom: '10px' }}>
                    Export a CSV from your broker and upload it here.
                  </p>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: 1.6 }}>
                    <li style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ color: SUCCESS }}>✓</span> One-time import
                    </li>
                    <li style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ color: SUCCESS }}>✓</span> Works with any broker
                    </li>
                    <li style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ color: SUCCESS }}>✓</span> No connection needed
                    </li>
                    <li style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ color: 'var(--text3)' }}>~</span> Manual process
                    </li>
                  </ul>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMethod('manual')}
                  style={{
                    position: 'relative',
                    textAlign: 'left',
                    padding: '20px 16px',
                    borderRadius: '12px',
                    background: importMethod === 'manual' ? 'var(--accent-subtle)' : 'var(--card-bg)',
                    border: importMethod === 'manual' ? `2px solid ${accent}` : '1px solid var(--border)',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    transition: '0.15s',
                  }}
                >
                  <CardCheck show={importMethod === 'manual'} />
                  <div style={{ marginBottom: '8px' }}>
                    <IconPencil />
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Add manually</div>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.5, marginBottom: '10px' }}>
                    Log each trade yourself after it happens.
                  </p>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '11px', color: 'var(--text2)', lineHeight: 1.6 }}>
                    <li style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ color: SUCCESS }}>✓</span> Full control
                    </li>
                    <li style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ color: SUCCESS }}>✓</span> Works offline
                    </li>
                    <li style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ color: 'var(--text3)' }}>~</span> Time consuming
                    </li>
                  </ul>
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — auto only */}
          {step >= 3 && isMt && saving && !mtSuccess && (
            <div style={{ textAlign: 'center', padding: '32px 12px', animation: 'bsFade 0.25s ease-out' }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>Connecting…</div>
              <p style={{ fontSize: '13px', color: 'var(--text3)', margin: 0 }}>Contacting MetaApi and your broker server</p>
            </div>
          )}

          {step === 3 && isMt && connStep === 0 && !connectDone && !mtSuccess && !saving && (
            <form id="broker-form-mt" onSubmit={handleConnectSubmit} style={{ animation: 'bsFade 0.25s ease-out' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '8px 0 6px', color: 'var(--text)' }}>Connect {platform === 'mt5' ? 'MT5' : 'MT4'}</h3>
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '16px' }}>Enter your MetaTrader login credentials</p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.25)',
                  marginBottom: '16px',
                  fontSize: '12px',
                  color: 'var(--text2)',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ fontSize: '16px' }}>ℹ</span>
                <span>We use MetaApi to securely connect to your broker&apos;s server. Your credentials are encrypted end-to-end.</span>
              </div>
              <div style={{ display: 'grid', gap: '14px' }}>
                <div>
                  <label style={labelStyle} htmlFor="bs-mt-server">
                    Server
                  </label>
                  <input
                    id="bs-mt-server"
                    name="server"
                    type="text"
                    autoComplete="off"
                    placeholder="e.g. ICMarkets-Live01"
                    value={mtServer}
                    onChange={(e) => setMtServer(e.target.value)}
                    style={inputStyle}
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>Found in your MT5 login window or broker email</p>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="bs-mt-login">
                    Account number
                  </label>
                  <input
                    id="bs-mt-login"
                    name="login"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    placeholder="e.g. 12345678"
                    value={mtLogin}
                    onChange={(e) => setMtLogin(e.target.value.replace(/\D/g, ''))}
                    style={inputStyle}
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>Your MT account number (digits)</p>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="bs-mt-pw">
                    Investor password
                  </label>
                  <input
                    id="bs-mt-pw"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={mtPassword}
                    onChange={(e) => setMtPassword(e.target.value)}
                    style={inputStyle}
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
                    Use your INVESTOR (read-only) password, not your main password. Never stored in our database.
                  </p>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="bs-mt-hist">
                    Import trade history from
                  </label>
                  <select
                    id="bs-mt-hist"
                    value={mtHistory}
                    onChange={(e) => setMtHistory(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    {IMPORT_RANGES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text3)',
                  marginTop: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}
              >
                <span>🔒</span>
                <span>Read-only access only. We cannot place or modify trades. Your main password is never required.</span>
              </p>
            </form>
          )}

          {step === 3 && isTv && connStep === 0 && !connectDone && (
            <form id="broker-form-tv" onSubmit={handleConnectSubmit} style={{ animation: 'bsFade 0.25s ease-out' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '8px 0 6px', color: 'var(--text)' }}>Connect Tradovate</h3>
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '16px' }}>Sign in with your Tradovate account</p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.25)',
                  marginBottom: '16px',
                  fontSize: '12px',
                  color: 'var(--text2)',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ fontSize: '16px' }}>ℹ</span>
                <span>Your password is not stored. It will be used only when our Tradovate integration is fully enabled.</span>
              </div>
              <div style={{ display: 'grid', gap: '14px' }}>
                <div>
                  <label style={labelStyle} htmlFor="bs-tv-user">
                    Username (email)
                  </label>
                  <input
                    id="bs-tv-user"
                    type="email"
                    autoComplete="email"
                    value={tvUser}
                    onChange={(e) => setTvUser(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="bs-tv-pw">
                    Password
                  </label>
                  <input
                    id="bs-tv-pw"
                    type="password"
                    autoComplete="current-password"
                    value={tvPassword}
                    onChange={(e) => setTvPassword(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <span style={labelStyle}>Environment</span>
                  <div style={{ display: 'inline-flex', borderRadius: '999px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setTvEnv('live')}
                      style={{
                        border: 'none',
                        background: tvEnv === 'live' ? 'var(--accent-subtle)' : 'var(--bg3)',
                        color: tvEnv === 'live' ? accent : 'var(--text2)',
                        padding: '8px 16px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                      }}
                    >
                      Live
                    </button>
                    <button
                      type="button"
                      onClick={() => setTvEnv('demo')}
                      style={{
                        border: 'none',
                        borderLeft: '1px solid var(--border)',
                        background: tvEnv === 'demo' ? 'var(--accent-subtle)' : 'var(--bg3)',
                        color: tvEnv === 'demo' ? accent : 'var(--text2)',
                        padding: '8px 16px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                      }}
                    >
                      Demo
                    </button>
                  </div>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="bs-tv-hist">
                    Import history
                  </label>
                  <select
                    id="bs-tv-hist"
                    value={tvHistory}
                    onChange={(e) => setTvHistory(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    {IMPORT_RANGES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </form>
          )}

          {mtSuccess && isMt && (
            <div style={{ textAlign: 'center', padding: '16px 8px 8px', animation: 'bsFade 0.35s ease-out' }}>
              <div
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '50%',
                  margin: '0 auto 20px',
                  background: `linear-gradient(145deg, ${SUCCESS}33, ${SUCCESS}18)`,
                  border: `2px solid ${SUCCESS}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '36px',
                  color: SUCCESS,
                  boxShadow: `0 0 40px ${SUCCESS}33`,
                }}
              >
                ✓
              </div>
              <h3 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' }}>Connected successfully!</h3>
              <p style={{ fontSize: '14px', color: 'var(--text3)', margin: '0 0 20px', lineHeight: 1.5 }}>
                Your {platform === 'mt5' ? 'MT5' : 'MT4'} account is now syncing with Pulsed
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '10px' }}>Importing your trade history…</p>
              <div
                style={{
                  height: '8px',
                  borderRadius: '999px',
                  background: 'var(--bg3)',
                  overflow: 'hidden',
                  maxWidth: '360px',
                  margin: '0 auto 16px',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${successProgress}%`,
                    background: SUCCESS,
                    borderRadius: '999px',
                    transition: 'width 0.1s linear',
                  }}
                />
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text3)', margin: 0 }}>Trades will appear in your journal shortly</p>
            </div>
          )}

          {/* Tradovate pending animation */}
          {step === 3 && isTv && connStep > 0 && (
            <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '20px' }}>
                {connectDone ? 'Connection pending' : 'Connecting...'}
              </div>
              <ol style={{ listStyle: 'none', margin: '0 auto', padding: 0, maxWidth: '360px', textAlign: 'left' }}>
                {['Credentials received', 'Connecting to broker server...', 'Importing trade history', 'Sync complete'].map((line, i) => {
                  const s = connStep
                  const wait = i > s
                  const active = i === s && s < 4
                  const done = i < s
                  return (
                    <li
                      key={line}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '10px',
                        fontSize: '13px',
                        color: wait ? 'var(--text3)' : 'var(--text)',
                        opacity: wait ? 0.5 : 1,
                      }}
                    >
                      <span style={{ width: '20px', flexShrink: 0, textAlign: 'center' }}>
                        {wait ? <span style={{ color: 'var(--border-md)' }}>○</span> : null}
                        {active ? <span style={{ color: accent }}>⟳</span> : null}
                        {!wait && !active && done ? <span style={{ color: SUCCESS }}>✓</span> : null}
                        {!wait && !active && !done ? <span style={{ color: 'var(--border-md)' }}>○</span> : null}
                      </span>
                      {line}
                    </li>
                  )
                })}
              </ol>
              {connectDone && (
                <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6, marginTop: '20px', maxWidth: '420px', margin: '20px auto 0' }}>
                  Almost ready! Your Tradovate connection is being finalized. You will receive an email when your account is ready to sync.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '14px 20px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexShrink: 0,
            background: 'var(--page-bg)',
          }}
        >
          <div>
            {step > 1 &&
              !mtSuccess &&
              !((step === 3 && connectDone) || (step === 3 && isTv && connStep > 0 && !connectDone)) && (
              <button
                type="button"
                onClick={() => {
                  if (step === 3) setStep(2)
                  else if (step === 2) setStep(1)
                }}
                disabled={saving}
                style={{
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg3)',
                  color: 'var(--text2)',
                  padding: '10px 18px',
                  fontSize: '13px',
                  cursor: saving ? 'wait' : 'pointer',
                }}
              >
                Back
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {step === 1 && (
              <button
                type="button"
                onClick={goContinueStep1}
                disabled={!platform}
                style={{
                  borderRadius: '10px',
                  border: `1px solid ${accent}`,
                  background: platform ? accent : 'var(--bg3)',
                  color: platform ? '#fff' : 'var(--text3)',
                  padding: '10px 22px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: platform ? 'pointer' : 'not-allowed',
                }}
              >
                Continue
              </button>
            )}
            {step === 2 && (
              <button
                type="button"
                onClick={goContinueStep2}
                disabled={!importMethod}
                style={{
                  borderRadius: '10px',
                  border: `1px solid ${accent}`,
                  background: importMethod ? accent : 'var(--bg3)',
                  color: importMethod ? '#fff' : 'var(--text3)',
                  padding: '10px 22px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: importMethod ? 'pointer' : 'not-allowed',
                }}
              >
                Continue
              </button>
            )}
            {step === 3 && isMt && !connectDone && connStep === 0 && !mtSuccess && (
              <button
                type="submit"
                form="broker-form-mt"
                disabled={saving}
                style={{
                  borderRadius: '10px',
                  border: 'none',
                  background: saving ? 'var(--bg3)' : accent,
                  color: '#fff',
                  padding: '10px 22px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: saving ? 'wait' : 'pointer',
                }}
              >
                {saving ? 'Connecting...' : 'Connect & sync'}
              </button>
            )}
            {step === 3 && isTv && !connectDone && connStep === 0 && (
              <button
                type="submit"
                form="broker-form-tv"
                disabled={saving}
                style={{
                  borderRadius: '10px',
                  border: 'none',
                  background: saving ? 'var(--bg3)' : accent,
                  color: '#fff',
                  padding: '10px 22px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: saving ? 'wait' : 'pointer',
                }}
              >
                {saving ? 'Connecting...' : 'Connect & sync'}
              </button>
            )}
            {mtSuccess && isMt && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    router.push('/')
                    handleClose()
                  }}
                  style={{
                    borderRadius: '10px',
                    border: `1px solid ${accent}`,
                    background: accent,
                    color: '#fff',
                    padding: '10px 18px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Go to dashboard
                </button>
                <button
                  type="button"
                  onClick={() => reset()}
                  style={{
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg3)',
                    color: 'var(--text2)',
                    padding: '10px 18px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Connect another account
                </button>
              </>
            )}
            {step === 3 && connectDone && isTv && (
              <button
                type="button"
                onClick={handleClose}
                style={{
                  borderRadius: '10px',
                  border: `1px solid ${accent}`,
                  background: accent,
                  color: '#fff',
                  padding: '10px 22px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            )}
          </div>
        </div>

        <style>{`
          @keyframes bsFade {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </div>
  )
}
