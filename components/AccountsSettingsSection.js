'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const FREE_ACCOUNT_LIMIT = 5

const ACCOUNT_COLORS = ['#7C3AED', '#2563EB', '#22C55E', '#F59E0B', '#EF4444', '#14B8A6', '#EC4899', '#64748B']
const CURRENCIES = ['USD', 'GBP', 'EUR', 'ZAR', 'NGN', 'GHS']

const BROKER_GROUPS = [
  {
    label: 'Futures Brokers',
    options: [
      'Apex Trader Funding (funded)',
      'AMP Futures',
      'E8 Funding (funded)',
      'Earn2Trade (funded)',
      'FTMO Futures (funded)',
      'FundedNext (funded)',
      'My Funded Futures (funded)',
      'NinjaTrader Brokerage',
      'Optimus Futures',
      'Rithmic / R Trader',
      'TopStep (funded)',
      'Tradovate',
    ],
  },
  {
    label: 'Forex Brokers',
    options: [
      'E8 Funding (funded)',
      'Exness',
      'Forex.com',
      'FP Markets',
      'FTMO (funded)',
      'IC Markets',
      'OANDA',
      'Pepperstone',
      'The5%ers (funded)',
      'XM',
    ],
  },
  {
    label: 'Crypto',
    options: ['Binance', 'Coinbase', 'Kraken', 'Bybit', 'OKX'],
  },
  {
    label: 'Stocks/Options',
    options: ['Interactive Brokers', 'TD Ameritrade / thinkorswim', 'Charles Schwab', 'Webull', 'Tastytrade'],
  },
  {
    label: 'Other',
    options: ['Other'],
  },
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
  letterSpacing: '0.06em',
}

const emptyModal = {
  name: '',
  balance: '',
  accountType: 'personal',
  marketType: 'futures',
  environment: 'live',
  broker: '',
  brokerOther: '',
  currency: 'USD',
  color: '#7C3AED',
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
  const [brokerSearch, setBrokerSearch] = useState('')
  const [accent, setAccent] = useState('#7C3AED')

  const filteredBrokerGroups = useMemo(() => {
    const query = brokerSearch.trim().toLowerCase()
    if (!query) return BROKER_GROUPS
    return BROKER_GROUPS.map(group => ({
      ...group,
      options: group.options.filter(opt => opt.toLowerCase().includes(query)),
    })).filter(group => group.options.length > 0)
  }, [brokerSearch])

  const loadAccounts = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) {
      setAccounts([])
      setListLoading(false)
      return
    }
    setListLoading(true)
    setListError('')
    const { data, error } = await supabase.from('accounts').select('*').eq('user_id', uid).order('name', { ascending: true })

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
    const lsAccent = typeof window !== 'undefined' ? window.localStorage.getItem('accentColor') : null
    setAccent(lsAccent || '#7C3AED')
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
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
    setForm({ ...emptyModal, color: accent || '#7C3AED' })
    setBrokerSearch('')
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
    const broker = form.broker === 'Other' ? form.brokerOther.trim() : form.broker.trim()
    if (!name) {
      setSaveError('Please enter an account name.')
      return
    }
    if (!Number.isFinite(bal)) {
      setSaveError('Please enter a valid starting balance.')
      return
    }
    if (!broker) {
      setSaveError('Please select a broker.')
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
      type: form.accountType,
      category: form.accountType,
      market_type: form.marketType,
      provider: broker,
      broker,
      environment: form.environment,
      currency: form.currency || 'USD',
      color: form.color || '#7C3AED',
      user_id: sessionUser.id,
    })

    setSaving(false)
    if (error) {
      if (error.message?.includes('user_id') || error.code === 'PGRST204') {
        setSaveError('Saving failed: add the latest accounts columns and try again.')
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
    const { error } = await supabase.from('accounts').delete().eq('id', deleteTarget.id).eq('user_id', sessionUser.id)

    setDeleting(false)
    if (error) {
      const msg = error.message || ''
      if (/foreign key|violates|referenced/i.test(msg) || error.code === '23503') {
        setDeleteError('This account still has trades linked to it. Delete or change those trades first, then try again.')
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
              <div style={{ flex: '1', minWidth: '180px' }}>
                <div style={{ fontSize: '14px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '999px', background: a.color || '#7C3AED', border: '1px solid rgba(255,255,255,0.24)' }} />
                  {a.name}
                </div>
                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', marginTop: '4px' }}>
                  {(a.category || a.type) === 'prop' ? 'Prop Firm' : 'Personal'}
                  {a.market_type ? ` · ${a.market_type.charAt(0).toUpperCase() + a.market_type.slice(1)}` : ' · Futures'}
                  {(a.environment || 'live') === 'demo' ? ' · Demo' : ' · Live'}
                  {(a.broker || a.provider) ? ` · ${a.broker || a.provider}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text2)' }}>
                  Balance {formatMoney(a.balance, a.currency || 'USD')}
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
              maxWidth: '580px',
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
                <label style={labelStyle} htmlFor="account-name">
                  Account name
                </label>
                <input
                  id="account-name"
                  name="account-name"
                  type="text"
                  style={inputStyle}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoComplete="off"
                  placeholder="e.g. Main futures"
                />
              </div>

              <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
                <legend style={{ ...labelStyle, marginBottom: '8px' }}>Account type</legend>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, accountType: 'prop' }))}
                    style={typeCardStyle(form.accountType === 'prop', accent)}
                  >
                    <span style={{ fontSize: '20px' }}>🏢</span>
                    <span>
                      <strong style={{ display: 'block', fontSize: '13px', color: 'var(--text)' }}>Prop Firm Account</strong>
                      <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Funded or challenge account</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, accountType: 'personal' }))}
                    style={typeCardStyle(form.accountType === 'personal', accent)}
                  >
                    <span style={{ fontSize: '20px' }}>👤</span>
                    <span>
                      <strong style={{ display: 'block', fontSize: '13px', color: 'var(--text)' }}>Personal Account</strong>
                      <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Self-funded trading account</span>
                    </span>
                  </button>
                </div>
              </fieldset>

              <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
                <legend style={{ ...labelStyle, marginBottom: '8px' }}>Market type</legend>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, marketType: 'futures' }))}
                    style={typeCardStyle(form.marketType === 'futures', accent)}
                  >
                    <span style={{ fontSize: '20px' }}>📊</span>
                    <span>
                      <strong style={{ display: 'block', fontSize: '13px', color: 'var(--text)' }}>Futures</strong>
                      <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Contracts and Points</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, marketType: 'forex' }))}
                    style={typeCardStyle(form.marketType === 'forex', accent)}
                  >
                    <span style={{ fontSize: '20px' }}>💱</span>
                    <span>
                      <strong style={{ display: 'block', fontSize: '13px', color: 'var(--text)' }}>Forex</strong>
                      <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Lots and Pips</span>
                    </span>
                  </button>
                </div>
              </fieldset>

              <div>
                <span style={labelStyle}>Environment</span>
                <div style={{ display: 'inline-flex', borderRadius: '999px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, environment: 'live' }))}
                    style={{
                      border: 'none',
                      background: form.environment === 'live' ? 'rgba(34,197,94,0.18)' : 'var(--bg3)',
                      color: form.environment === 'live' ? PROFIT_TEXT : 'var(--text2)',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                    }}
                  >
                    Live / Real
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, environment: 'demo' }))}
                    style={{
                      border: 'none',
                      borderLeft: '1px solid var(--border)',
                      background: form.environment === 'demo' ? 'rgba(148,163,184,0.2)' : 'var(--bg3)',
                      color: form.environment === 'demo' ? 'var(--text)' : 'var(--text2)',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                    }}
                  >
                    Demo / Simulation
                  </button>
                </div>
                {form.environment === 'demo' ? (
                  <p style={{ fontSize: '11px', color: 'var(--text3)', margin: '7px 0 0' }}>
                    Demo accounts are excluded from your main statistics by default
                  </p>
                ) : null}
              </div>

              <div>
                <label style={labelStyle} htmlFor="broker-search">
                  Broker
                </label>
                <input
                  id="broker-search"
                  name="search"
                  type="search"
                  autoComplete="off"
                  style={{ ...inputStyle, marginBottom: '8px' }}
                  value={brokerSearch}
                  onChange={e => setBrokerSearch(e.target.value)}
                  placeholder="Search broker list..."
                />
                <select
                  id="account-broker"
                  name="broker"
                  autoComplete="off"
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={form.broker}
                  onChange={e => setForm(f => ({ ...f, broker: e.target.value }))}
                >
                  <option value="">Select a broker</option>
                  {filteredBrokerGroups.map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map(option => (
                        <option key={`${group.label}-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {form.broker === 'Other' ? (
                  <input
                    id="broker-other"
                    name="broker-other"
                    type="text"
                    autoComplete="off"
                    style={{ ...inputStyle, marginTop: '8px' }}
                    value={form.brokerOther}
                    onChange={e => setForm(f => ({ ...f, brokerOther: e.target.value }))}
                    placeholder="Enter broker name"
                  />
                ) : null}
              </div>

              <div>
                <label style={labelStyle} htmlFor="starting-balance">
                  Starting Account Balance
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '8px' }}>
                  <input
                    id="starting-balance"
                    name="starting-balance"
                    style={inputStyle}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={form.balance}
                    onChange={e => setForm(f => ({ ...f, balance: e.target.value }))}
                    placeholder="e.g. 100000"
                  />
                  <select
                    id="account-currency"
                    name="currency"
                    autoComplete="off"
                    value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    {CURRENCIES.map(cur => (
                      <option key={cur} value={cur}>
                        {cur}
                      </option>
                    ))}
                  </select>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text3)', margin: '6px 0 0' }}>
                  This is used to calculate your account growth percentage
                </p>
              </div>

              <div>
                <span style={labelStyle}>Account color</span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {ACCOUNT_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      title={c}
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '999px',
                        border: form.color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                        boxShadow: form.color === c ? `0 0 0 2px ${accent}` : 'none',
                        background: c,
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
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

const PROFIT_TEXT = '#22C55E'

function formatMoney(v, currency = 'USD') {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
  }
}

function typeCardStyle(active, accent) {
  return {
    borderRadius: '10px',
    border: active ? `1px solid ${accent}` : '1px solid var(--border)',
    background: active ? 'var(--accent-subtle)' : 'var(--bg3)',
    color: 'var(--text2)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    textAlign: 'left',
    padding: '10px',
  }
}
