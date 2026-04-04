'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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

export default function AccountDeletionSection() {
  const router = useRouter()
  const [sessionUser, setSessionUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePhrase, setDeletePhrase] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState({ type: '', text: '' })

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

  async function handleDeleteAccount(e) {
    e.preventDefault()
    setDeleteMessage({ type: '', text: '' })

    if (deletePhrase.trim().toUpperCase() !== 'DELETE') {
      setDeleteMessage({ type: 'error', text: 'Type DELETE in the confirmation box.' })
      return
    }
    if (!deletePassword.trim()) {
      setDeleteMessage({ type: 'error', text: 'Enter your password to confirm.' })
      return
    }

    const email = sessionUser?.email
    if (!email) {
      setDeleteMessage({ type: 'error', text: 'No email on file for this session.' })
      return
    }

    setDeletingAccount(true)
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email,
      password: deletePassword,
    })
    if (signErr) {
      setDeleteMessage({ type: 'error', text: signErr.message || 'Password is incorrect.' })
      setDeletingAccount(false)
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setDeleteMessage({ type: 'error', text: 'Could not read session. Try again.' })
      setDeletingAccount(false)
      return
    }

    const res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body.ok) {
      setDeleteMessage({
        type: 'error',
        text: body.error || 'Could not delete your account. Check server logs and Supabase migrations.',
      })
      setDeletingAccount(false)
      return
    }

    await supabase.auth.signOut()
    router.replace('/auth')
  }

  if (authLoading) {
    return <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Loading…</p>
  }

  if (!sessionUser) {
    return (
      <p style={{ fontSize: '13px', color: 'var(--text2)' }}>
        Sign in to manage account deletion.{' '}
        <a href="/auth" style={{ color: 'var(--accent)' }}>
          Go to sign in
        </a>
      </p>
    )
  }

  return (
    <div style={{ marginTop: '16px', maxWidth: '420px' }}>
      <p style={{ fontSize: '13px', color: 'var(--text3)', lineHeight: 1.55, marginBottom: '16px' }}>
        Permanently delete your login, profile, trading data, broker connections, and journal notes. This cannot be undone.
        The server needs <span style={{ fontFamily: 'monospace' }}>SUPABASE_SERVICE_ROLE_KEY</span> (same as broker sync APIs).
      </p>
      <form onSubmit={handleDeleteAccount} style={{ display: 'grid', gap: '12px' }}>
        {deleteMessage.text && (
          <div
            style={{
              borderRadius: '8px',
              border:
                deleteMessage.type === 'error' ? '1px solid rgba(239,68,68,0.45)' : '1px solid rgba(34,197,94,0.45)',
              background: deleteMessage.type === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
              color: deleteMessage.type === 'error' ? '#fca5a5' : '#86efac',
              padding: '10px 12px',
              fontSize: '12px',
              fontFamily: 'monospace',
            }}
          >
            {deleteMessage.text}
          </div>
        )}
        <div>
          <label htmlFor="delete-account-password" style={labelStyle}>
            <span style={reqMark} aria-hidden>
              *
            </span>
            Password
          </label>
          <input
            id="delete-account-password"
            name="delete-account-password"
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={e => setDeletePassword(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="delete-confirm-phrase" style={labelStyle}>
            <span style={reqMark} aria-hidden>
              *
            </span>
            Type DELETE to confirm
          </label>
          <input
            id="delete-confirm-phrase"
            name="delete-confirm-phrase"
            type="text"
            autoComplete="off"
            placeholder="DELETE"
            value={deletePhrase}
            onChange={e => setDeletePhrase(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <button
            type="submit"
            disabled={deletingAccount}
            style={{
              borderRadius: '10px',
              border: '1px solid rgba(239,68,68,0.6)',
              background: 'rgba(127,29,29,0.35)',
              color: '#fecaca',
              padding: '10px 20px',
              fontSize: '13px',
              fontFamily: 'monospace',
              cursor: deletingAccount ? 'wait' : 'pointer',
              opacity: deletingAccount ? 0.7 : 1,
            }}
          >
            {deletingAccount ? 'Deleting…' : 'Permanently delete my account'}
          </button>
        </div>
      </form>
    </div>
  )
}
