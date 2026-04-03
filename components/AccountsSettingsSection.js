'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const FREE_ACCOUNT_LIMIT = 5

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
  letterSpacing: '0.06em',
}

const MARKET_TYPES = [
  { value: 'futures', label: 'Futures' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'forex', label: 'Forex' },
]

const emptyModal = {
  name: '',
  balance: '',
  type: 'futures',
  category: 'personal',
  provider: '',
}

export default function AccountsSettingsSection() {
  const [sessionUser, setSessionUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [accounts, setAccounts] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyModal)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const loadAccounts = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) {
      setAccounts([])
      setListLoading(false)
      return
    }
    setListLoading(true)
    setListError('')
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', uid)
      .order('name', { ascending: true })

    if (error) {
      if (error.message?.includes('column') && error.message?.includes('user_id')) {
        setListError(
          'Your database needs the latest accounts columns. Run supabase/migrations/20260403000000_accounts_user_category.sql in the Supabase SQL editor, then refresh.'
        )
      } else {
        setListError(error.message || 'Could not load accounts.')
      }
      setAccounts([])
      setListLoading(false)
      return
    }
    setAccounts(data || [])
    setListLoading(false)
  }, [])

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

  useEffect(() => {
    if (!sessionUser?.id) {
      setListLoading(false)
      return
    }
    loadAccounts()
  }, [sessionUser?.id, loadAccounts])

  function openModal() {
    if (accounts.length >= FREE_ACCOUNT_LIMIT) return
    setForm(emptyModal)
    setSaveError('')
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!sessionUser?.id) return
    setSaveError('')

    const name = form.name.trim()
    const bal = parseFloat(String(form.balance).replace(/,/g, ''))
    if (!name) {
      setSaveError('Please enter an account name.')
      return
    }
    if (!Number.isFinite(bal)) {
      setSaveError('Please enter a valid starting balance.')
      return
    }
    const provider = form.provider.trim()
    if (!provider) {
      setSaveError(form.category === 'prop' ? 'Please enter the prop firm name.' : 'Please enter your broker name.')
      return
    }

    if (accounts.length >= FREE_ACCOUNT_LIMIT) {
      setSaveError(`Free plan allows up to ${FREE_ACCOUNT_LIMIT} accounts.`)
      return
    }

    setSaving(true)
    const { error } = await supabase.from('accounts').insert({
      name,
      balance: bal,
      type: form.type,
      category: form.category,
      provider,
      user_id: sessionUser.id,
    })

    setSaving(false)
    if (error) {
      if (error.message?.includes('user_id') || error.code === 'PGRST204') {
        setSaveError(
          'Saving failed: add the user_id column (see migration 20260403000000_accounts_user_category.sql) and try again.'
        )
      } else {
        setSaveError(error.message || 'Could not save account.')
      }
      return
    }

    setModalOpen(false)
    setForm(emptyModal)
    loadAccounts()
  }

  async function confirmDelete() {
    if (!deleteTarget?.id || !sessionUser?.id) return
    setDeleteError('')
    setDeleting(true)
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', deleteTarget.id)
      .eq('user_id', sessionUser.id)

    setDeleting(false)
    if (error) {
      const msg = error.message || ''
      if (/foreign key|violates|referenced/i.test(msg) || error.code === '23503') {
        setDeleteError(
          'This account still has trades linked to it. Delete or change those trades first, then try again.'
        )
      } else {
        setDeleteError(msg || 'Could not delete account.')
      }
      return
    }
    setDeleteTarget(null)
    loadAccounts()
  }

  if (authLoading) {
    return <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '16px' }}>Loading…</p>
  }

  if (!sessionUser) {
    return (
      <p style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '16px' }}>
        Sign in to manage accounts.{' '}
        <a href="/auth" style={{ color: 'var(--accent)' }}>
          Go to sign in
        </a>
      </p>
    )
  }

  const atLimit = accounts.length >= FREE_ACCOUNT_LIMIT

  return (
    <div style={{ marginTop: '16px' }}>
      <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '14px', fontFamily: 'monospace' }}>
        Free plan: up to {FREE_ACCOUNT_LIMIT} accounts ({accounts.length}/{FREE_ACCOUNT_LIMIT} used).
      </p>

      {listError && (
        <div
          style={{
            marginBottom: '12px',
            borderRadius: '8px',
            border: '1px solid rgba(234,179,8,0.45)',
            background: 'rgba(234,179,8,0.08)',
            color: '#fde047',
            padding: '10px 12px',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
        >
          {listError}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <button
          type="button"
          onClick={openModal}
          disabled={atLimit || listLoading}
          style={{
            borderRadius: '10px',
            border: '1px solid var(--accent)',
            background: atLimit ? 'var(--bg3)' : 'var(--accent)',
            color: atLimit ? 'var(--text3)' : '#fff',
            padding: '10px 18px',
            fontSize: '13px',
            fontFamily: 'monospace',
            cursor: atLimit || listLoading ? 'not-allowed' : 'pointer',
            opacity: listLoading ? 0.7 : 1,
          }}
        >
          Add account
        </button>
      </div>

      {listLoading ? (
        <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Loading accounts…</p>
      ) : accounts.length === 0 && !listError ? (
        <p style={{ fontSize: '13px', color: 'var(--text2)' }}>No accounts yet. Add one to start journaling trades.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
          {accounts.map(a => (
            <li
              key={a.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: '10px',
                background: 'var(--bg3)',
                padding: '12px 14px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ flex: '1', minWidth: '160px' }}>
                <div style={{ fontSize: '14px', color: 'var(--text)' }}>{a.name}</div>
                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', marginTop: '4px' }}>
                  {a.category === 'prop' ? 'Prop' : 'Personal'}
                  {a.provider ? ` · ${a.provider}` : ''}
                  {a.type ? ` · ${String(a.type)}` : ''}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text2)' }}>
                  Balance {formatMoney(a.balance)}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError('')
                    setDeleteTarget(a)
                  }}
                  style={{
                    borderRadius: '8px',
                    border: '1px solid rgba(239,68,68,0.45)',
                    background: 'rgba(239,68,68,0.1)',
                    color: '#f87171',
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 160,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={e => {
            if (e.target === e.currentTarget && !deleting) setDeleteTarget(null)
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '400px',
              borderRadius: '14px',
              border: '1px solid var(--border)',
              background: 'var(--card-bg)',
              padding: '20px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 id="delete-account-title" style={{ margin: '0 0 10px', fontSize: '18px', color: 'var(--text)' }}>
              Delete account?
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5 }}>
              Permanently remove <strong style={{ color: 'var(--text)' }}>{deleteTarget.name}</strong>? This cannot be undone. If you have trades linked to this account, delete will fail until those are removed or edited.
            </p>
            {deleteError && (
              <div
                style={{
                  marginBottom: '12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(239,68,68,0.45)',
                  background: 'rgba(239,68,68,0.08)',
                  color: '#fca5a5',
                  padding: '8px 10px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              >
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => !deleting && setDeleteTarget(null)}
                disabled={deleting}
                style={{
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text2)',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  cursor: deleting ? 'wait' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                style={{
                  borderRadius: '8px',
                  border: '1px solid rgba(239,68,68,0.55)',
                  background: 'rgba(220,38,38,0.85)',
                  color: '#fff',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  cursor: deleting ? 'wait' : 'pointer',
                }}
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-account-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 150,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={e => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '440px',
              borderRadius: '14px',
              border: '1px solid var(--border)',
              background: 'var(--card-bg)',
              padding: '20px 20px 18px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 id="add-account-title" style={{ margin: '0 0 14px', fontSize: '18px', color: 'var(--text)' }}>
              Add account
            </h3>

            <form onSubmit={handleSave} style={{ display: 'grid', gap: '14px' }}>
              {saveError && (
                <div
                  style={{
                    borderRadius: '8px',
                    border: '1px solid rgba(239,68,68,0.45)',
                    background: 'rgba(239,68,68,0.08)',
                    color: '#fca5a5',
                    padding: '8px 10px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                >
                  {saveError}
                </div>
              )}

              <div>
                <label style={labelStyle} htmlFor="acc-name">
                  Account name
                </label>
                <input
                  id="acc-name"
                  style={inputStyle}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoComplete="off"
                  placeholder="e.g. Main futures"
                />
              </div>

              <div>
                <label style={labelStyle} htmlFor="acc-balance">
                  Starting balance
                </label>
                <input
                  id="acc-balance"
                  style={inputStyle}
                  type="text"
                  inputMode="decimal"
                  value={form.balance}
                  onChange={e => setForm(f => ({ ...f, balance: e.target.value }))}
                  placeholder="0"
                />
              </div>

              <div>
                <label style={labelStyle} htmlFor="acc-type">
                  Market type
                </label>
                <select
                  id="acc-type"
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                >
                  {MARKET_TYPES.map(m => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: '11px', color: 'var(--text3)', margin: '6px 0 0' }}>
                  Used for symbol presets when logging trades.
                </p>
              </div>

              <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
                <legend style={{ ...labelStyle, marginBottom: '8px' }}>Account kind</legend>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text2)' }}>
                    <input
                      type="radio"
                      name="acc-category"
                      checked={form.category === 'personal'}
                      onChange={() => setForm(f => ({ ...f, category: 'personal' }))}
                    />
                    Personal
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text2)' }}>
                    <input
                      type="radio"
                      name="acc-category"
                      checked={form.category === 'prop'}
                      onChange={() => setForm(f => ({ ...f, category: 'prop' }))}
                    />
                    Prop firm
                  </label>
                </div>
              </fieldset>

              <div>
                <label style={labelStyle} htmlFor="acc-provider">
                  {form.category === 'prop' ? 'Prop firm name' : 'Broker'}
                </label>
                <input
                  id="acc-provider"
                  style={inputStyle}
                  value={form.provider}
                  onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                  placeholder={form.category === 'prop' ? 'e.g. FTMO' : 'e.g. Interactive Brokers'}
                  autoComplete="organization"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  style={{
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text2)',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    cursor: saving ? 'wait' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    borderRadius: '8px',
                    border: '1px solid var(--accent)',
                    background: 'var(--accent)',
                    color: '#fff',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    cursor: saving ? 'wait' : 'pointer',
                    opacity: saving ? 0.8 : 1,
                  }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function formatMoney(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
