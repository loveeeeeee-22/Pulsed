'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getInstrumentSpec } from '@/lib/instrumentSpecs'
import { supabase } from '@/lib/supabase'
import { isTradeReviewed } from '@/lib/tradeReviewStatus'
import { getStrategiesForUser } from '@/lib/getStrategiesForUser'
import TradeNotesRichEditor from '@/components/TradeNotesRichEditor'

const TZ_PURPLE = '#7C3AED'
const TZ_TEAL = '#0D9488'
const TZ_TEAL_DIM = '#5EEAD4'

function plainTextFromHtml(html) {
  if (typeof document === 'undefined') {
    return String(html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  const d = document.createElement('div')
  d.innerHTML = html || ''
  return (d.textContent || d.innerText || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isEmptyNotesHtml(html) {
  const s = String(html || '').trim()
  if (!s) return true
  if (/<img[\s>]/i.test(s)) return false
  return !plainTextFromHtml(s)
}

function seededRand(seed) {
  let x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function buildReplayCandles(trade, count = 100) {
  const entry = parseFloat(trade.entry_price || 0)
  const exit = parseFloat(trade.exit_price || entry)
  const drift = (exit - entry) / Math.max(count, 1)
  const candles = []
  let prevClose = entry
  const symbolSeed = String(trade.symbol || '').split('').reduce((s, ch) => s + ch.charCodeAt(0), 0)
  const noiseBase = Math.max(Math.abs(exit - entry), Math.abs(entry) * 0.004, 1) * 0.06
  for (let i = 0; i < count; i++) {
    const randA = seededRand(symbolSeed + i * 19 + (trade.id ? String(trade.id).length : 0))
    const randB = seededRand(symbolSeed + i * 29 + 7)
    const randC = seededRand(symbolSeed + i * 31 + 11)
    const open = prevClose
    const close = i === count - 1 ? exit : open + drift + (randA - 0.5) * noiseBase
    const high = Math.max(open, close) + randB * noiseBase * 0.9
    const low = Math.min(open, close) - randC * noiseBase * 0.9
    candles.push({ open, high, low, close })
    prevClose = close
  }
  if (candles.length > 0) {
    candles[0].open = entry
    candles[candles.length - 1].close = exit
  }
  return candles
}

function alignCandlesToTradePrices(candles, entryPrice, exitPrice) {
  const source = Array.isArray(candles) ? candles : []
  if (source.length === 0) return []
  const entry = Number(entryPrice)
  const exit = Number(exitPrice)
  if (!Number.isFinite(entry) || !Number.isFinite(exit)) return source
  const first = Number(source[0]?.close)
  const last = Number(source[source.length - 1]?.close)
  if (!Number.isFinite(first) || !Number.isFinite(last)) return source
  const denom = last - first
  const a = Math.abs(denom) < 1e-9 ? 1 : (exit - entry) / denom
  const b = entry - a * first
  return source.map(c => ({
    ...c,
    open: a * Number(c.open) + b,
    high: a * Number(c.high) + b,
    low: a * Number(c.low) + b,
    close: a * Number(c.close) + b,
  }))
}

function fmtMoney(n) {
  const v = Number(n || 0)
  return `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`
}

function fmtMoneyPlain(n) {
  const v = Number(n || 0)
  return `${v >= 0 ? '' : '-'}$${Math.abs(v).toFixed(2)}`
}

function fmtTradeDate(dateStr) {
  if (!dateStr) return '—'
  const raw = String(dateStr).slice(0, 10)
  const d = new Date(`${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatNum(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })
}

function tvIntervalFromTf(tf) {
  const t = String(tf || '')
  if (t.startsWith('5')) return '5'
  if (t.startsWith('15')) return '15'
  if (t.startsWith('30')) return '30'
  if (t.startsWith('45')) return '45'
  if (t.startsWith('60') || /^1h$/i.test(t)) return '60'
  if (t.startsWith('120') || /^2h$/i.test(t)) return '120'
  if (t.startsWith('240') || /^4h$/i.test(t)) return '240'
  if (/day|1d/i.test(t)) return 'D'
  return '1'
}

function parseGradeToStars(grade) {
  const g = String(grade || '').trim().toUpperCase()
  if (!g) return 0
  const n = Number(g)
  if (Number.isFinite(n) && n >= 0) return Math.min(5, Math.max(0, Math.round(n)))
  const map = { A: 5, B: 4, C: 3, D: 2, E: 2, F: 1 }
  return map[g[0]] || 0
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
  if (Array.isArray(rules)) return { entry: rules.map(r => String(r)).filter(Boolean), exit: [], market: [], risk: [] }
  return { entry: [], exit: [], market: [], risk: [] }
}

function parseBrokenLabels(mistakes) {
  if (!mistakes || !String(mistakes).trim()) return []
  const s = String(mistakes)
  if (!s.toLowerCase().includes('not followed')) return []
  return (s.split(':')[1] || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
}

function computeMistakesFromChecks(rules, checks) {
  const broken = [
    ...rules.entry.map((label, i) => (checks[`entry-${i}`] === false ? label : null)).filter(Boolean),
    ...rules.exit.map((label, i) => (checks[`exit-${i}`] === false ? label : null)).filter(Boolean),
    ...rules.market.map((label, i) => (checks[`market-${i}`] === false ? label : null)).filter(Boolean),
    ...rules.risk.map((label, i) => (checks[`risk-${i}`] === false ? label : null)).filter(Boolean),
  ]
  return broken.length ? `Not followed: ${broken.join(', ')}` : null
}

function toTradingViewSymbol({ tradeSymbol, sourceSymbol, accountType }) {
  const src = String(sourceSymbol || '').toUpperCase().replace(/\s/g, '')
  const raw = String(tradeSymbol || '').toUpperCase().replace(/[^A-Z0-9!]/g, '')
  const root = raw.replace(/\d/g, '').replace(/!$/, '').slice(0, 4) || raw.slice(0, 4)

  if (src) {
    if ((src.includes('XAU') && src.includes('USD')) || src === 'XAUUSD') return 'OANDA:XAUUSD'
    if ((src.includes('XAG') && src.includes('USD')) || src === 'XAGUSD') return 'OANDA:XAGUSD'
    if (src.includes('/')) {
      const compact = src.replace(/\//g, '')
      if (compact.length >= 6) return `OANDA:${compact}`
    }
    if (/^[A-Z]{6}$/.test(src)) return `OANDA:${src}`
  }

  const isFutures = String(accountType || '').toLowerCase() === 'futures'
  if (isFutures) {
    const map = {
      MGC: 'COMEX:MGC1!',
      GC: 'COMEX:GC1!',
      MES: 'CME_MINI:MES1!',
      ES: 'CME_MINI:ES1!',
      MNQ: 'CME_MINI:MNQ1!',
      NQ: 'CME_MINI:NQ1!',
      CL: 'NYMEX:CL1!',
      MCL: 'NYMEX:MCL1!',
      YM: 'CBOT_MINI:YM1!',
      MYM: 'CBOT_MINI:MYM1!',
      RTY: 'CME_MINI:RTY1!',
      M2K: 'CME_MINI:M2K1!',
    }
    const futKey = root.length >= 2 ? root.slice(0, 4) : raw.slice(0, 4)
    if (map[futKey]) return map[futKey]
  }

  if (raw) return raw
  return 'OANDA:XAUUSD'
}

function normalizeConfluences(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.map(x => String(x).trim()).filter(Boolean)
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p.map(x => String(x).trim()).filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
}

function StatRow({ label, value, valueColor }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: '12px',
        padding: '9px 0',
        borderBottom: '1px solid var(--border)',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      }}
    >
      <span style={{ fontSize: '12px', color: 'var(--text3)', flexShrink: 0 }}>{label}</span>
      <span
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: valueColor || 'var(--text)',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function TradeGradeStarsInteractive({ filled, disabled, onStarClick }) {
  const n = Math.min(5, Math.max(0, filled))
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexWrap: 'wrap' }} role="group" aria-label={`Trade rating, ${n} of 5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onStarClick(i)}
          aria-label={`Set rating to ${i} of 5`}
          aria-pressed={i <= n}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: '2px 3px',
            fontSize: '18px',
            lineHeight: 1,
            color: i <= n ? '#EAB308' : 'var(--border-md)',
            opacity: disabled ? 0.5 : 1,
            transition: 'color 0.12s, transform 0.12s',
          }}
          onMouseDown={e => e.preventDefault()}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default function TradeReviewModal({
  trade,
  accountName,
  accountType,
  strategyName,
  trades = null,
  onSelectTrade = null,
  onClose,
  /** Called after DB successfully saves review status (e.g. update trade log UI). */
  onMarkReviewed,
  onRequestEdit,
  onSaveNotes,
  onLinkPlaybook,
  onSaveRuleReview,
  onSaveTradeGrade,
  onSaveConfluences,
}) {
  const [activeTab, setActiveTab] = useState('stats')
  const [noteDraft, setNoteDraft] = useState(trade?.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [journalTab, setJournalTab] = useState('notes')
  const [chartsSectionOpen, setChartsSectionOpen] = useState(true)
  const [playbooks, setPlaybooks] = useState([])
  const [selectedPlaybookId, setSelectedPlaybookId] = useState(trade?.strategy_id || '')
  const [linkingPlaybook, setLinkingPlaybook] = useState(false)
  const [playbookMsg, setPlaybookMsg] = useState('')
  const [showPlaybookPicker, setShowPlaybookPicker] = useState(false)
  const [ruleChecks, setRuleChecks] = useState({})
  const [savingRules, setSavingRules] = useState(false)
  const [markingReviewed, setMarkingReviewed] = useState(false)
  const [markReviewError, setMarkReviewError] = useState('')
  const [savingGrade, setSavingGrade] = useState(false)
  const [confluenceInput, setConfluenceInput] = useState('')
  const [savingConfluences, setSavingConfluences] = useState(false)
  const notesEditorRef = useRef(null)

  const entryPrice = Number(trade?.entry_price || 0)
  const exitPrice = Number(trade?.exit_price || 0)
  const contracts = Number(trade?.contracts || 1) || 1
  const spec = useMemo(() => getInstrumentSpec({ symbol: trade?.symbol, accountType }), [trade?.symbol, accountType])

  const navIndex = useMemo(() => {
    if (!trades?.length || !trade?.id) return -1
    return trades.findIndex(t => t.id === trade.id)
  }, [trades, trade?.id])

  const canPrev = navIndex > 0
  const canNext = navIndex >= 0 && navIndex < (trades?.length || 0) - 1

  useEffect(() => {
    setNoteDraft(trade?.notes || '')
    setSelectedPlaybookId(trade?.strategy_id || '')
    setPlaybookMsg('')
    setMarkReviewError('')
  }, [trade?.id, trade?.notes, trade?.strategy_id])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const rows = await getStrategiesForUser({ select: 'id,name,rules', order: { column: 'name', ascending: true } })
      if (!cancelled) setPlaybooks(rows || [])
    })()
    return () => { cancelled = true }
  }, [])

  async function handleMarkAsReviewed() {
    if (!trade?.id || markingReviewed) return
    const candidates = [
      { reviewed: true },
      { is_reviewed: true },
      { needs_review: false },
      { review_complete: true },
    ]
    setMarkingReviewed(true)
    setMarkReviewError('')
    let reviewPersisted = false
    let lastErr = null
    try {
      // eslint-disable-next-line no-restricted-syntax
      for (const payload of candidates) {
        // eslint-disable-next-line no-await-in-loop
        const { error } = await supabase.from('trades').update(payload).eq('id', trade.id)
        if (!error) {
          reviewPersisted = true
          break
        }
        lastErr = error
      }
      if (reviewPersisted) {
        onMarkReviewed?.({
          tradeId: trade.id,
          reviewed: true,
          reviewPersisted: true,
        })
      } else if (lastErr?.message) {
        setMarkReviewError(lastErr.message)
      } else {
        setMarkReviewError('Could not save review status.')
      }
    } finally {
      setMarkingReviewed(false)
    }
  }

  async function handleClose() {
    try {
      await handleSaveNotes()
    } catch {
      // ignore save issues on close
    }

    onClose?.()
  }

  const linkedPlaybook = useMemo(
    () => (trade?.strategy_id ? playbooks.find(p => p.id === trade.strategy_id) : null),
    [playbooks, trade?.strategy_id]
  )
  const linkedRules = useMemo(() => normalizeRules(linkedPlaybook?.rules), [linkedPlaybook?.rules])

  const totalRules =
    linkedRules.entry.length + linkedRules.exit.length + linkedRules.market.length + linkedRules.risk.length
  const followedRules = [
    ...linkedRules.entry.map((_, i) => ruleChecks[`entry-${i}`] !== false),
    ...linkedRules.exit.map((_, i) => ruleChecks[`exit-${i}`] !== false),
    ...linkedRules.market.map((_, i) => ruleChecks[`market-${i}`] !== false),
    ...linkedRules.risk.map((_, i) => ruleChecks[`risk-${i}`] !== false),
  ].filter(Boolean).length
  const followedPct = totalRules > 0 ? (followedRules / totalRules) * 100 : 0

  const netPnl = Number(trade?.net_pnl || 0)
  const grossPnl = Number(trade?.gross_pnl || 0)
  const fees = Number(trade?.fees || 0)
  const tradeRisk = trade?.trade_risk != null ? Number(trade.trade_risk) : null
  const dirLower = String(trade?.direction || '').toLowerCase()
  const sideLabel = dirLower === 'short' ? 'SHORT' : dirLower === 'long' ? 'LONG' : String(trade?.direction || '—').toUpperCase()
  const sideColor = dirLower === 'short' ? '#EF4444' : dirLower === 'long' ? '#22C55E' : 'var(--text2)'

  const pointsVal = trade?.points != null ? Number(trade.points) : null
  let tickCount = null
  if (Number.isFinite(entryPrice) && Number.isFinite(exitPrice) && spec.tickSize > 0) {
    tickCount = Math.abs(exitPrice - entryPrice) / spec.tickSize
  }

  const netRoiPct =
    tradeRisk != null && Math.abs(tradeRisk) > 1e-9
      ? `${((netPnl / Math.abs(tradeRisk)) * 100).toFixed(2)}%`
      : '—'

  const starCount = parseGradeToStars(trade?.trade_grade)
  const confluenceTags = useMemo(() => normalizeConfluences(trade?.confluences), [trade?.confluences])

  async function handleStarClick(level) {
    if (!onSaveTradeGrade || savingGrade) return
    setSavingGrade(true)
    try {
      await onSaveTradeGrade(String(level))
    } finally {
      setSavingGrade(false)
    }
  }

  async function handleClearTradeGrade() {
    if (!onSaveTradeGrade || savingGrade) return
    setSavingGrade(true)
    try {
      await onSaveTradeGrade(null)
    } finally {
      setSavingGrade(false)
    }
  }

  async function handleAddConfluence() {
    const t = confluenceInput.trim()
    if (!t || !onSaveConfluences || savingConfluences) return
    const cur = normalizeConfluences(trade?.confluences)
    if (cur.includes(t)) {
      setConfluenceInput('')
      return
    }
    setSavingConfluences(true)
    try {
      await onSaveConfluences([...cur, t])
      setConfluenceInput('')
    } finally {
      setSavingConfluences(false)
    }
  }

  async function handleRemoveConfluence(tag) {
    if (!onSaveConfluences || savingConfluences) return
    const cur = normalizeConfluences(trade?.confluences)
    setSavingConfluences(true)
    try {
      await onSaveConfluences(cur.filter(x => x !== tag))
    } finally {
      setSavingConfluences(false)
    }
  }

  useEffect(() => {
    const broken = parseBrokenLabels(trade?.mistakes)
    const next = {}
    linkedRules.entry.forEach((label, i) => { next[`entry-${i}`] = !broken.includes(label) })
    linkedRules.exit.forEach((label, i) => { next[`exit-${i}`] = !broken.includes(label) })
    linkedRules.market.forEach((label, i) => { next[`market-${i}`] = !broken.includes(label) })
    linkedRules.risk.forEach((label, i) => { next[`risk-${i}`] = !broken.includes(label) })
    setRuleChecks(next)
  }, [linkedPlaybook?.id, linkedRules, trade?.mistakes, trade?.strategy_id])

  async function handleSaveNotes() {
    setSavingNotes(true)
    try {
      const html = notesEditorRef.current?.getHtml?.() ?? noteDraft
      const trimmed = String(html || '').trim()
      const payload = isEmptyNotesHtml(trimmed) ? null : trimmed
      await onSaveNotes?.(payload)
    } finally {
      setSavingNotes(false)
    }
  }

  async function handleLinkPlaybook() {
    setLinkingPlaybook(true)
    setPlaybookMsg('')
    try {
      await onLinkPlaybook?.(selectedPlaybookId || null)
      const nextName = playbooks.find(p => p.id === selectedPlaybookId)?.name || 'None'
      setPlaybookMsg(`Linked: ${nextName}`)
      setShowPlaybookPicker(false)
    } catch (e) {
      setPlaybookMsg(e?.message || 'Could not link playbook.')
    } finally {
      setLinkingPlaybook(false)
    }
  }

  function checkAllLinkedRules() {
    const r = linkedRules
    const next = { ...ruleChecks }
    r.entry.forEach((_, i) => { next[`entry-${i}`] = true })
    r.exit.forEach((_, i) => { next[`exit-${i}`] = true })
    r.market.forEach((_, i) => { next[`market-${i}`] = true })
    r.risk.forEach((_, i) => { next[`risk-${i}`] = true })
    setRuleChecks(next)
  }

  async function handleSaveRuleReview() {
    setSavingRules(true)
    setPlaybookMsg('')
    try {
      const mistakes = computeMistakesFromChecks(linkedRules, ruleChecks)
      await onSaveRuleReview?.(mistakes)
      setPlaybookMsg('Playbook checklist saved.')
    } catch (e) {
      setPlaybookMsg(e?.message || 'Could not save checklist.')
    } finally {
      setSavingRules(false)
    }
  }

  function goNav(delta) {
    if (!trades?.length || !onSelectTrade || navIndex < 0) return
    const next = trades[navIndex + delta]
    if (next) onSelectTrade(next)
  }

  // TradingView widget intentionally removed for now (not supported for replays).

  const uiFont = 'system-ui, -apple-system, Segoe UI, sans-serif'
  const pnlTeal = netPnl >= 0 ? TZ_TEAL : '#F43F5E'
  const pnlTealGlow = netPnl >= 0 ? TZ_TEAL_DIM : '#FDA4AF'

  const tabBtn = (key, label) => (
    <button
      key={key}
      type="button"
      onClick={() => setActiveTab(key)}
      style={{
        border: 'none',
        borderBottom: activeTab === key ? `2px solid ${TZ_PURPLE}` : '2px solid transparent',
        background: 'transparent',
        color: activeTab === key ? 'var(--text)' : 'var(--text3)',
        padding: '10px 4px',
        marginRight: '18px',
        fontSize: '13px',
        fontWeight: activeTab === key ? 700 : 500,
        fontFamily: uiFont,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  const purpleBtn = {
    border: 'none',
    background: TZ_PURPLE,
    color: '#fff',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: uiFont,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Trade review"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 220,
        background: 'rgba(15, 15, 18, 0.88)',
        display: 'flex',
        padding: '16px',
        overflowY: 'auto',
        alignItems: 'flex-start',
        justifyContent: 'center',
        fontFamily: uiFont,
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1480px',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          background: 'var(--card-bg)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 'min(920px, calc(100vh - 32px))',
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text3)', textTransform: 'uppercase' }}>
                Trade review
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)' }}>{trade?.symbol || '—'}</span>
                <span style={{ fontSize: '14px', color: 'var(--text2)' }}>{fmtTradeDate(trade?.date)}</span>
              </div>
            </div>
            {trades?.length > 1 && onSelectTrade ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '22px' }}>
                <button
                  type="button"
                  aria-label="Previous trade"
                  disabled={!canPrev}
                  onClick={() => goNav(-1)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg3)',
                    color: canPrev ? 'var(--text)' : 'var(--text3)',
                    cursor: canPrev ? 'pointer' : 'not-allowed',
                    fontSize: '16px',
                    lineHeight: 1,
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next trade"
                  disabled={!canNext}
                  onClick={() => goNav(1)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg3)',
                    color: canNext ? 'var(--text)' : 'var(--text3)',
                    cursor: canNext ? 'pointer' : 'not-allowed',
                    fontSize: '16px',
                    lineHeight: 1,
                  }}
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text3)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={accountName || ''}>
              {accountName || 'Account'}
            </span>
            {isTradeReviewed(trade) ? (
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: uiFont,
                  color: '#22C55E',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                  background: 'rgba(34, 197, 94, 0.08)',
                }}
              >
                Reviewed
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => handleMarkAsReviewed()}
                  disabled={markingReviewed}
                  style={{
                    ...purpleBtn,
                    opacity: markingReviewed ? 0.7 : 1,
                    cursor: markingReviewed ? 'wait' : 'pointer',
                  }}
                >
                  {markingReviewed ? 'Saving…' : 'Mark as reviewed'}
                </button>
                {markReviewError ? (
                  <span style={{ fontSize: '11px', color: '#F87171', maxWidth: '220px', textAlign: 'right' }}>{markReviewError}</span>
                ) : null}
              </div>
            )}
            <a
              href={`/replay/${trade?.id}`}
              style={{
                ...purpleBtn,
                background: 'var(--bg3)',
                color: 'var(--text2)',
                border: '1px solid var(--border)',
                textDecoration: 'none',
              }}
            >
              Play Replay
            </a>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg3)',
                color: 'var(--text2)',
                cursor: 'pointer',
                fontSize: '20px',
                lineHeight: 1,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        </header>

        <div style={{ display: 'flex', flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          {/* Sidebar */}
          <aside
            style={{
              width: '308px',
              flexShrink: 0,
              borderRight: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg3)',
              maxHeight: 'calc(100vh - 120px)',
            }}
          >
            <div style={{ padding: '0 14px', borderBottom: '1px solid var(--border)', display: 'flex' }}>
              {tabBtn('stats', 'Stats')}
              {tabBtn('playbook', 'Playbook')}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
              {activeTab === 'stats' ? (
                <>
                  <div style={{ display: 'flex', gap: '0', alignItems: 'stretch', marginBottom: '16px' }}>
                    <div style={{ width: '4px', borderRadius: '2px', background: pnlTeal, flexShrink: 0 }} aria-hidden />
                    <div style={{ paddingLeft: '12px', minWidth: 0 }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '4px' }}>
                        Net P&amp;L
                      </div>
                      <div
                        style={{
                          fontSize: '28px',
                          fontWeight: 800,
                          color: pnlTeal,
                          textShadow: netPnl !== 0 ? `0 0 28px ${pnlTealGlow}55` : 'none',
                          fontVariantNumeric: 'tabular-nums',
                          lineHeight: 1.1,
                        }}
                      >
                        {fmtMoneyPlain(netPnl)}
                      </div>
                    </div>
                  </div>

                  <StatRow label="Side" value={sideLabel} valueColor={sideColor} />
                  <StatRow label="Contracts traded" value={formatNum(trade?.contracts)} />
                  <StatRow
                    label="Points / ticks"
                    value={
                      pointsVal != null && Number.isFinite(pointsVal) && tickCount != null && Number.isFinite(tickCount)
                        ? `${formatNum(pointsVal)} / ${tickCount.toFixed(1)}`
                        : pointsVal != null && Number.isFinite(pointsVal)
                          ? `${formatNum(pointsVal)} / —`
                          : tickCount != null
                            ? `— / ${tickCount.toFixed(1)}`
                            : '—'
                    }
                  />
                  <StatRow label="Commissions & fees" value={`$${Math.abs(fees).toFixed(2)}`} />
                  <StatRow label="Net ROI (on risk)" value={netRoiPct} valueColor={netRoiPct !== '—' ? 'var(--text)' : 'var(--text3)'} />
                  <StatRow label="Gross P&L" value={fmtMoneyPlain(grossPnl)} valueColor={grossPnl >= 0 ? TZ_TEAL : '#F43F5E'} />
                  <StatRow label="Adjusted cost" value="—" />
                  <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Playbook
                    </div>
                    <select
                      id="review-trade-playbook"
                      name="strategy_id"
                      autoComplete="off"
                      value={selectedPlaybookId || ''}
                      onChange={e => setSelectedPlaybookId(e.target.value)}
                      style={{
                        width: '100%',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--card-bg)',
                        color: 'var(--text)',
                        fontSize: '13px',
                        padding: '8px 10px',
                        fontFamily: uiFont,
                      }}
                    >
                      <option value="">Select playbook</option>
                      {playbooks.map(pb => (
                        <option key={pb.id} value={pb.id}>{pb.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleLinkPlaybook}
                      disabled={linkingPlaybook}
                      style={{
                        marginTop: '8px',
                        width: '100%',
                        ...purpleBtn,
                        justifyContent: 'center',
                        opacity: linkingPlaybook ? 0.7 : 1,
                      }}
                    >
                      {linkingPlaybook ? 'Saving…' : 'Apply playbook to trade'}
                    </button>
                    {playbookMsg && activeTab === 'stats' ? (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#86efac' }}>{playbookMsg}</div>
                    ) : null}
                  </div>

                  <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text3)', textTransform: 'uppercase' }}>
                        Rules score
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>
                        {totalRules > 0 ? `${Math.round(followedPct)}%` : '—'}
                      </span>
                    </div>
                    <div style={{ height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)' }}>
                      <div style={{ width: `${followedPct}%`, height: '100%', borderRadius: '999px', background: TZ_TEAL, transition: 'width 0.15s' }} />
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '10px', color: 'var(--text3)' }}>
                      Link a playbook and use the Playbook tab to score rules.
                    </div>
                  </div>

                  <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text3)', paddingTop: '4px' }}>Trade rating</span>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                        <TradeGradeStarsInteractive filled={starCount} disabled={savingGrade || !onSaveTradeGrade} onStarClick={handleStarClick} />
                        {onSaveTradeGrade && trade?.trade_grade != null && String(trade.trade_grade).trim() !== '' ? (
                          <button
                            type="button"
                            onClick={handleClearTradeGrade}
                            disabled={savingGrade}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--text3)',
                              fontSize: '11px',
                              cursor: savingGrade ? 'not-allowed' : 'pointer',
                              textDecoration: 'underline',
                              padding: 0,
                            }}
                          >
                            Clear rating
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {trade?.trade_grade && !/^[1-5]$/.test(String(trade.trade_grade).trim()) ? (
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '8px' }}>
                        Grade label: {trade.trade_grade}
                      </div>
                    ) : null}
                    {savingGrade ? <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '6px' }}>Saving…</div> : null}
                  </div>
                  <StatRow label="Profit target" value={trade?.profit_target != null ? formatNum(trade.profit_target) : '—'} />
                  <StatRow label="Stop loss" value={trade?.stop_loss != null ? formatNum(trade.stop_loss) : '—'} />
                  <StatRow
                    label="Trade risk"
                    value={trade?.trade_risk != null ? fmtMoneyPlain(Number(trade.trade_risk)) : '—'}
                    valueColor={tradeRisk != null && tradeRisk < 0 ? '#F43F5E' : 'var(--text)'}
                  />
                  <StatRow label="Realized R-multiple" value={trade?.actual_rr != null && trade.actual_rr !== '' ? `${formatNum(trade.actual_rr)}R` : '—'} />
                  <StatRow label="Average entry" value={trade?.entry_price != null ? formatNum(trade.entry_price) : '—'} />
                  <StatRow label="Average exit" value={trade?.exit_price != null ? formatNum(trade.exit_price) : '—'} />
                  <StatRow label="Entry time" value={trade?.entry_time || '—'} />
                  <StatRow label="Exit time" value={trade?.exit_time || '—'} />
                  <StatRow label="Session" value={trade?.session || '—'} />
                  <StatRow label="Status" value={trade?.status || '—'} />
                  <StatRow label="Planned R:R" value={trade?.planned_rr != null ? formatNum(trade.planned_rr) : '—'} />

                  <div style={{ paddingTop: '14px', borderTop: '1px solid var(--border)', marginTop: '4px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '10px' }}>
                      Confluences
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      {confluenceTags.length ? (
                        confluenceTags.map(tag => (
                          <span
                            key={tag}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '5px 10px',
                              borderRadius: '999px',
                              background: 'rgba(13, 148, 136, 0.15)',
                              border: '1px solid rgba(13, 148, 136, 0.35)',
                              color: 'var(--text)',
                              fontSize: '12px',
                              fontWeight: 500,
                            }}
                          >
                            {tag}
                            <button
                              type="button"
                              aria-label={`Remove ${tag}`}
                              disabled={savingConfluences || !onSaveConfluences}
                              onClick={() => handleRemoveConfluence(tag)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text3)',
                                cursor: savingConfluences || !onSaveConfluences ? 'not-allowed' : 'pointer',
                                fontSize: '14px',
                                lineHeight: 1,
                                padding: 0,
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text3)' }}>No confluence tags yet.</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        id="review-confluence-input"
                        name="confluence"
                        type="text"
                        autoComplete="off"
                        value={confluenceInput}
                        onChange={e => setConfluenceInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddConfluence()
                          }
                        }}
                        placeholder="e.g. FVG, OB, liquidity sweep"
                        disabled={savingConfluences || !onSaveConfluences}
                        style={{
                          flex: '1 1 140px',
                          minWidth: '120px',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          background: 'var(--card-bg)',
                          color: 'var(--text)',
                          fontSize: '13px',
                          padding: '8px 10px',
                          fontFamily: uiFont,
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAddConfluence}
                        disabled={savingConfluences || !onSaveConfluences || !confluenceInput.trim()}
                        style={{
                          border: 'none',
                          background: TZ_PURPLE,
                          color: '#fff',
                          borderRadius: '8px',
                          padding: '8px 14px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: savingConfluences || !confluenceInput.trim() ? 'not-allowed' : 'pointer',
                          opacity: savingConfluences || !confluenceInput.trim() ? 0.6 : 1,
                        }}
                      >
                        Add
                      </button>
                    </div>
                    {!onSaveConfluences ? (
                      <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '8px' }}>Confluence save is not wired for this view.</div>
                    ) : null}
                    {savingConfluences ? <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '6px' }}>Saving…</div> : null}
                  </div>
                </>
              ) : activeTab === 'playbook' ? (
                <>
                  {!trade?.strategy_id ? (
                    <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px', lineHeight: 1.45 }}>
                      Add a playbook from the Stats tab or use Change playbook below.
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setShowPlaybookPicker(v => !v)}
                      style={{ border: 'none', background: TZ_PURPLE, color: '#fff', borderRadius: '8px', padding: '7px 11px', fontFamily: uiFont, fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      {trade?.strategy_id ? (showPlaybookPicker ? 'Cancel' : 'Change playbook') : (showPlaybookPicker ? 'Hide list' : 'Add playbook')}
                    </button>
                    <div style={{ fontSize: '11px', color: playbookMsg ? '#86efac' : 'var(--text3)' }}>
                      {playbookMsg || (strategyName ? `Linked: ${strategyName}` : 'No linked playbook')}
                    </div>
                  </div>

                  {showPlaybookPicker ? (
                    <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--card-bg)', padding: '10px', display: 'grid', gap: '8px', marginBottom: '12px' }}>
                      {playbooks.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text3)' }}>No playbooks created yet.</div>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                            {playbooks.map(pb => (
                              <label key={pb.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text)' }}>
                                <input
                                  id={`review-playbook-radio-${pb.id}`}
                                  type="radio"
                                  name="playbook-link-modal"
                                  autoComplete="off"
                                  checked={selectedPlaybookId === pb.id}
                                  onChange={() => setSelectedPlaybookId(pb.id)}
                                />
                                {pb.name}
                              </label>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={handleLinkPlaybook}
                            disabled={linkingPlaybook}
                            style={{ border: 'none', background: TZ_PURPLE, color: '#fff', borderRadius: '8px', padding: '7px 10px', fontFamily: uiFont, fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: linkingPlaybook ? 0.7 : 1 }}
                          >
                            {linkingPlaybook ? 'Saving…' : trade?.strategy_id ? 'Attach playbook' : 'Link playbook to trade'}
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}

                  {linkedPlaybook ? (
                    <div
                      style={{
                        border: `1px solid rgba(124, 58, 237, 0.35)`,
                        borderRadius: '12px',
                        background: 'rgba(124, 58, 237, 0.1)',
                        padding: '12px',
                        display: 'grid',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#92400e', flexShrink: 0 }} aria-hidden />
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {linkedPlaybook.name}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.06em' }}>RULES FOLLOWED</span>
                          <button
                            type="button"
                            onClick={checkAllLinkedRules}
                            style={{ border: 'none', background: 'transparent', color: TZ_TEAL, fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer', padding: 0 }}
                          >
                            CHECK ALL
                          </button>
                          <span style={{ fontSize: '11px', color: 'var(--text2)', marginLeft: 'auto' }}>{followedRules} / {totalRules || 0}</span>
                        </div>
                        <div style={{ height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)' }}>
                          <div style={{ width: `${followedPct}%`, height: '100%', borderRadius: '999px', background: '#22C55E', transition: 'width 0.15s' }} />
                        </div>
                      </div>

                      {[
                        { title: 'ENTRY CRITERIA', items: linkedRules.entry, prefix: 'entry' },
                        { title: 'EXIT CRITERIA', items: linkedRules.exit, prefix: 'exit' },
                        { title: 'MARKET CONDITIONS', items: linkedRules.market, prefix: 'market' },
                        { title: 'RISK MANAGEMENT', items: linkedRules.risk, prefix: 'risk' },
                      ].map(section =>
                        section.items.length ? (
                          <div key={section.title}>
                            <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '8px' }}>{section.title}</div>
                            <div style={{ display: 'grid', gap: '8px' }}>
                              {section.items.map((label, i) => {
                                const key = `${section.prefix}-${i}`
                                return (
                                  <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12px', color: 'var(--text2)', cursor: 'pointer' }}>
                                    <input
                                      id={`review-rule-check-${key}`}
                                      name={`review-rule-check-${key}`}
                                      type="checkbox"
                                      autoComplete="off"
                                      checked={ruleChecks[key] !== false}
                                      onChange={e => setRuleChecks(prev => ({ ...prev, [key]: e.target.checked }))}
                                      style={{ marginTop: '2px', accentColor: '#3B82F6', width: '16px', height: '16px', flexShrink: 0 }}
                                    />
                                    <span style={{ lineHeight: 1.35 }}>{label}</span>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        ) : null
                      )}

                      {totalRules === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text3)' }}>No rules in this playbook yet. Add them under Playbook → Edit.</div>
                      ) : null}

                      <button
                        type="button"
                        onClick={handleSaveRuleReview}
                        disabled={savingRules || totalRules === 0}
                        style={{ border: 'none', background: TZ_PURPLE, color: '#fff', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: savingRules || totalRules === 0 ? 0.7 : 1 }}
                      >
                        {savingRules ? 'Saving…' : 'Save playbook checklist'}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </aside>

          {/* Main */}
          <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--card-bg)' }}>
            <div>
              <button
                type="button"
                onClick={() => setChartsSectionOpen(o => !o)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  border: 'none',
                  background: 'var(--bg3)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text2)',
                  fontFamily: uiFont,
                  textAlign: 'left',
                }}
              >
                <span style={{ display: 'inline-block', transform: chartsSectionOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
                Notes
              </button>
              {chartsSectionOpen ? (
                <div style={{ padding: '12px 16px 18px', display: 'grid', gap: '12px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                    {[
                      { key: 'notes', label: 'Trade note' },
                      { key: 'journal', label: 'Daily journal' },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setJournalTab(tab.key)}
                        style={{
                          border: 'none',
                          borderRadius: '8px',
                          padding: '8px 16px',
                          fontSize: '12px',
                          fontWeight: 600,
                          fontFamily: uiFont,
                          cursor: 'pointer',
                          background: journalTab === tab.key ? TZ_PURPLE : 'var(--bg3)',
                          color: journalTab === tab.key ? '#fff' : 'var(--text2)',
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    {['Recently used', 'Weekly recap', 'All-in-one / daily', 'New template', '+ Add template'].map(t => (
                      <button
                        key={t}
                        type="button"
                        disabled
                        title="Templates coming soon"
                        style={{
                          border: '1px dashed var(--border)',
                          background: 'transparent',
                          color: 'var(--text3)',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          fontSize: '11px',
                          cursor: 'not-allowed',
                          opacity: 0.75,
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <TradeNotesRichEditor
                    key={trade?.id || 'note'}
                    ref={notesEditorRef}
                    tradeId={trade?.id}
                    initialHtml={trade?.notes || ''}
                    onHtmlChange={setNoteDraft}
                    minHeight={journalTab === 'journal' ? 220 : 200}
                    placeholder={
                      journalTab === 'journal'
                        ? 'Daily journal: context, mindset, what changed…'
                        : 'Enter trade notes…'
                    }
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{plainTextFromHtml(noteDraft).length} chars (plain text)</span>
                    <button
                      type="button"
                      onClick={handleSaveNotes}
                      disabled={savingNotes}
                      style={{ borderRadius: '8px', border: 'none', background: TZ_PURPLE, color: '#fff', padding: '8px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: savingNotes ? 0.7 : 1 }}
                    >
                      {savingNotes ? 'Saving…' : journalTab === 'journal' ? 'Save journal' : 'Save notes'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
