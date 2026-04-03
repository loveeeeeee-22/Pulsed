'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const inputStyle = {
  width: '100%',
  maxWidth: '420px',
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
  letterSpacing: '0.06em',
}

const reqMark = { color: '#ef4444', marginRight: '4px' }

export default function SecuritySettingsSection() {
  const [sessionUser, setSessionUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!cancelled) {
        setSessionUser(session?.user ?? null)
        setAuthLoading(false)
      }
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionUser(session?.user ?? null)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage({ type: '', text: '' })

    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setMessage({ type: 'error', text: 'Please fill in all fields.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New password and confirmation do not match.' })
      return
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters.' })
      return
    }

    const email = sessionUser?.email
    if (!email) {
      setMessage({ type: 'error', text: 'No email on file for this session.' })
      return
    }

    setSaving(true)
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })
    if (signErr) {
      setMessage({ type: 'error', text: signErr.message || 'Current password is incorrect.' })
      setSaving(false)
      return
    }

    const { error: updErr } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)

    if (updErr) {
      setMessage({ type: 'error', text: updErr.message || 'Could not update password.' })
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setMessage({ type: 'ok', text: 'Password updated successfully.' })
  }

  if (authLoading) {
    return <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Loading…</p>
  }

  if (!sessionUser) {
    return (
      <p style={{ fontSize: '13px', color: 'var(--text2)' }}>
        Sign in to change your password.{' '}
        <a href="/auth" style={{ color: 'var(--accent)' }}>
          Go to sign in
        </a>
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '16px', display: 'grid', gap: '16px' }}>
      {message.text && (
        <div
          style={{
            maxWidth: '420px',
            borderRadius: '8px',
            border:
              message.type === 'error' ? '1px solid rgba(239,68,68,0.45)' : '1px solid rgba(34,197,94,0.45)',
            background: message.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
            color: message.type === 'error' ? '#fca5a5' : '#86efac',
            padding: '10px 12px',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
        >
          {message.text}
        </div>
      )}

      <div>
        <label htmlFor="current-password" style={labelStyle}>
          <span style={reqMark} aria-hidden>
            *
          </span>
          Current password
        </label>
        <input
          id="current-password"
          name="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="new-password" style={labelStyle}>
          <span style={reqMark} aria-hidden>
            *
          </span>
          New password
        </label>
        <input
          id="new-password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="confirm-password" style={labelStyle}>
          <span style={reqMark} aria-hidden>
            *
          </span>
          Confirm password
        </label>
        <input
          id="confirm-password"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <button
          type="submit"
          disabled={saving}
          style={{
            borderRadius: '10px',
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: '#fff',
            padding: '10px 20px',
            fontSize: '13px',
            fontFamily: 'monospace',
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </form>
  )
}
