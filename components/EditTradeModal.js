'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getAccountsForUser } from '@/lib/getAccountsForUser'
import { getStrategiesForUser } from '@/lib/getStrategiesForUser'
import { computeActualRMultiple } from '@/lib/computeActualRMultiple'

const SESSION_OPTIONS = ['New York', 'London', 'Asian']

const SYMBOLS_BY_ACCOUNT_TYPE = {
  futures: ['ES', 'NQ', 'YM', 'RTY', 'MES', 'MNQ', 'MYM', 'M2K', 'CL', 'MCL', 'GC', 'MGC', 'SI', 'MSL'],
  crypto: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'],
  forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD'],
}

const inputStyle = {
  width: '100%',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--bg3)',
  color: 'var(--text)',
  fontSize: '13px',
  padding: '9px 10px',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  marginBottom: '6px',
  display: 'block',
  fontSize: '11px',
  fontFamily: 'monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text3)',
}

const sectionTitleStyle = {
  marginBottom: '12px',
  fontSize: '12px',
  fontFamily: 'monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text2)',
}

function normalizeRules(rules) {
  if (!rules) return { entry: [], exit: [], market: [], risk: [] }
  if (typeof rules === 'object' && !Array.isArray(rules)) {
    const entry = Array.isArray(rules.entry) ? rules.entry.map(r => String(r)).filter(Boolean) : []
    const exit = Array.isArray(rules.exit) ? rules.exit.map(r => String(r)).filter(Boolean) : []
    const market = Array.isArray(rules.market) ? rules.market.map(r => String(r)).filter(Boolean) : []
    const risk = Array.isArray(rules.risk) ? rules.risk.map(r => String(r)).filter(Boolean) : []
    return { entry, exit, market, risk }
  }
  if (Array.isArray(rules)) {
    return { entry: rules.map(r => String(r)).filter(Boolean), exit: [], market: [], risk: [] }
  }
  return { entry: [], exit: [], market: [], risk: [] }
}

function parseBrokenLabelsFromMistakes(mistakes) {
  if (!mistakes || !String(mistakes).trim()) return []
  const s = String(mistakes)
  if (!s.toLowerCase().includes('not followed')) return []
  const after = s.split(':')[1] || ''
  return after
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
}

function computeMistakesFromBrokenLabels(brokenLabels) {
  const labels = (brokenLabels || []).filter(Boolean)
  return labels.length ? `Not followed: ${labels.join(', ')}` : null
}

function parseNumber(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function formatNum(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })
}

function fmtPnl(n) {
  const v = Number(n || 0)
  return (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(2)
}

function pnlColor(n) {
  return Number(n || 0) >= 0 ? '#22C55E' : '#EF4444'
}

function computePlannedRr(profitTarget, stopLoss) {
  const pt = parseNumber(profitTarget)
  const sl = parseNumber(stopLoss)
  if (pt == null || sl == null || sl === 0) return null
  return pt / sl
}

// (rules helpers moved above)

function normalizeDirection(direction) {
  const d = String(direction || '').toLowerCase()
  return d.includes('short') ? 'short' : 'long'
}

export default function EditTradeModal({ trade, onClose, onSaved }) {
  const [metaLoading, setMetaLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  const [accounts, setAccounts] = useState([])
  const [strategies, setStrategies] = useState([])

  const [customSymbol, setCustomSymbol] = useState(false)
  const [symbolQuery, setSymbolQuery] = useState('')

  const [strategyRules, setStrategyRules] = useState({ entry: [], exit: [], market: [], risk: [] })
  const [rulesFollowed, setRulesFollowed] = useState({})

  const [form, setForm] = useState({
    account_id: '',
    strategy_id: '',
    date: '',
    symbol: '',
    session: 'New York',
    direction: 'long',
    contracts: '',
    points: '',
    gross_pnl: '',
    fees: '',
    entry_price: '',
    exit_price: '',
    entry_time: '',
    exit_time: '',
    profit_target: '',
    stop_loss: '',
    trade_risk: '',
    actual_rr: '',
    planned_rr: '',
    status: 'Win',
    notes: '',
    trade_grade: '',
  })

  const selectedAccount = useMemo(() => {
    return accounts.find(a => a.id === form.account_id) || null
  }, [accounts, form.account_id])

  const symbolOptions = useMemo(() => {
    const mType = String(selectedAccount?.market_type || 'futures').toLowerCase()
    return SYMBOLS_BY_ACCOUNT_TYPE[mType] || []
  }, [selectedAccount?.market_type])

  const plannedRr = useMemo(() => computePlannedRr(form.profit_target, form.stop_loss), [form.profit_target, form.stop_loss])

  const gross = useMemo(() => parseNumber(form.gross_pnl), [form.gross_pnl])
  const fees = useMemo(() => parseNumber(form.fees), [form.fees])
  const netPnl = useMemo(() => {
    if (gross == null && fees == null) return null
    return (gross ?? 0) - (fees ?? 0)
  }, [gross, fees])

  const computedActualRr = useMemo(
    () => computeActualRMultiple(netPnl, parseNumber(form.trade_risk)),
    [netPnl, form.trade_risk]
  )

  useEffect(() => {
    if (!trade) return
    setForm({
      account_id: trade.account_id ?? '',
      strategy_id: trade.strategy_id ?? '',
      date: trade.date?.slice(0, 10) ?? '',
      symbol: trade.symbol ?? '',
      session: trade.session || 'New York',
      direction: normalizeDirection(trade.direction),
      contracts: trade.contracts ?? '',
      points: trade.points ?? '',
      gross_pnl: trade.gross_pnl ?? '',
      fees: trade.fees ?? '',
      entry_price: trade.entry_price ?? '',
      exit_price: trade.exit_price ?? '',
      entry_time: trade.entry_time ?? '',
      exit_time: trade.exit_time ?? '',
      profit_target: trade.profit_target ?? '',
      stop_loss: trade.stop_loss ?? '',
      trade_risk: trade.trade_risk ?? '',
      actual_rr: trade.actual_rr ?? '',
      planned_rr: trade.planned_rr ?? '',
      status: trade.status || 'Win',
      notes: trade.notes ?? '',
      trade_grade: trade.trade_grade ?? '',
    })
  }, [trade])

  useEffect(() => {
    // Tie the "Rules you followed" checkboxes to the selected strategy's entry/exit rules.
    const selectedStrategyId = form.strategy_id || ''
    const selectedStrategy = strategies.find(s => s.id === selectedStrategyId) || null
    const nextRules = normalizeRules(selectedStrategy?.rules)
    setStrategyRules(nextRules)

    const brokenLabels = parseBrokenLabelsFromMistakes(trade?.mistakes)
    const nextFollowed = {}
    nextRules.entry.forEach((label, i) => {
      nextFollowed[`entry-${i}`] = !brokenLabels.includes(label)
    })
    nextRules.exit.forEach((label, i) => {
      nextFollowed[`exit-${i}`] = !brokenLabels.includes(label)
    })
    nextRules.market.forEach((label, i) => {
      nextFollowed[`market-${i}`] = !brokenLabels.includes(label)
    })
    nextRules.risk.forEach((label, i) => {
      nextFollowed[`risk-${i}`] = !brokenLabels.includes(label)
    })
    setRulesFollowed(nextFollowed)
  }, [form.strategy_id, strategies, trade?.mistakes])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setMetaLoading(true)
      const [accRows, stratRows] = await Promise.all([
        supabase.from('accounts').select('id, name, type, market_type').order('name', { ascending: true }),
        getStrategiesForUser({ select: 'id,name,rules', order: { column: 'name', ascending: true } }),
      ])
      const accountsData = accRows.data || []
      if (cancelled) return
      setAccounts(accountsData)
      setStrategies(stratRows || [])
      setMetaLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // Decide if symbol should be treated as custom for the selected account type.
    const sym = String(form.symbol || '').toUpperCase()
    if (!sym) return
    const isPreset = symbolOptions.includes(sym)
    setCustomSymbol(!isPreset)
  }, [form.symbol, symbolOptions])

  const onPickSymbol = useCallback((value) => {
    if (value === '__custom__') {
      setCustomSymbol(true)
      setSymbolQuery('')
      setForm(f => ({ ...f, symbol: '' }))
      return
    }
    setCustomSymbol(false)
    setSymbolQuery('')
    setForm(f => ({ ...f, symbol: value }))
  }, [])

  if (!trade) return null

  const marketType = String(selectedAccount?.market_type || 'futures').toLowerCase()
  const contractsLabel = marketType === 'forex' ? 'Lots' : 'Contracts'
  const pointsLabel = marketType === 'forex' ? 'Pips' : 'Points'
  const tradeRiskLabel = 'Trade risk'

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const payload = {
        account_id: form.account_id || null,
        strategy_id: form.strategy_id || null,
        date: form.date || null,
        symbol: String(form.symbol || '').trim().toUpperCase() || null,
        session: form.session || null,
        direction: form.direction || null,
        contracts: parseNumber(form.contracts),
        points: parseNumber(form.points),
        gross_pnl: parseNumber(form.gross_pnl),
        fees: parseNumber(form.fees),
        // `net_pnl` may be a generated column in your DB, so we don't update it directly.
        entry_price: parseNumber(form.entry_price),
        exit_price: parseNumber(form.exit_price),
        entry_time: form.entry_time || null,
        exit_time: form.exit_time || null,
        profit_target: parseNumber(form.profit_target),
        stop_loss: parseNumber(form.stop_loss),
        trade_risk: parseNumber(form.trade_risk),
        planned_rr: plannedRr,
        actual_rr: computedActualRr ?? parseNumber(form.actual_rr),
        status: form.status || null,
        notes: form.notes?.trim() || null,
        trade_grade: form.trade_grade?.trim() || null,
        mistakes: computeMistakesFromBrokenLabels([
          ...strategyRules.entry
            .map((label, i) => (rulesFollowed[`entry-${i}`] === false ? label : null))
            .filter(Boolean),
          ...strategyRules.exit
            .map((label, i) => (rulesFollowed[`exit-${i}`] === false ? label : null))
            .filter(Boolean),
          ...strategyRules.market
            .map((label, i) => (rulesFollowed[`market-${i}`] === false ? label : null))
            .filter(Boolean),
          ...strategyRules.risk
            .map((label, i) => (rulesFollowed[`risk-${i}`] === false ? label : null))
            .filter(Boolean),
        ]),
      }

      const { error } = await supabase.from('trades').update(payload).eq('id', trade.id)
      if (error) throw error

      setSaving(false)
      setMessage({ type: 'ok', text: 'Trade updated.' })
      onSaved?.()
    } catch (err) {
      setSaving(false)
      setMessage({ type: 'error', text: err.message || 'Could not update trade.' })
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit trade"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !saving) onClose?.()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '980px',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          background: 'var(--card-bg)',
          padding: '18px',
          maxHeight: '88vh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--text)' }}>Edit trade</h3>
            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text3)', fontFamily: 'monospace' }}>
              {trade.symbol || '—'} · {trade.date?.slice(0, 10) || '—'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text2)',
              borderRadius: '10px',
              padding: '8px 12px',
              cursor: saving ? 'wait' : 'pointer',
              fontFamily: 'monospace',
              fontSize: '12px',
            }}
          >
            Close
          </button>
        </div>

        {message?.text && (
          <div
            style={{
              marginTop: '12px',
              borderRadius: '8px',
              border: message.type === 'error' ? '1px solid rgba(239,68,68,0.45)' : '1px solid rgba(34,197,94,0.45)',
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

        <form onSubmit={handleSave} style={{ marginTop: '14px', display: 'grid', gap: '18px' }}>
          <section style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card-bg)', padding: '16px' }}>
            <h2 style={sectionTitleStyle}>Setup</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '12px' }}>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-account">
                  Account
                </label>
                <select
                  id="edit-trade-account"
                  name="account_id"
                  autoComplete="off"
                  style={inputStyle}
                  value={form.account_id}
                  onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}
                >
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.market_type ? account.market_type.charAt(0).toUpperCase() + account.market_type.slice(1) : "Futures"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-strategy">
                  Playbook
                </label>
                <select
                  id="edit-trade-strategy"
                  name="strategy_id"
                  autoComplete="off"
                  style={inputStyle}
                  value={form.strategy_id}
                  onChange={e => setForm(f => ({ ...f, strategy_id: e.target.value }))}
                >
                  <option value="">No play selected</option>
                  {strategies.map(strategy => (
                    <option key={strategy.id} value={strategy.id}>
                      {strategy.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle} htmlFor="edit-trade-date">
                  Date
                </label>
                <input
                  id="edit-trade-date"
                  name="trade-date"
                  type="date"
                  autoComplete="off"
                  style={inputStyle}
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label style={labelStyle} htmlFor="edit-trade-symbol">
                  Symbol
                </label>
                {customSymbol || symbolOptions.length === 0 ? (
                  <input
                    id="edit-trade-symbol"
                    name="symbol"
                    type="text"
                    autoComplete="off"
                    style={inputStyle}
                    value={form.symbol}
                    onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                    placeholder="e.g. ES, NQ"
                    required
                  />
                ) : (
                  <select
                    id="edit-trade-symbol"
                    name="symbol"
                    autoComplete="off"
                    style={inputStyle}
                    value={form.symbol}
                    onChange={e => {
                      const value = e.target.value
                      if (value === '__custom__') onPickSymbol('__custom__')
                      else setForm(f => ({ ...f, symbol: value }))
                    }}
                    required
                  >
                    {symbolOptions.map(sym => (
                      <option key={sym} value={sym}>
                        {sym}
                      </option>
                    ))}
                    <option value="__custom__">Custom symbol...</option>
                  </select>
                )}
                {customSymbol && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomSymbol(false)
                      const next = symbolOptions[0] || ''
                      setForm(f => ({ ...f, symbol: next }))
                    }}
                    style={{
                      marginTop: '6px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg3)',
                      color: 'var(--text2)',
                      borderRadius: '6px',
                      padding: '5px 8px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                    }}
                  >
                    Back to preset symbols
                  </button>
                )}
              </div>

              <div>
                <label style={labelStyle} htmlFor="edit-trade-session">
                  Session
                </label>
                <select
                  id="edit-trade-session"
                  name="session"
                  autoComplete="off"
                  style={inputStyle}
                  value={form.session}
                  onChange={e => setForm(f => ({ ...f, session: e.target.value }))}
                >
                  {SESSION_OPTIONS.map(session => (
                    <option key={session} value={session}>
                      {session}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle} htmlFor="edit-trade-direction">
                  Direction
                </label>
                <select
                  id="edit-trade-direction"
                  name="direction"
                  autoComplete="off"
                  style={inputStyle}
                  value={form.direction}
                  onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
                >
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>

              <div>
                <label style={labelStyle} htmlFor="edit-trade-status">
                  Status
                </label>
                <select
                  id="edit-trade-status"
                  name="status"
                  autoComplete="off"
                  style={inputStyle}
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="Win">Win</option>
                  <option value="Loss">Loss</option>
                  <option value="Breakeven">Breakeven</option>
                </select>
              </div>
            </div>
          </section>

          <section style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card-bg)', padding: '16px' }}>
            <h2 style={sectionTitleStyle}>Position</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '12px' }}>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-contracts">
                  {contractsLabel}
                </label>
                <input
                  id="edit-trade-contracts"
                  name="contracts"
                  type="number"
                  autoComplete="off"
                  step="any"
                  style={inputStyle}
                  value={form.contracts}
                  onChange={e => setForm(f => ({ ...f, contracts: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-points">
                  {pointsLabel}
                </label>
                <input
                  id="edit-trade-points"
                  name="points"
                  type="number"
                  autoComplete="off"
                  step="any"
                  style={inputStyle}
                  value={form.points}
                  onChange={e => setForm(f => ({ ...f, points: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-entry-price">
                  Entry price
                </label>
                <input
                  id="edit-trade-entry-price"
                  name="entry-price"
                  type="number"
                  autoComplete="off"
                  step="any"
                  style={inputStyle}
                  value={form.entry_price}
                  onChange={e => setForm(f => ({ ...f, entry_price: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-exit-price">
                  Exit price
                </label>
                <input
                  id="edit-trade-exit-price"
                  name="exit-price"
                  type="number"
                  autoComplete="off"
                  step="any"
                  style={inputStyle}
                  value={form.exit_price}
                  onChange={e => setForm(f => ({ ...f, exit_price: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-entry-time">
                  Entry time
                </label>
                <input
                  id="edit-trade-entry-time"
                  name="entry-time"
                  type="time"
                  autoComplete="off"
                  style={inputStyle}
                  value={form.entry_time}
                  onChange={e => setForm(f => ({ ...f, entry_time: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-exit-time">
                  Exit time
                </label>
                <input
                  id="edit-trade-exit-time"
                  name="exit-time"
                  type="time"
                  autoComplete="off"
                  style={inputStyle}
                  value={form.exit_time}
                  onChange={e => setForm(f => ({ ...f, exit_time: e.target.value }))}
                />
              </div>
            </div>
          </section>

          <section style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card-bg)', padding: '16px' }}>
            <h2 style={sectionTitleStyle}>P&L</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '12px' }}>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-gross-pnl">
                  Gross P&L
                </label>
                <input
                  id="edit-trade-gross-pnl"
                  name="gross-pnl"
                  type="number"
                  autoComplete="off"
                  step="any"
                  style={inputStyle}
                  value={form.gross_pnl}
                  onChange={e => setForm(f => ({ ...f, gross_pnl: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-fees">
                  Fees
                </label>
                <input
                  id="edit-trade-fees"
                  name="fees"
                  type="number"
                  autoComplete="off"
                  step="any"
                  style={inputStyle}
                  value={form.fees}
                  onChange={e => setForm(f => ({ ...f, fees: e.target.value }))}
                />
              </div>
              <div>
                <span style={labelStyle}>Net P&L (auto)</span>
                <div
                  style={{
                    minHeight: '38px',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg3)',
                    padding: '0 10px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    color: netPnl == null ? 'var(--text2)' : pnlColor(netPnl),
                  }}
                  aria-live="polite"
                >
                  {netPnl == null ? '—' : formatNum(netPnl)}
                </div>
              </div>
            </div>
          </section>

          <section style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card-bg)', padding: '16px' }}>
            <h2 style={sectionTitleStyle}>Risk</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '12px' }}>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-profit-target">
                  Profit target
                </label>
                <input
                  id="edit-trade-profit-target"
                  name="profit-target"
                  type="number"
                  autoComplete="off"
                  step="any"
                  style={inputStyle}
                  value={form.profit_target}
                  onChange={e => setForm(f => ({ ...f, profit_target: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-stop-loss">
                  Stop loss
                </label>
                <input
                  id="edit-trade-stop-loss"
                  name="stop-loss"
                  type="number"
                  autoComplete="off"
                  step="any"
                  style={inputStyle}
                  value={form.stop_loss}
                  onChange={e => setForm(f => ({ ...f, stop_loss: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-risk">
                  {tradeRiskLabel}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'monospace', color: 'var(--text2)', fontSize: '13px' }}>$</span>
                  <input
                    id="edit-trade-risk"
                    name="trade-risk"
                    type="number"
                    autoComplete="off"
                    step="any"
                    style={{ ...inputStyle, flex: 1 }}
                    value={form.trade_risk}
                    onChange={e => setForm(f => ({ ...f, trade_risk: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle} htmlFor={computedActualRr != null ? undefined : 'edit-trade-actual-rr'}>
                  {computedActualRr != null ? 'Actual R (auto)' : 'Actual R:R'}
                </label>
                {computedActualRr != null ? (
                  <div
                    style={{
                      ...inputStyle,
                      display: 'flex',
                      alignItems: 'center',
                      color: 'var(--text2)',
                      fontFamily: 'monospace',
                    }}
                    aria-live="polite"
                  >
                    {formatNum(computedActualRr)}R
                  </div>
                ) : (
                  <input
                    id="edit-trade-actual-rr"
                    name="actual-rr"
                    type="number"
                    autoComplete="off"
                    step="any"
                    style={inputStyle}
                    value={form.actual_rr}
                    onChange={e => setForm(f => ({ ...f, actual_rr: e.target.value }))}
                    placeholder="Or set trade risk ($) for auto"
                  />
                )}
                <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '6px', lineHeight: 1.4 }}>
                  {computedActualRr != null
                    ? 'Net P&L ÷ trade risk ($). Updates when P&L or risk changes.'
                    : 'Enter R manually, or fill trade risk ($) and net P&L to calculate automatically.'}
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <span style={labelStyle}>Planned R:R (auto)</span>
                <div
                  style={{
                    minHeight: '38px',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg3)',
                    padding: '0 10px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    color: 'var(--text2)',
                  }}
                  aria-live="polite"
                >
                  {plannedRr == null ? '—' : formatNum(plannedRr)}
                  {parseNumber(form.stop_loss) === 0 && form.profit_target != null && form.profit_target !== '' && (
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: '#fca5a5' }}>(stop loss cannot be 0)</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section style={{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--card-bg)', padding: '16px' }}>
            <h2 style={sectionTitleStyle}>Review</h2>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-grade">
                  Trade grade
                </label>
                <input
                  id="edit-trade-grade"
                  name="trade-grade"
                  type="text"
                  autoComplete="off"
                  style={inputStyle}
                  value={form.trade_grade}
                  onChange={e => setForm(f => ({ ...f, trade_grade: e.target.value }))}
                  placeholder="A–F or score"
                />
              </div>
              <div>
                <label style={labelStyle} htmlFor="edit-trade-notes">
                  Notes
                </label>
                <textarea
                  id="edit-trade-notes"
                  name="notes"
                  autoComplete="off"
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '88px' }}
                  rows={3}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div>
                <label style={labelStyle}>Rules you followed</label>
                <div style={{ border: '1px solid rgba(124,58,237,0.30)', borderRadius: '12px', background: 'rgba(124,58,237,0.08)', padding: '14px 14px', display: 'grid', gap: '12px' }}>
                  {strategyRules.entry.length || strategyRules.exit.length || strategyRules.market.length || strategyRules.risk.length ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      {[
                        { title: 'Entry criteria', list: strategyRules.entry, prefix: 'entry' },
                        { title: 'Exit criteria', list: strategyRules.exit, prefix: 'exit' },
                        { title: 'Market conditions', list: strategyRules.market, prefix: 'market' },
                        { title: 'Risk management', list: strategyRules.risk, prefix: 'risk' },
                      ].map(({ title, list, prefix }) => (
                        <div key={prefix}>
                          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {title}
                          </div>
                          <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
                            {list.length ? (
                              list.map((label, i) => {
                                const key = `${prefix}-${i}`
                                const checked = rulesFollowed[key] !== false
                                return (
                                  <label
                                    key={key}
                                    style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontFamily: 'monospace', fontSize: '13px' }}
                                  >
                                    <input
                                      id={`edit-trade-rule-${key}`}
                                      name={`edit-trade-rule-${key}`}
                                      type="checkbox"
                                      autoComplete="off"
                                      checked={checked}
                                      onChange={e => setRulesFollowed(prev => ({ ...prev, [key]: e.target.checked }))}
                                      style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
                                    />
                                    <span style={{ color: checked ? 'var(--text)' : 'var(--text2)' }}>{label}</span>
                                  </label>
                                )
                              })
                            ) : (
                              <div style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'monospace' }}>No {title.toLowerCase()} yet.</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'monospace' }}>
                      Choose a playbook to load its rules.
                    </div>
                  )}

                  <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)' }}>
                    If any rule is unchecked, we save it into <span style={{ color: 'var(--accent)' }}>mistakes</span> on the trade record.
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '14px', flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text3)', fontFamily: 'monospace' }}>
              {metaLoading ? 'Loading account and playbook options...' : 'Edits apply to this trade and your journal data.'}
            </p>
            <button
              type="submit"
              disabled={saving}
              style={{
                borderRadius: '8px',
                border: 'none',
                background: '#7C3AED',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: 'monospace',
                padding: '10px 18px',
                cursor: 'pointer',
                opacity: saving ? 0.65 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

