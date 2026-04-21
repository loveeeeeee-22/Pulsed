'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

function fieldBorder(hasError) {
  return hasError ? '1px solid rgba(239,68,68,0.65)' : inputStyle.border
}

function SubmitSpinner() {
  return (
    <span
      className="pj-inline-spin"
      style={{
        display: 'inline-block',
        width: '16px',
        height: '16px',
        border: '2px solid rgba(255,255,255,0.22)',
        borderTopColor: 'currentColor',
        borderRadius: '50%',
        flexShrink: 0,
      }}
      aria-hidden
    />
  )
}

/**
 * Record withdrawals (kind `expense`) or legacy income credits. Closes on successful insert.
 */
export default function AccountCashTransactionModal({
  kind,
  open,
  onClose,
  accounts = [],
  defaultAccountId = '',
  accent = '#7C3AED',
  onSaved,
}) {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [accountId, setAccountId] = useState('')
  const [notes, setNotes] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isWithdraw = kind === 'expense'
  const title = isWithdraw ? 'Record withdrawal' : 'Add income'

  useEffect(() => {
    if (!open) return
    setAmount('')
    setCategory('')
    setOccurredOn(new Date().toISOString().slice(0, 10))
    setNotes('')
    setFieldErrors({})
    setSubmitError('')
    setSubmitting(false)
    const first = accounts[0]?.id || ''
    setAccountId(defaultAccountId && accounts.some((a) => a.id === defaultAccountId) ? defaultAccountId : first)
  }, [open, kind, defaultAccountId, accounts])

  const validate = useCallback(() => {
    const errs = {}
    const rawAmount = String(amount).replace(/,/g, '').trim()
    const num = parseFloat(rawAmount)
    if (!rawAmount || !Number.isFinite(num) || num <= 0) {
      errs.amount = 'Enter a positive amount.'
    }
    if (!String(category).trim()) {
      errs.category = 'Category is required.'
    }
    if (!occurredOn) {
      errs.date = 'Date is required.'
    }
    if (!accountId) {
      errs.account = 'Select an account.'
    }
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }, [amount, category, occurredOn, accountId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    if (!validate()) return

    const rawAmount = String(amount).replace(/,/g, '').trim()
    const num = parseFloat(rawAmount)

    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) {
        setSubmitError('You must be signed in.')
        setSubmitting(false)
        return
      }

      const payload = {
        account_id: accountId,
        kind,
        amount: num,
        category: String(category).trim(),
        occurred_on: occurredOn,
        notes: String(notes).trim() || null,
      }

      const { data, error } = await supabase.from('account_cash_transactions').insert(payload).select().maybeSingle()

      if (error) {
        const msg = error.message || 'Could not save.'
        if (msg.includes('does not exist') || msg.includes('account_cash_transactions')) {
          setSubmitError('Database is missing the cash transactions table. Apply the latest Supabase migration and refresh.')
        } else {
          setSubmitError(msg)
        }
        setSubmitting(false)
        return
      }

      onSaved?.(data)
      onClose?.()
    } catch (err) {
      setSubmitError(err?.message || 'Something went wrong.')
      setSubmitting(false)
    }
  }

  const handleBackdrop = (e) => {
    if (e.target !== e.currentTarget || submitting) return
    onClose?.()
  }

  const accountOptions = useMemo(() => accounts.filter((a) => a?.id), [accounts])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cash-tx-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 310,
        background: 'rgba(15, 15, 18, 0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
      onClick={handleBackdrop}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          background: 'var(--card-bg)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
          maxHeight: 'min(640px, calc(100vh - 32px))',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <h2 id="cash-tx-modal-title" style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--text)' }}>
              {title}
            </h2>
            <button
              type="button"
              disabled={submitting}
              onClick={() => onClose?.()}
              aria-label="Close"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid var(--border-md)',
                background: 'var(--bg3)',
                color: 'var(--text3)',
                cursor: submitting ? 'wait' : 'pointer',
                fontSize: '20px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>

          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {accountOptions.length === 0 ? (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5 }}>
                Add an account in Settings before recording withdrawals.
              </p>
            ) : null}

            {accountOptions.length > 0 && isWithdraw ? (
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5 }}>
                Pulling profits out of this account reduces your displayed balance, equity curve, and account totals the same way across the app.
              </p>
            ) : null}

            <div>
              <label style={labelStyle} htmlFor="cash-tx-account">
                Account
              </label>
              <select
                id="cash-tx-account"
                name="cash-tx-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                disabled={submitting || accountOptions.length === 0}
                autoComplete="off"
                style={{
                  ...inputStyle,
                  border: fieldBorder(!!fieldErrors.account),
                  cursor: accountOptions.length ? 'pointer' : 'not-allowed',
                  opacity: accountOptions.length ? 1 : 0.6,
                }}
              >
                {accountOptions.length === 0 ? <option value="">—</option> : null}
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || 'Unnamed'}
                  </option>
                ))}
              </select>
              {fieldErrors.account ? (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#f87171', fontFamily: 'monospace' }}>{fieldErrors.account}</div>
              ) : null}
            </div>

            <div>
              <label style={labelStyle} htmlFor="cash-tx-amount">
                {isWithdraw ? 'Withdrawal amount' : 'Amount'}
              </label>
              <input
                id="cash-tx-amount"
                name="cash-tx-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={submitting}
                style={{ ...inputStyle, border: fieldBorder(!!fieldErrors.amount) }}
              />
              {fieldErrors.amount ? (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#f87171', fontFamily: 'monospace' }}>{fieldErrors.amount}</div>
              ) : null}
            </div>

            <div>
              <label style={labelStyle} htmlFor="cash-tx-category">
                Category
              </label>
              <input
                id="cash-tx-category"
                name="cash-tx-category"
                type="text"
                autoComplete="off"
                placeholder={isWithdraw ? 'e.g. Profit withdrawal, wire to bank' : 'e.g. Payout, deposit'}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={submitting}
                style={{ ...inputStyle, border: fieldBorder(!!fieldErrors.category) }}
              />
              {fieldErrors.category ? (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#f87171', fontFamily: 'monospace' }}>{fieldErrors.category}</div>
              ) : null}
            </div>

            <div>
              <label style={labelStyle} htmlFor="cash-tx-date">
                Date
              </label>
              <input
                id="cash-tx-date"
                name="cash-tx-date"
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
                disabled={submitting}
                style={{ ...inputStyle, border: fieldBorder(!!fieldErrors.date) }}
              />
              {fieldErrors.date ? (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#f87171', fontFamily: 'monospace' }}>{fieldErrors.date}</div>
              ) : null}
            </div>

            <div>
              <label style={labelStyle} htmlFor="cash-tx-notes">
                Notes <span style={{ textTransform: 'none', color: 'var(--text3)' }}>(optional)</span>
              </label>
              <textarea
                id="cash-tx-notes"
                name="cash-tx-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }}
              />
            </div>

            {submitError ? (
              <div
                style={{
                  borderRadius: '8px',
                  border: '1px solid rgba(239,68,68,0.45)',
                  background: 'rgba(239,68,68,0.08)',
                  color: '#fca5a5',
                  padding: '10px 12px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              >
                {submitError}
              </div>
            ) : null}
          </div>

          <div
            style={{
              padding: '14px 20px 18px',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              flexWrap: 'wrap',
              borderTop: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              disabled={submitting}
              onClick={() => onClose?.()}
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border-md)',
                background: 'transparent',
                color: 'var(--text2)',
                fontSize: '13px',
                fontFamily: 'monospace',
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || accountOptions.length === 0}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: 'none',
                background: accountOptions.length === 0 ? 'var(--bg3)' : accent,
                color: accountOptions.length === 0 ? 'var(--text3)' : '#fff',
                fontSize: '13px',
                fontFamily: 'monospace',
                fontWeight: 600,
                cursor: submitting || accountOptions.length === 0 ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                opacity: submitting ? 0.85 : 1,
              }}
            >
              {submitting ? (
                <>
                  <SubmitSpinner />
                  Saving…
                </>
              ) : isWithdraw ? (
                'Save withdrawal'
              ) : (
                'Save'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
