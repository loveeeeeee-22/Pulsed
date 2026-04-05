'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getAccountsForUser } from '@/lib/getAccountsForUser'
import { getTradesForUser } from '@/lib/getTradesForUser'
import { countTradesNeedingReview, isTradeReviewed } from '@/lib/tradeReviewStatus'
import { getStrategiesForUser } from '@/lib/getStrategiesForUser'
import { useTheme } from '@/lib/ThemeContext'
import Link from 'next/link'

function formatDateTick(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return String(dateStr).slice(5)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${mm}/${dd}/${yy}`
}

/** e.g. Mar 1 — matches compact dashboard chart ticks */
function formatDateTickShort(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return formatDateTick(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function pointsToSmoothPath(points) {
  if (!points.length) return ''
  if (points.length === 1) return `M${points[0].x},${points[0].y}`
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`
  }
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }
  return d
}

function smoothAreaPath(points, baselineY) {
  const line = pointsToSmoothPath(points)
  if (!line || !points.length) return ''
  const last = points[points.length - 1]
  const first = points[0]
  return `${line} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`
}

function MiniChartIcon({ color = 'var(--text3)' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0, opacity: 0.7 }}>
      <path d="M4 18V6M4 18h16M8 14l3-4 3 2 4-6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** DB / forms use `long` / `short` (lowercase); Tradovate uses Long / Short. */
function directionIsLong(direction) {
  const d = String(direction || '').toLowerCase()
  return d === 'long' || d === 'l'
}

function directionIsShort(direction) {
  const d = String(direction || '').toLowerCase()
  return d === 'short' || d === 's'
}

/** Map viewport X to SVG user X when using preserveAspectRatio meet/slice (letterboxing). */
function clientPointToSvgXY(svg, clientX, clientY) {
  if (!svg?.createSVGPoint) return null
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  return pt.matrixTransform(ctm.inverse())
}

function buildLinearTicks(minV, maxV, count = 5) {
  if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return [0]
  if (Math.abs(maxV - minV) < 1e-9) return [minV]
  return Array.from({ length: count }, (_, i) => minV + ((maxV - minV) * i) / (count - 1))
}

function buildIndexTicks(length, count = 4) {
  if (!length) return []
  if (length === 1) return [0]
  const idx = new Set([0, length - 1])
  for (let i = 1; i < count - 1; i += 1) idx.add(Math.round((i / (count - 1)) * (length - 1)))
  return Array.from(idx).sort((a, b) => a - b)
}

function parseTimeToMinutes(t) {
  if (!t || typeof t !== 'string') return null
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

function tradeDurationMinutes(trade) {
  const a = parseTimeToMinutes(trade.entry_time)
  const b = parseTimeToMinutes(trade.exit_time)
  if (a == null || b == null) return null
  let d = b - a
  if (d < 0) d += 24 * 60
  return d
}

function formatDurationMins(mins) {
  if (mins == null || !Number.isFinite(mins)) return '—'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h <= 0) return `${m}m`
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

function computeStreaks(tradesChrono) {
  let winStreak = 0
  let lossStreak = 0
  let maxWin = 0
  let maxLoss = 0
  for (const t of tradesChrono) {
    if (t.status === 'Win') {
      winStreak += 1
      lossStreak = 0
      maxWin = Math.max(maxWin, winStreak)
    } else if (t.status === 'Loss') {
      lossStreak += 1
      winStreak = 0
      maxLoss = Math.max(maxLoss, lossStreak)
    } else {
      winStreak = 0
      lossStreak = 0
    }
  }
  return { maxWin, maxLoss }
}

function exportTradesCsv(trades, filename = 'pulsed-trades-export.csv') {
  const headers = ['date', 'symbol', 'direction', 'status', 'net_pnl', 'contracts', 'account_id', 'strategy_id', 'reviewed']
  const rows = [headers.join(',')]
  for (const t of trades) {
    const r = headers.map((h) => {
      let v = t[h]
      if (h === 'reviewed') v = isTradeReviewed(t) ? 'yes' : 'no'
      if (v == null) v = ''
      const s = String(v).replace(/"/g, '""')
      return `"${s}"`
    })
    rows.push(r.join(','))
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function Dashboard() {
  const { theme, toggleTheme } = useTheme()
  const [trades, setTrades] = useState([])
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('all')
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const accent = '#7C3AED'
  const [selectedDay, setSelectedDay] = useState(null)
  const [showNote, setShowNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [journalEntries, setJournalEntries] = useState([])
  const [hoveredEqIndex, setHoveredEqIndex] = useState(null)
  const [hoveredDdIndex, setHoveredDdIndex] = useState(null)
  const [hoveredSparkIndex, setHoveredSparkIndex] = useState(null)
  const [now, setNow] = useState(new Date())
  const [dashUsername, setDashUsername] = useState('')
  const noteRef = useRef(null)
  const eqSvgRef = useRef(null)
  const ddSvgRef = useRef(null)
  const sparkSvgRef = useRef(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [sessionUser, setSessionUser] = useState(null)
  const [strategies, setStrategies] = useState([])
  const [journalFilter, setJournalFilter] = useState('all')
  const [timeRange, setTimeRange] = useState('all')
  const [strategyFilter, setStrategyFilter] = useState('all')

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', '#7C3AED')
    localStorage.removeItem('accentColor')
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      setSessionUser(session?.user ?? null)
      setAuthLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null)
      if (session?.user?.id) fetchDashProfile()
      else setDashUsername('')
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!sessionUser?.id) return
    fetchAccounts()
    fetchTrades()
    fetchJournalEntries()
    fetchDashProfile()
    ;(async () => {
      const list = await getStrategiesForUser({ select: 'id, name' })
      setStrategies(Array.isArray(list) ? list : [])
    })()
  }, [sessionUser?.id])

  async function fetchAccounts() {
    const data = await getAccountsForUser()
    setAccounts(data)
  }

  async function fetchTrades() {
    setLoading(true)
    const data = await getTradesForUser({ orderAscending: true })
    setTrades(data)
    setLoading(false)
  }

  async function fetchJournalEntries() {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) {
      setJournalEntries([])
      return
    }
    const { data } = await supabase.from('journal_entries').select('*').eq('user_id', uid)
    if (data) setJournalEntries(data)
  }

  async function fetchDashProfile() {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) {
      setDashUsername('')
      return
    }
    const { data } = await supabase.from('profiles').select('username').eq('id', uid).maybeSingle()
    setDashUsername(data?.username?.trim() ? data.username.trim() : '')
  }

  async function saveNote(dateStr) {
    const uid = sessionUser?.id
    if (!uid) return
    const existing = journalEntries.find(e => e.date === dateStr)
    if (existing) {
      await supabase.from('journal_entries').update({ pre_market_notes: noteText }).eq('id', existing.id)
    } else {
      await supabase.from('journal_entries').insert({
        date: dateStr,
        pre_market_notes: noteText,
        user_id: uid,
      })
    }
    await fetchJournalEntries()
    setShowNote(false)
  }

  const filtered = useMemo(() => {
    let list = trades.filter(t => selectedAccount === 'all' || t.account_id === selectedAccount)
    if (journalFilter === 'verified') list = list.filter(isTradeReviewed)
    if (journalFilter === 'needs_review') list = list.filter(t => !isTradeReviewed(t))
    if (strategyFilter !== 'all') {
      list = list.filter(t => String(t.strategy_id || '') === strategyFilter)
    }
    if (timeRange !== 'all') {
      const nowD = new Date()
      const cutoff = new Date(nowD)
      if (timeRange === 'week') cutoff.setDate(cutoff.getDate() - 7)
      if (timeRange === 'month') cutoff.setMonth(cutoff.getMonth() - 1)
      const cutStr = cutoff.toISOString().slice(0, 10)
      list = list.filter(t => (t.date?.slice(0, 10) || '') >= cutStr)
    }
    return list
  }, [trades, selectedAccount, journalFilter, strategyFilter, timeRange])

  if (!authLoading && !sessionUser) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--page-bg)', color: 'var(--text)', fontFamily: 'sans-serif', padding: '24px 16px' }}>
        <div style={{ maxWidth: '980px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '26px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontFamily: 'monospace', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '11px' }}>
                Pulsed
              </div>
              <div style={{ fontSize: '30px', fontWeight: 700, lineHeight: 1.1 }}>
                A trading journal that keeps your process alive.
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px', lineHeight: 1.6 }}>
                Track trades, replay performance, and build strategies you can actually improve.
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px', marginBottom: '22px' }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: '14px', background: 'var(--card-bg)', padding: '18px 18px 16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Get started</div>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '8px', lineHeight: 1.6 }}>
                Sign up to save your accounts, journal notes, and analytics. Log in anytime to see your latest performance.
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
                <Link
                  href="/auth?mode=signup"
                  style={{ background: 'var(--accent)', color: '#fff', borderRadius: '10px', padding: '10px 16px', textDecoration: 'none', fontFamily: 'monospace', fontSize: '13px', fontWeight: 600 }}
                >
                  Sign up
                </Link>
                <Link
                  href="/auth?mode=login"
                  style={{ background: 'var(--bg3)', color: 'var(--text)', borderRadius: '10px', padding: '10px 16px', textDecoration: 'none', fontFamily: 'monospace', fontSize: '13px', fontWeight: 600, border: '1px solid var(--border)' }}
                >
                  Log in
                </Link>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            {[
              { title: 'Trade replay', desc: 'See entries, exits, and candle-by-candle replay to learn fast.' },
              { title: 'Daily journal', desc: 'Capture notes and screenshots with constrained image sizing.' },
              { title: 'Backtest insights', desc: 'Analyze performance, streaks, and trade grades.' },
            ].map(card => (
              <div key={card.title} style={{ border: '1px solid var(--border)', borderRadius: '14px', background: 'var(--card-bg)', padding: '16px' }}>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text)', fontWeight: 700 }}>{card.title}</div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6 }}>{card.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning!' : hour < 18 ? 'Good afternoon!' : 'Good evening!'

  const wins = filtered.filter(t => t.status === 'Win')
  const losses = filtered.filter(t => t.status === 'Loss')
  const totalPnl = filtered.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0)
  const grossWin = wins.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0))
  const winRate = filtered.length ? ((wins.length / filtered.length) * 100).toFixed(1) : '0.0'
  const profitFactor = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : '∞'
  const avgWin = wins.length ? (grossWin / wins.length).toFixed(0) : '0'
  const avgLoss = losses.length ? (grossLoss / losses.length).toFixed(0) : '0'
  const avgRatio = parseFloat(avgLoss) > 0 ? (parseFloat(avgWin) / parseFloat(avgLoss)).toFixed(2) : '—'
  const todayTrades = filtered.filter(t => t.date?.slice(0, 10) === todayStr)
  const todayWins = todayTrades.filter(t => t.status === 'Win')
  const dayWinRate = todayTrades.length ? ((todayWins.length / todayTrades.length) * 100).toFixed(0) : '0'
  const pendingReviewCount = countTradesNeedingReview(filtered)

  const longTrades = filtered.filter(t => directionIsLong(t.direction))
  const shortTrades = filtered.filter(t => directionIsShort(t.direction))
  const longPnl = longTrades.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0)
  const shortPnl = shortTrades.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0)
  const otherDirCount = filtered.length - longTrades.length - shortTrades.length
  const chronoForStreak = [...filtered].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const { maxWin: maxWinStreak, maxLoss: maxLossStreak } = computeStreaks(chronoForStreak)
  const durationSamples = filtered.map(tradeDurationMinutes).filter((m) => m != null && Number.isFinite(m))
  const avgDurMins = durationSamples.length
    ? durationSamples.reduce((a, b) => a + b, 0) / durationSamples.length
    : null

  const pfNum = profitFactor === '∞' ? 3 : parseFloat(profitFactor) || 0
  const wrNum = parseFloat(winRate) || 0
  const arNum = avgRatio === '—' ? 0 : parseFloat(avgRatio) || 0
  /** Each axis 0–100: R:R and PF capped at 3 → full bar */
  const radarVals = [
    Math.min(Math.max(wrNum, 0), 100),
    Math.min(Math.max((arNum / 3) * 100, 0), 100),
    Math.min(Math.max((pfNum / 3) * 100, 0), 100),
  ]
  const pulsedScore = Math.round(radarVals.reduce((a, b) => a + b, 0) / radarVals.length)

  const selectedAcctObj = accounts.find(a => a.id === selectedAccount)
  const accountBalance = selectedAcctObj?.balance || 0
  const currentBalance = parseFloat(accountBalance) + totalPnl
  const selectedAccountTrades = selectedAccount === 'all'
    ? []
    : trades
      .filter(t => t.account_id === selectedAccount)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  let runningBalance = parseFloat(selectedAcctObj?.balance || 0)
  const accountBalanceSeries = selectedAccountTrades.map(t => {
    runningBalance += parseFloat(t.net_pnl || 0)
    return {
      date: t.date?.slice(0, 10) || '',
      balance: runningBalance,
    }
  })
  const balanceChartPoints = accountBalanceSeries.map(p => p.balance)
  const balW = 960
  const balH = 220
  const balPad = { left: 64, right: 8, top: 10, bottom: 26 }
  const balPlotW = balW - balPad.left - balPad.right
  const balPlotH = balH - balPad.top - balPad.bottom
  const balMin = balanceChartPoints.length ? Math.min(...balanceChartPoints) : 0
  const balMax = balanceChartPoints.length ? Math.max(...balanceChartPoints) : 0
  const balTicksY = buildLinearTicks(balMin, balMax, 5)
  const balTicksX = buildIndexTicks(accountBalanceSeries.length, 4)
  let balPath = ''
  let balArea = ''
  if (balanceChartPoints.length > 1) {
    const minV = Math.min(...balanceChartPoints)
    const maxV = Math.max(...balanceChartPoints)
    const range = maxV - minV || 1
    const coords = balanceChartPoints.map((v, i) => {
      const x = balPad.left + (i / (balanceChartPoints.length - 1)) * balPlotW
      const y = balPad.top + (1 - (v - minV) / range) * balPlotH
      return `${x},${y}`
    })
    balPath = 'M' + coords.join('L')
    balArea = `${balPath}L${balPad.left + balPlotW},${balPad.top + balPlotH}L${balPad.left},${balPad.top + balPlotH}Z`
  }

  // Daily PnL map
  const dailyMap = {}
  filtered.forEach(t => {
    const d = t.date?.slice(0, 10)
    if (!d) return
    if (!dailyMap[d]) dailyMap[d] = { pnl: 0, count: 0, trades: [] }
    dailyMap[d].pnl += parseFloat(t.net_pnl || 0)
    dailyMap[d].count++
    dailyMap[d].trades.push(t)
  })

  // Equity curve
  let cum = 0
  const eqSeries = filtered.map(t => {
    cum += parseFloat(t.net_pnl || 0)
    return {
      date: t.date?.slice(0, 10) || '',
      tradePnl: parseFloat(t.net_pnl || 0),
      cumPnl: cum,
    }
  })
  const eqPoints = eqSeries.map(p => p.cumPnl)
  const eqW = 640
  const eqH = 220
  const eqPad = { left: 14, right: 14, top: 10, bottom: 36 }
  const eqPlotW = eqW - eqPad.left - eqPad.right
  const eqPlotH = eqH - eqPad.top - eqPad.bottom
  const eqTicksX = buildIndexTicks(eqSeries.length, 6)
  const eqCoords = []
  let eqLinePath = ''
  let eqAreaPath = ''
  if (eqPoints.length > 1) {
    const minV = Math.min(0, ...eqPoints)
    const maxV = Math.max(0, ...eqPoints)
    const range = maxV - minV || 1
    eqPoints.forEach((v, i) => {
      const x = eqPad.left + (i / (eqPoints.length - 1)) * eqPlotW
      const y = eqPad.top + (1 - (v - minV) / range) * eqPlotH
      eqCoords.push({ x, y })
    })
    eqLinePath = pointsToSmoothPath(eqCoords)
    eqAreaPath = smoothAreaPath(eqCoords, eqPad.top + eqPlotH)
  }

  // Drawdown from cumulative equity
  let ddPeak = 0
  const ddSeries = eqSeries.map((p) => {
    ddPeak = Math.max(ddPeak, p.cumPnl)
    return { date: p.date, dd: p.cumPnl - ddPeak }
  })
  const ddPointsOnly = ddSeries.map((p) => p.dd)
  const ddMinVal = ddPointsOnly.length ? Math.min(0, ...ddPointsOnly) : 0
  const ddMaxVal = ddPointsOnly.length ? Math.max(0, ...ddPointsOnly) : 0
  const currentDrawdown = ddPointsOnly.length ? ddPointsOnly[ddPointsOnly.length - 1] : 0
  const ddW = 640
  const ddH = 200
  const ddPad = { left: 14, right: 14, top: 10, bottom: 36 }
  const ddPlotW = ddW - ddPad.left - ddPad.right
  const ddPlotH = ddH - ddPad.top - ddPad.bottom
  const ddCoords = []
  let ddLinePath = ''
  let ddAreaPath = ''
  if (ddPointsOnly.length > 1) {
    const range = ddMaxVal - ddMinVal || 1
    ddPointsOnly.forEach((v, i) => {
      const x = ddPad.left + (i / (ddPointsOnly.length - 1)) * ddPlotW
      const y = ddPad.top + (1 - (v - ddMinVal) / range) * ddPlotH
      ddCoords.push({ x, y })
    })
    ddLinePath = pointsToSmoothPath(ddCoords)
    ddAreaPath = smoothAreaPath(ddCoords, ddPad.top + ddPlotH)
  }
  const ddTicksX = buildIndexTicks(ddSeries.length, 6)

  // Sparkline: last N trade PnLs
  const sparkN = 24
  const sparkTrades = filtered.slice(-sparkN)
  const sparkPts = sparkTrades.map((t) => parseFloat(t.net_pnl || 0))
  const sparkPeriodPnl = sparkPts.reduce((a, b) => a + b, 0)
  const sparkW = 640
  const sparkH = 200
  const sparkPad = { left: 14, right: 14, top: 10, bottom: 34 }
  const sparkPlotW = sparkW - sparkPad.left - sparkPad.right
  const sparkPlotH = sparkH - sparkPad.top - sparkPad.bottom
  const sparkCoords = []
  let sparkLinePath = ''
  let sparkAreaPath = ''
  if (sparkPts.length > 1) {
    const smin = Math.min(0, ...sparkPts)
    const smax = Math.max(0, ...sparkPts)
    const sr = smax - smin || 1
    sparkPts.forEach((v, i) => {
      const x = sparkPad.left + (i / (sparkPts.length - 1)) * sparkPlotW
      const y = sparkPad.top + (1 - (v - smin) / sr) * sparkPlotH
      sparkCoords.push({ x, y })
    })
    sparkLinePath = pointsToSmoothPath(sparkCoords)
    sparkAreaPath = smoothAreaPath(sparkCoords, sparkPad.top + sparkPlotH)
  } else if (sparkPts.length === 1) {
    const v = sparkPts[0]
    const smin = Math.min(0, v)
    const smax = Math.max(0, v)
    const sr = smax - smin || 1
    const y = sparkPad.top + (1 - (v - smin) / sr) * sparkPlotH
    sparkCoords.push({ x: sparkPad.left, y }, { x: sparkPad.left + sparkPlotW, y })
    sparkLinePath = pointsToSmoothPath(sparkCoords)
    sparkAreaPath = smoothAreaPath(sparkCoords, sparkPad.top + sparkPlotH)
  }
  const sparkTicksX = buildIndexTicks(sparkTrades.length, 6)

  // Radar chart (3 axes, normalized 0–100)
  const radarLabels = ['Win %', 'R:R', 'Profit factor']
  const radarR = 52
  const radarCx = 70
  const radarCy = 70
  const radarAxis = (i, len) => {
    const ang = (-Math.PI / 2) + (i * 2 * Math.PI) / len
    return { x: radarCx + radarR * Math.cos(ang), y: radarCy + radarR * Math.sin(ang) }
  }
  const nAx = radarVals.length
  const radarPolyPts = radarVals.map((v, i) => {
    const t = v / 100
    const ang = (-Math.PI / 2) + (i * 2 * Math.PI) / nAx
    return { x: radarCx + radarR * t * Math.cos(ang), y: radarCy + radarR * t * Math.sin(ang) }
  })
  const radarPolyD = radarPolyPts.length
    ? 'M' + radarPolyPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L') + 'Z'
    : ''

  // Calendar
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Convert JS day index (Sun=0) to Monday-first offset (Mon=0, Sun=6)
  const firstDow = new Date(year, month, 1).getDay()
  const startOffset = firstDow === 0 ? 6 : firstDow - 1

  const allDays = []
  for (let i = 0; i < startOffset; i++) allDays.push(null)
  for (let d = 1; d <= daysInMonth; d++) allDays.push(d)
  while (allDays.length % 7 !== 0) allDays.push(null)

  const calWeeks = []
  for (let w = 0; w < allDays.length / 7; w++) {
    const days = allDays.slice(w * 7, w * 7 + 7)
    const weekdays = days.slice(0, 5) // Mon-Fri only
    let weekPnl = 0
    const weekTrades = []
    const cells = weekdays.map(day => {
      if (!day) return null
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const data = dailyMap[dateStr]
      if (data) {
        weekPnl += data.pnl
        weekTrades.push(...data.trades)
      }
      return { day, dateStr, data }
    })
    calWeeks.push({ cells, weekPnl, weekTrades })
  }

  const fmtPnl = (n) => {
    const num = parseFloat(n)
    return (num >= 0 ? '+$' : '-$') + Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const pnlColor = (n) => parseFloat(n) >= 0 ? '#22C55E' : '#EF4444'
  const greenLine = '#22C55E'
  const hoveredEq = hoveredEqIndex !== null ? eqSeries[hoveredEqIndex] : null
  const hoveredEqCoord = hoveredEqIndex !== null ? eqCoords[hoveredEqIndex] : null

  const hoveredDdDetail =
    hoveredDdIndex !== null &&
    hoveredDdIndex < ddSeries.length &&
    hoveredDdIndex < eqSeries.length
      ? {
          date: eqSeries[hoveredDdIndex]?.date,
          dd: ddSeries[hoveredDdIndex]?.dd,
          cumPnl: eqSeries[hoveredDdIndex]?.cumPnl,
        }
      : null
  const hoveredDdCoord = hoveredDdIndex !== null ? ddCoords[hoveredDdIndex] : null

  const hoveredSparkDetail =
    hoveredSparkIndex !== null &&
    hoveredSparkIndex < sparkTrades.length &&
    hoveredSparkIndex < sparkPts.length
      ? {
          date: sparkTrades[hoveredSparkIndex]?.date?.slice(0, 10),
          pnl: sparkPts[hoveredSparkIndex],
        }
      : null
  const hoveredSparkCoord = hoveredSparkIndex !== null ? sparkCoords[hoveredSparkIndex] : null

  // Day detail data
  const dayTrades = selectedDay ? (dailyMap[selectedDay]?.trades || []) : []
  const dayPnl = dayTrades.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0)
  const dayWins = dayTrades.filter(t => t.status === 'Win')
  const dayLosses = dayTrades.filter(t => t.status === 'Loss')
  const dayGross = dayTrades.reduce((s, t) => s + parseFloat(t.gross_pnl || 0), 0)
  const dayFees = dayTrades.reduce((s, t) => s + parseFloat(t.fees || 0), 0)
  const dayWR = dayTrades.length ? ((dayWins.length / dayTrades.length) * 100).toFixed(2) : '0.00'
  const dayGrossWin = dayWins.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0)
  const dayGrossLoss = Math.abs(dayLosses.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0))
  const dayPF = dayGrossLoss > 0 ? (dayGrossWin / dayGrossLoss).toFixed(2) : '—'

  // Day equity curve
  let dayCum = 0
  const dayEqPts = dayTrades.map(t => { dayCum += parseFloat(t.net_pnl || 0); return dayCum })
  const dEqW = 300, dEqH = 100
  let dayEqPath = '', dayEqArea = ''
  if (dayEqPts.length > 1) {
    const minV = Math.min(0, ...dayEqPts), maxV = Math.max(0, ...dayEqPts)
    const range = maxV - minV || 1
    const coords = dayEqPts.map((v, i) => {
      const x = (i / (dayEqPts.length - 1)) * dEqW
      const y = dEqH - ((v - minV) / range) * (dEqH - 10) - 5
      return `${x},${y}`
    })
    dayEqPath = 'M' + coords.join('L')
    dayEqArea = dayEqPath + `L${dEqW},${dEqH} L0,${dEqH} Z`
  }

  const existingNote = journalEntries.find(e => e.date === selectedDay)

  const pillBtn = (active) => ({
    padding: '7px 14px',
    borderRadius: '999px',
    border: `1px solid ${active ? accent : 'var(--border-md)'}`,
    background: active ? 'var(--accent-subtle)' : 'var(--bg3)',
    color: active ? accent : 'var(--text2)',
    fontFamily: 'monospace',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })

  const toolBtn = {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid var(--border-md)',
    background: 'var(--bg3)',
    color: 'var(--text2)',
    fontFamily: 'monospace',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)', color: 'var(--text)', fontFamily: 'sans-serif' }}>

      {/* Page header — TradeSync-style title row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
          padding: '18px 24px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--card-bg)',
        }}
      >
        <div>
          <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
            Pulsed
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', margin: 0, color: 'var(--text)' }}>Journaling Dashboard</h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: 'var(--text3)', fontWeight: 500 }}>
            {greeting}
            {dashUsername ? ` ${dashUsername}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '999px',
              background: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.35)',
              color: 'var(--green)',
              fontSize: '11px',
              fontFamily: 'monospace',
              fontWeight: 600,
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} />
            Session active
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            style={{
              ...toolBtn,
              width: '40px',
              height: '36px',
              padding: 0,
              justifyContent: 'center',
              borderRadius: '10px',
            }}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <Link href="/settings" style={{ ...toolBtn, borderRadius: '10px', padding: '8px 12px' }}>
            Settings
          </Link>
        </div>
      </div>

      {/* Filters + actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          flexWrap: 'wrap',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg2)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '4px' }}>Scope</span>
          {[
            { id: 'all', label: 'All trades' },
            { id: 'verified', label: 'Reviewed' },
            { id: 'needs_review', label: 'Needs review' },
          ].map((p) => (
            <button key={p.id} type="button" onClick={() => setJournalFilter(p.id)} style={pillBtn(journalFilter === p.id)}>
              {p.label}
            </button>
          ))}
          <span style={{ width: '1px', height: '20px', background: 'var(--border-md)', margin: '0 4px' }} />
          {[
            { id: 'all', label: 'All time' },
            { id: 'month', label: '30d' },
            { id: 'week', label: '7d' },
          ].map((p) => (
            <button key={p.id} type="button" onClick={() => setTimeRange(p.id)} style={pillBtn(timeRange === p.id)}>
              {p.label}
            </button>
          ))}
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            style={{
              marginLeft: '6px',
              maxWidth: '160px',
              background: 'var(--bg3)',
              border: '1px solid var(--border-md)',
              borderRadius: '999px',
              color: 'var(--text)',
              fontFamily: 'monospace',
              fontSize: '11px',
              padding: '6px 28px 6px 12px',
              cursor: 'pointer',
            }}
          >
            <option value="all">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
            style={{
              maxWidth: '150px',
              background: 'var(--bg3)',
              border: '1px solid var(--border-md)',
              borderRadius: '999px',
              color: 'var(--text)',
              fontFamily: 'monospace',
              fontSize: '11px',
              padding: '6px 28px 6px 12px',
              cursor: 'pointer',
            }}
          >
            <option value="all">All strategies</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <button type="button" onClick={() => exportTradesCsv(filtered)} style={toolBtn}>
            Export CSV
          </button>
          <Link href="/new-trade" style={toolBtn}>
            + Log trade
          </Link>
          <Link href="/settings/brokers" style={toolBtn}>
            Sync
          </Link>
          <Link
            href="/journal"
            style={{
              ...toolBtn,
              background: accent,
              color: '#fff',
              borderColor: accent,
            }}
          >
            + Journal
          </Link>
        </div>
      </div>

      <div style={{ padding: '20px 24px 32px', maxWidth: '1600px', margin: '0 auto' }}>

        {pendingReviewCount > 0 ? (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(245,158,11,0.45)',
              background: 'rgba(245,158,11,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text)' }}>
              <strong style={{ color: '#F59E0B' }}>{pendingReviewCount}</strong> trade{pendingReviewCount === 1 ? '' : 's'} left to review
              {selectedAccount !== 'all' ? ' (current account filter)' : ''}. Open a trade review and click <strong>Mark as reviewed</strong> when you are done.
            </span>
            <Link
              href="/trade-log"
              style={{
                fontSize: '12px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#fff',
                background: accent,
                padding: '8px 14px',
                borderRadius: '8px',
                textDecoration: 'none',
              }}
            >
              Open trade log
            </Link>
          </div>
        ) : filtered.length > 0 ? (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(34,197,94,0.4)',
              background: 'rgba(34,197,94,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text)' }}>
              <strong style={{ color: '#22C55E' }}>All trades reviewed</strong>
              {selectedAccount !== 'all' ? ' (current account filter)' : ''} — great work.
            </span>
            <Link
              href="/trade-log"
              style={{
                fontSize: '12px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: '#fff',
                background: accent,
                padding: '8px 14px',
                borderRadius: '8px',
                textDecoration: 'none',
              }}
            >
              Trade log
            </Link>
          </div>
        ) : null}

        {/* KPI strip — reference-style metric cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: accent }} />
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Net P&amp;L (filtered)</div>
            <div style={{ fontSize: '22px', fontFamily: 'monospace', fontWeight: 700, color: pnlColor(totalPnl) }}>{fmtPnl(totalPnl)}</div>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginTop: '6px' }}>{filtered.length} trades · {winRate}% win</div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Day win %</div>
            <div style={{ fontSize: '24px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>{dayWinRate}%</div>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginTop: '4px' }}>
              {todayWins.length}W – {todayTrades.length - todayWins.length}L today
            </div>
            <div style={{ marginTop: '10px', height: '6px', borderRadius: '4px', background: 'var(--bg3)', overflow: 'hidden', display: 'flex' }}>
              <div style={{ flex: Math.max(todayWins.length, 1), background: 'var(--green)', minWidth: todayWins.length ? '8px' : 0 }} />
              <div style={{ flex: Math.max(todayTrades.length - todayWins.length, 0.001), background: 'var(--loss)', minWidth: todayTrades.length > todayWins.length ? '8px' : 0 }} />
            </div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Avg win / loss</div>
            <div style={{ fontSize: '18px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>${avgWin}</div>
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', marginTop: '4px' }}>vs −${avgLoss} avg loss · ratio {avgRatio}</div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
              <div style={{ flex: 1, height: '4px', borderRadius: '3px', background: 'rgba(34,197,94,0.35)' }} />
              <div style={{ flex: 1, height: '4px', borderRadius: '3px', background: 'rgba(239,68,68,0.35)' }} />
            </div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Long vs short</div>
            <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: pnlColor(longPnl + shortPnl) }}>{fmtPnl(longPnl + shortPnl)}</div>
            <div style={{ fontSize: '11px', fontFamily: 'monospace', marginTop: '6px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ color: 'var(--green)' }}>L {fmtPnl(longPnl)}</span>
              <span style={{ color: 'var(--loss)' }}>S {fmtPnl(shortPnl)}</span>
            </div>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginTop: '6px' }}>
              {longTrades.length} long · {shortTrades.length} short
              {otherDirCount > 0 ? ` · ${otherDirCount} other / blank` : ''}
            </div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Max streaks</div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: '22px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--green)' }}>{maxWinStreak}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)' }}>wins</div>
              </div>
              <div>
                <div style={{ fontSize: '22px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--loss)' }}>{maxLossStreak}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)' }}>losses</div>
              </div>
            </div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Avg hold (time)</div>
            <div style={{ fontSize: '22px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>{formatDurationMins(avgDurMins)}</div>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginTop: '4px' }}>From entry/exit times when set</div>
          </div>
        </div>

        {/* Charts — radar + equity + drawdown + sparkline */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
            marginBottom: '16px',
          }}
        >
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', minHeight: '240px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>Pulsed score</div>
              <div style={{ fontSize: '18px', fontFamily: 'monospace', fontWeight: 700, color: accent }}>{pulsedScore}</div>
            </div>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginBottom: '10px', lineHeight: 1.4 }}>
              Win rate, risk/reward (avg win ÷ avg loss), and profit factor. R:R and PF are scored vs a 3× reference (heuristic).
            </div>
            <svg width="100%" height="200" viewBox="0 0 140 140" style={{ display: 'block', margin: '0 auto', maxWidth: '200px' }}>
              {[0.25, 0.5, 0.75, 1].map((t) => (
                <polygon
                  key={t}
                  fill="none"
                  stroke="var(--border-md)"
                  strokeWidth="0.6"
                  points={Array.from({ length: nAx }, (_, i) => {
                    const { x, y } = radarAxis(i, nAx)
                    const px = radarCx + (x - radarCx) * t
                    const py = radarCy + (y - radarCy) * t
                    return `${px.toFixed(1)},${py.toFixed(1)}`
                  }).join(' ')}
                />
              ))}
              {radarLabels.map((lbl, i) => {
                const { x, y } = radarAxis(i, nAx)
                const lx = radarCx + (x - radarCx) * 1.18
                const ly = radarCy + (y - radarCy) * 1.18
                return (
                  <text key={lbl} x={lx} y={ly} textAnchor="middle" fontSize="7" fill="var(--text3)" fontFamily="monospace">
                    {lbl}
                  </text>
                )
              })}
              <path d={radarPolyD} fill={`${accent}33`} stroke={accent} strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', minHeight: '280px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', fontFamily: 'system-ui, sans-serif', letterSpacing: '0.02em' }}>Daily cumulative P&amp;L</div>
                <div style={{ fontSize: '26px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: pnlColor(totalPnl), marginTop: '6px', lineHeight: 1.15 }}>{fmtPnl(totalPnl)}</div>
              </div>
              <MiniChartIcon />
            </div>
            {eqPoints.length > 1 ? (
              <div style={{ position: 'relative', width: '100%', aspectRatio: `${eqW} / ${eqH}`, minHeight: '160px' }}>
                {hoveredEq && (
                  <div style={{ position: 'absolute', top: '4px', left: '4px', zIndex: 3, pointerEvents: 'none', background: 'rgba(0,0,0,0.85)', border: '1px solid var(--border-md)', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)' }}>{hoveredEq.date || 'No date'}</div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: pnlColor(hoveredEq.tradePnl), marginTop: '2px' }}>Trade: {fmtPnl(hoveredEq.tradePnl)}</div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: pnlColor(hoveredEq.cumPnl) }}>Cum: {fmtPnl(hoveredEq.cumPnl)}</div>
                  </div>
                )}
                <svg
                  ref={eqSvgRef}
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${eqW} ${eqH}`}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ display: 'block' }}
                  onMouseMove={(e) => {
                    const loc = clientPointToSvgXY(eqSvgRef.current, e.clientX, e.clientY)
                    if (!loc) return
                    const ratio = (loc.x - eqPad.left) / Math.max(eqPlotW, 1)
                    const idx = Math.max(0, Math.min(eqSeries.length - 1, Math.round(ratio * (eqSeries.length - 1))))
                    setHoveredEqIndex(idx)
                  }}
                  onMouseLeave={() => setHoveredEqIndex(null)}
                >
                  <defs>
                    <linearGradient id="dash-eq-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={greenLine} stopOpacity="0.28" />
                      <stop offset="100%" stopColor={greenLine} stopOpacity="0.03" />
                    </linearGradient>
                  </defs>
                  <path d={eqAreaPath} fill="url(#dash-eq-fill)" />
                  <path d={eqLinePath} fill="none" stroke={greenLine} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                  {eqTicksX.map((idx) => {
                    const x = eqPad.left + (eqSeries.length > 1 ? (idx / (eqSeries.length - 1)) * eqPlotW : 0)
                    return (
                      <text key={`eq-x-${idx}`} x={x} y={eqPad.top + eqPlotH + 22} textAnchor="middle" fontSize="10" fill="var(--text3)" fontFamily="system-ui, sans-serif">
                        {formatDateTickShort(eqSeries[idx]?.date)}
                      </text>
                    )
                  })}
                  {hoveredEqCoord && (
                    <>
                      <line x1={hoveredEqCoord.x} y1={eqPad.top} x2={hoveredEqCoord.x} y2={eqPad.top + eqPlotH} stroke={greenLine} strokeOpacity="0.35" strokeDasharray="3 3" />
                      <circle cx={hoveredEqCoord.x} cy={hoveredEqCoord.y} r="4" fill={greenLine} stroke="var(--card-bg)" strokeWidth="1.5" />
                    </>
                  )}
                </svg>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', color: 'var(--text3)', fontSize: '12px', fontFamily: 'monospace' }}>Log trades to see equity curve</div>
            )}
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', minHeight: '200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', fontFamily: 'system-ui, sans-serif', letterSpacing: '0.02em' }}>Drawdown</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '26px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: pnlColor(currentDrawdown), lineHeight: 1.15 }}>{fmtPnl(currentDrawdown)}</span>
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text3)', fontFamily: 'system-ui, sans-serif' }}>current</span>
                </div>
              </div>
              <MiniChartIcon />
            </div>
            {ddLinePath ? (
              <div style={{ position: 'relative', width: '100%', aspectRatio: `${ddW} / ${ddH}`, minHeight: '150px' }}>
                {hoveredDdDetail && (
                  <div style={{ position: 'absolute', top: '4px', left: '4px', zIndex: 3, pointerEvents: 'none', background: 'rgba(0,0,0,0.85)', border: '1px solid var(--border-md)', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)' }}>{hoveredDdDetail.date || 'No date'}</div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: pnlColor(hoveredDdDetail.dd), marginTop: '2px' }}>Drawdown: {fmtPnl(hoveredDdDetail.dd)}</div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: pnlColor(hoveredDdDetail.cumPnl), marginTop: '2px' }}>Cumulative: {fmtPnl(hoveredDdDetail.cumPnl)}</div>
                  </div>
                )}
                <svg
                  ref={ddSvgRef}
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${ddW} ${ddH}`}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ display: 'block' }}
                  onMouseMove={(e) => {
                    const loc = clientPointToSvgXY(ddSvgRef.current, e.clientX, e.clientY)
                    if (!loc || ddSeries.length < 2) return
                    const ratio = (loc.x - ddPad.left) / Math.max(ddPlotW, 1)
                    const idx = Math.max(0, Math.min(ddSeries.length - 1, Math.round(ratio * (ddSeries.length - 1))))
                    setHoveredDdIndex(idx)
                  }}
                  onMouseLeave={() => setHoveredDdIndex(null)}
                >
                  <defs>
                    <linearGradient id="dash-dd-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#EF4444" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#EF4444" stopOpacity="0.04" />
                    </linearGradient>
                  </defs>
                  <path d={ddAreaPath} fill="url(#dash-dd-fill)" />
                  <path d={ddLinePath} fill="none" stroke="#EF4444" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                  {ddTicksX.map((idx) => {
                    const x = ddPad.left + (ddSeries.length > 1 ? (idx / (ddSeries.length - 1)) * ddPlotW : 0)
                    return (
                      <text key={`dd-x-${idx}`} x={x} y={ddPad.top + ddPlotH + 22} textAnchor="middle" fontSize="10" fill="var(--text3)" fontFamily="system-ui, sans-serif">
                        {formatDateTickShort(ddSeries[idx]?.date)}
                      </text>
                    )
                  })}
                  {hoveredDdCoord && (
                    <>
                      <line x1={hoveredDdCoord.x} y1={ddPad.top} x2={hoveredDdCoord.x} y2={ddPad.top + ddPlotH} stroke="#EF4444" strokeOpacity="0.4" strokeDasharray="3 3" />
                      <circle cx={hoveredDdCoord.x} cy={hoveredDdCoord.y} r="4" fill="#EF4444" stroke="var(--card-bg)" strokeWidth="1.5" />
                    </>
                  )}
                </svg>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', color: 'var(--text3)', fontSize: '12px', fontFamily: 'monospace' }}>Need 2+ trades</div>
            )}
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', minHeight: '200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)', fontFamily: 'system-ui, sans-serif', letterSpacing: '0.02em' }}>PNL</div>
                <div style={{ fontSize: '26px', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: pnlColor(sparkPeriodPnl), marginTop: '6px', lineHeight: 1.15 }}>{sparkPts.length ? fmtPnl(sparkPeriodPnl) : fmtPnl(0)}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'system-ui, sans-serif', marginTop: '4px' }}>Last {sparkPts.length} trades (filtered)</div>
              </div>
              <MiniChartIcon />
            </div>
            {sparkLinePath ? (
              <div style={{ position: 'relative', width: '100%', aspectRatio: `${sparkW} / ${sparkH}`, minHeight: '140px' }}>
                {hoveredSparkDetail && (
                  <div style={{ position: 'absolute', top: '4px', left: '4px', zIndex: 3, pointerEvents: 'none', background: 'rgba(0,0,0,0.85)', border: '1px solid var(--border-md)', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)' }}>{hoveredSparkDetail.date || 'No date'}</div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: pnlColor(hoveredSparkDetail.pnl), marginTop: '2px' }}>Trade: {fmtPnl(hoveredSparkDetail.pnl)}</div>
                  </div>
                )}
                <svg
                  ref={sparkSvgRef}
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${sparkW} ${sparkH}`}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ display: 'block' }}
                  onMouseMove={(e) => {
                    const loc = clientPointToSvgXY(sparkSvgRef.current, e.clientX, e.clientY)
                    if (!loc || sparkPts.length < 1) return
                    const ratio = (loc.x - sparkPad.left) / Math.max(sparkPlotW, 1)
                    const idx = Math.max(0, Math.min(sparkPts.length - 1, Math.round(ratio * (sparkPts.length - 1))))
                    setHoveredSparkIndex(idx)
                  }}
                  onMouseLeave={() => setHoveredSparkIndex(null)}
                >
                  <defs>
                    <linearGradient id="dash-spark-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={greenLine} stopOpacity="0.26" />
                      <stop offset="100%" stopColor={greenLine} stopOpacity="0.03" />
                    </linearGradient>
                  </defs>
                  <path d={sparkAreaPath} fill="url(#dash-spark-fill)" />
                  <path d={sparkLinePath} fill="none" stroke={greenLine} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                  {sparkTicksX.map((idx) => {
                    const x = sparkPad.left + (sparkTrades.length > 1 ? (idx / (sparkTrades.length - 1)) * sparkPlotW : 0)
                    return (
                      <text key={`sp-x-${idx}`} x={x} y={sparkPad.top + sparkPlotH + 22} textAnchor="middle" fontSize="10" fill="var(--text3)" fontFamily="system-ui, sans-serif">
                        {formatDateTickShort(sparkTrades[idx]?.date?.slice(0, 10))}
                      </text>
                    )
                  })}
                  {hoveredSparkCoord && (
                    <>
                      <line x1={hoveredSparkCoord.x} y1={sparkPad.top} x2={hoveredSparkCoord.x} y2={sparkPad.top + sparkPlotH} stroke={greenLine} strokeOpacity="0.35" strokeDasharray="3 3" />
                      <circle cx={hoveredSparkCoord.x} cy={hoveredSparkCoord.y} r="4" fill={greenLine} stroke="var(--card-bg)" strokeWidth="1.5" />
                    </>
                  )}
                </svg>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '72px', color: 'var(--text3)', fontSize: '12px', fontFamily: 'monospace' }}>No trades</div>
            )}
          </div>
        </div>

        {/* Calendar */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                  style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid var(--border-md)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                <button onClick={() => setCurrentDate(new Date())}
                  style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-md)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: '11px', fontFamily: 'monospace' }}>TODAY</button>
                <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                  style={{ width: '26px', height: '26px', borderRadius: '6px', border: '1px solid var(--border-md)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
                <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{monthNames[month]} {year}</span>
              </div>
            </div>

            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr) 120px', marginBottom: '6px' }}>
              {['Mo','Tu','We','Th','Fr'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', paddingBottom: '6px' }}>{d}</div>
              ))}
              <div style={{ textAlign: 'center', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', paddingBottom: '6px' }}>Total P&L</div>
            </div>

            {/* Calendar weeks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {calWeeks.map((week, wi) => (
                <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr) 120px', gap: '4px' }}>
                  {week.cells.map((cell, di) => {
                    const isToday = cell?.dateStr === todayStr
                    const isProfit = cell?.data && cell.data.pnl > 0
                    const isLoss = cell?.data && cell.data.pnl < 0
                    const hasJournal = cell && journalEntries.some(e => e.date === cell.dateStr)
                    return (
                      <div
                        key={di}
                        onClick={() => cell?.data && setSelectedDay(cell.dateStr)}
                        style={{
                          minHeight: '60px',
                          borderRadius: '8px',
                          padding: '6px 8px',
                          background: isToday ? `${accent}20` : isProfit ? 'rgba(34,197,94,0.08)' : isLoss ? 'rgba(239,68,68,0.08)' : 'var(--bg3)',
                          border: isToday ? `1.5px solid ${accent}` : '1px solid var(--border)',
                          opacity: 1,
                          cursor: cell?.data ? 'pointer' : 'default',
                          transition: 'all 0.15s',
                          position: 'relative',
                        }}
                        onMouseEnter={e => { if (cell?.data) e.currentTarget.style.borderColor = accent }}
                        onMouseLeave={e => { if (cell?.data && !isToday) e.currentTarget.style.borderColor = 'var(--border)' }}
                      >
                        {cell && (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ fontSize: '11px', fontFamily: 'monospace', color: isToday ? accent : 'var(--text3)', fontWeight: isToday ? '600' : '400' }}>{cell.day}</div>
                              {hasJournal && (
                                <div title="Has journal note" style={{ width: '6px', height: '6px', borderRadius: '50%', background: accent, flexShrink: 0 }}/>
                              )}
                            </div>
                            {cell.data && (
                              <>
                                <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: '700', color: isProfit ? '#22C55E' : '#EF4444', marginTop: '4px', lineHeight: 1 }}>
                                  {isProfit ? '+' : '-'}${Math.abs(cell.data.pnl).toFixed(0)}
                                </div>
                                <div style={{ fontSize: '9px', fontFamily: 'monospace', color: 'var(--text3)', marginTop: '2px' }}>{cell.data.count} trade{cell.data.count !== 1 ? 's' : ''}</div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                  <div
                    style={{
                      minHeight: '60px',
                      borderRadius: '8px',
                      padding: '6px 8px',
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '2px',
                    }}
                  >
                    <div style={{ fontSize: '9px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Week Total
                    </div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: '700', color: week.weekPnl > 0 ? '#22C55E' : week.weekPnl < 0 ? '#EF4444' : 'var(--text3)' }}>
                      {week.weekPnl === 0 ? '—' : fmtPnl(week.weekPnl)}
                    </div>
                    {week.weekTrades.length > 0 && (
                      <div style={{ fontSize: '9px', fontFamily: 'monospace', color: 'var(--text3)' }}>
                        {week.weekTrades.length} trade{week.weekTrades.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
        </div>

        {/* Account Balance */}
        <div style={{ marginTop: '16px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Account Balance</div>
              <div style={{ marginTop: '4px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)' }}>
                {selectedAccount === 'all' ? 'Select a specific account to view balance progression.' : `${selectedAcctObj?.name || 'Selected account'} balance over time`}
              </div>
            </div>
            {selectedAccount !== 'all' && (
              <div style={{ fontSize: '24px', fontFamily: 'monospace', fontWeight: '700', color: 'var(--text)' }}>
                ${currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            )}
          </div>

          {selectedAccount === 'all' ? (
            accounts.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                {accounts.map(a => {
                  const acctTrades = trades.filter(t => t.account_id === a.id)
                  const acctPnl = acctTrades.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0)
                  const bal = parseFloat(a.balance || 0) + acctPnl
                  return (
                    <div key={a.id} style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text)' }}>{a.name}</div>
                        <div style={{ fontSize: '9px', fontFamily: 'monospace', color: 'var(--text3)', background: 'var(--bg4)', padding: '2px 6px', borderRadius: '4px' }}>{a.type}</div>
                      </div>
                      <div style={{ fontSize: '15px', fontFamily: 'monospace', fontWeight: '600', color: 'var(--text)' }}>
                        ${bal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)', fontSize: '12px', fontFamily: 'monospace' }}>
                No accounts yet. <Link href="/settings" style={{ color: accent }}>Add one</Link>
              </div>
            )
          ) : accountBalanceSeries.length > 1 ? (
            <div>
              <svg width="100%" height="260" viewBox={`0 0 ${balW} ${balH}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="balg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={accent} stopOpacity="0.03" />
                  </linearGradient>
                </defs>
                <line x1={balPad.left} y1={balPad.top + balPlotH} x2={balPad.left + balPlotW} y2={balPad.top + balPlotH} stroke="var(--border-md)" strokeWidth="0.8" />
                <line x1={balPad.left} y1={balPad.top} x2={balPad.left} y2={balPad.top + balPlotH} stroke="var(--border-md)" strokeWidth="0.8" />
                {balTicksY.map((t, i) => {
                  const y = balPad.top + (1 - ((t - balMin) / (balMax - balMin || 1))) * balPlotH
                  return (
                    <g key={`bal-y-${i}`}>
                      <line x1={balPad.left} y1={y} x2={balPad.left + balPlotW} y2={y} stroke="var(--border)" strokeWidth="0.45" />
                      <text x={balPad.left - 7} y={y + 3} textAnchor="end" fontSize="9" fill="var(--text3)" fontFamily="monospace">
                        ${t.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </text>
                    </g>
                  )
                })}
                {balTicksX.map((idx) => {
                  const x = balPad.left + (accountBalanceSeries.length > 1 ? (idx / (accountBalanceSeries.length - 1)) * balPlotW : 0)
                  return (
                    <text key={`bal-x-${idx}`} x={x} y={balPad.top + balPlotH + 14} textAnchor="middle" fontSize="9" fill="var(--text3)" fontFamily="monospace">
                      {formatDateTick(accountBalanceSeries[idx]?.date)}
                    </text>
                  )
                })}
                <path d={balArea} fill="url(#balg)" />
                <path d={balPath} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{ marginTop: '10px', fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)' }}>
                Starting balance: ${parseFloat(selectedAcctObj?.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          ) : (
            <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text3)' }}>
              Add at least 2 trades on this account to render the balance chart.
            </div>
          )}
        </div>
      </div>

      {/* ── DAY DETAIL MODAL ── */}
      {selectedDay && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedDay(null) }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: '16px', width: '100%', maxWidth: '800px', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>
                  {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div style={{ fontSize: '15px', fontFamily: 'monospace', fontWeight: '600', color: pnlColor(dayPnl) }}>
                  Net P&L {fmtPnl(dayPnl)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    setNoteText(existingNote?.pre_market_notes || '')
                    setShowNote(true)
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border-md)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: '12px', fontFamily: 'monospace' }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M3.5 4.5h7M3.5 7h5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
                  {existingNote?.pre_market_notes ? 'View Note' : 'Add Note'}
                </button>
                <button onClick={() => setSelectedDay(null)}
                  style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border-md)', background: 'var(--bg3)', color: 'var(--text3)', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            </div>

            <div style={{ padding: '20px 24px' }}>

              {/* Day chart + stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '20px', marginBottom: '20px', alignItems: 'start' }}>

                {/* Mini equity curve */}
                <div>
                  {dayEqPts.length > 1 ? (
                    <svg width="100%" viewBox={`0 0 ${dEqW} ${dEqH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
                      <defs>
                        <linearGradient id="deqg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={dayPnl >= 0 ? '#22C55E' : '#EF4444'} stopOpacity="0.3"/>
                          <stop offset="100%" stopColor={dayPnl >= 0 ? '#22C55E' : '#EF4444'} stopOpacity="0.02"/>
                        </linearGradient>
                      </defs>
                      {/* Y axis labels */}
                      <text x="0" y="10" fontSize="8" fill="var(--text3)" fontFamily="monospace">${Math.max(...dayEqPts).toFixed(0)}</text>
                      <text x="0" y={dEqH} fontSize="8" fill="var(--text3)" fontFamily="monospace">$0.00</text>
                      <path d={dayEqArea} fill="url(#deqg)"/>
                      <path d={dayEqPath} fill="none" stroke={dayPnl >= 0 ? '#22C55E' : '#EF4444'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : dayEqPts.length === 1 ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--text3)' }}>1 trade</div>
                  ) : null}
                </div>

                {/* Stats grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  {[
                    { label: 'Total Trades', value: dayTrades.length },
                    { label: 'Winners', value: dayWins.length },
                    { label: 'Gross P&L', value: `$${dayGross.toFixed(2)}` },
                    { label: 'Winrate', value: dayWR + '%' },
                    { label: 'Losers', value: dayLosses.length },
                    { label: 'Commissions', value: `$${dayFees.toFixed(2)}` },
                  ].map((stat, i) => (
                    <div key={i} style={{ padding: '12px 16px', borderRight: i % 3 !== 2 ? '1px solid var(--border)' : 'none', borderBottom: i < 3 ? '1px solid var(--border)' : 'none', background: 'var(--bg3)' }}>
                      <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginBottom: '4px' }}>{stat.label}</div>
                      <div style={{ fontSize: '15px', fontFamily: 'monospace', fontWeight: '600', color: stat.label === 'Winners' ? '#22C55E' : stat.label === 'Losers' ? '#EF4444' : 'var(--text)' }}>{stat.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trades table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                <thead>
                  <tr style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--border-md)' }}>
                    {['Entry Time','Symbol','Direction','Contracts','Entry','Exit','Net P&L','Status','RR'].map(h => (
                      <th key={h} style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: '400', padding: '10px 12px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dayTrades.map((t, i) => {
                    const pnl = parseFloat(t.net_pnl || 0)
                    return (
                      <tr key={i} style={{ borderBottom: i < dayTrades.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '10px 12px' }}>{t.entry_time || '—'}</td>
                        <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text)', fontWeight: '600', padding: '10px 12px' }}>{t.symbol}</td>
                        <td style={{ fontSize: '12px', fontFamily: 'monospace', color: t.direction === 'Long' ? '#22C55E' : '#EF4444', padding: '10px 12px' }}>{t.direction}</td>
                        <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '10px 12px' }}>{t.contracts}</td>
                        <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '10px 12px' }}>{t.entry_price}</td>
                        <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '10px 12px' }}>{t.exit_price}</td>
                        <td style={{ fontSize: '12px', fontFamily: 'monospace', color: pnlColor(pnl), fontWeight: '600', padding: '10px 12px' }}>{fmtPnl(pnl)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: '10px', fontFamily: 'monospace', padding: '2px 8px', borderRadius: '4px', background: t.status === 'Win' ? 'rgba(34,197,94,0.1)' : t.status === 'Loss' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', color: t.status === 'Win' ? '#22C55E' : t.status === 'Loss' ? '#EF4444' : '#EAB308' }}>{t.status || '—'}</span>
                        </td>
                        <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '10px 12px' }}>{t.actual_rr ? t.actual_rr + 'R' : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                <button onClick={() => setSelectedDay(null)}
                  style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--border-md)', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                <Link href={`/journal?date=${selectedDay}`}
                  style={{ padding: '8px 20px', borderRadius: '8px', background: accent, color: '#fff', textDecoration: 'none', fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setSelectedDay(null)}>
                  View Details →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTE MODAL ── */}
      {showNote && selectedDay && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowNote(false) }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: '16px', width: '100%', maxWidth: '700px', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)' }}>
                  {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', color: pnlColor(dayPnl) }}>Net P&L {fmtPnl(dayPnl)}</div>
              </div>
              <button
                onClick={() => saveNote(selectedDay)}
                style={{ padding: '7px 18px', borderRadius: '8px', background: accent, color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                Save
              </button>
            </div>

            {/* Simple rich text toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
              {[
                { label: 'B', cmd: 'bold', style: { fontWeight: '700' } },
                { label: 'I', cmd: 'italic', style: { fontStyle: 'italic' } },
                { label: 'U', cmd: 'underline', style: { textDecoration: 'underline' } },
              ].map(btn => (
                <button key={btn.cmd}
                  onMouseDown={e => { e.preventDefault(); document.execCommand(btn.cmd) }}
                  style={{ width: '28px', height: '28px', borderRadius: '5px', border: '1px solid var(--border-md)', background: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', ...btn.style }}>
                  {btn.label}
                </button>
              ))}
              <div style={{ width: '1px', height: '20px', background: 'var(--border-md)', margin: '0 4px' }}/>
              {[
                { label: '≡', cmd: 'insertUnorderedList' },
                { label: '1.', cmd: 'insertOrderedList' },
              ].map(btn => (
                <button key={btn.cmd}
                  onMouseDown={e => { e.preventDefault(); document.execCommand(btn.cmd) }}
                  style={{ width: '28px', height: '28px', borderRadius: '5px', border: '1px solid var(--border-md)', background: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Editable note area */}
            <div style={{ padding: '16px 24px', minHeight: '300px' }}>
              <div
                ref={noteRef}
                contentEditable
                suppressContentEditableWarning
                onInput={e => setNoteText(e.currentTarget.innerHTML)}
                dangerouslySetInnerHTML={{ __html: existingNote?.pre_market_notes || '' }}
                style={{ minHeight: '260px', outline: 'none', fontSize: '14px', lineHeight: '1.7', color: 'var(--text)', fontFamily: 'sans-serif' }}
              />
            </div>

            {/* Note footer with day stats */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg3)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
                {[
                  { label: 'Total Trades', value: dayTrades.length },
                  { label: 'Winrate', value: dayWR + '%' },
                  { label: 'Gross P&L', value: `$${dayGross.toFixed(2)}` },
                  { label: 'Commissions', value: `$${dayFees.toFixed(2)}` },
                ].map((s, i) => (
                  <div key={i}>
                    <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginBottom: '3px' }}>{s.label}</div>
                    <div style={{ fontSize: '14px', fontFamily: 'monospace', fontWeight: '600', color: 'var(--text)' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}