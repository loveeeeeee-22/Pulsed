'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getAccountsForUser } from '@/lib/getAccountsForUser'
import { getTradesForUser } from '@/lib/getTradesForUser'
import { countTradesNeedingReview } from '@/lib/tradeReviewStatus'
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

export default function Dashboard() {
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
  const [hoveredBarIndex, setHoveredBarIndex] = useState(null)
  const [now, setNow] = useState(new Date())
  const [dashUsername, setDashUsername] = useState('')
  const noteRef = useRef(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [sessionUser, setSessionUser] = useState(null)

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
    const { data } = await supabase.from('journal_entries').select('*')
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
    const existing = journalEntries.find(e => e.date === dateStr)
    if (existing) {
      await supabase.from('journal_entries').update({ pre_market_notes: noteText }).eq('id', existing.id)
    } else {
      await supabase.from('journal_entries').insert({ date: dateStr, pre_market_notes: noteText })
    }
    await fetchJournalEntries()
    setShowNote(false)
  }

  const filtered = trades.filter(t =>
    selectedAccount === 'all' || t.account_id === selectedAccount
  )

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
  const eqMin = eqPoints.length ? Math.min(0, ...eqPoints) : 0
  const eqMax = eqPoints.length ? Math.max(0, ...eqPoints) : 0
  const eqW = 500, eqH = 180
  const eqPad = { left: 56, right: 8, top: 8, bottom: 24 }
  const eqPlotW = eqW - eqPad.left - eqPad.right
  const eqPlotH = eqH - eqPad.top - eqPad.bottom
  const eqTicksY = buildLinearTicks(eqMin, eqMax, 5)
  const eqTicksX = buildIndexTicks(eqSeries.length, 4)
  const eqCoords = []
  let eqPath = '', eqArea = ''
  if (eqPoints.length > 1) {
    const minV = Math.min(0, ...eqPoints), maxV = Math.max(0, ...eqPoints)
    const range = maxV - minV || 1
    const coords = eqPoints.map((v, i) => {
      const x = eqPad.left + (i / (eqPoints.length - 1)) * eqPlotW
      const y = eqPad.top + (1 - (v - minV) / range) * eqPlotH
      eqCoords.push({ x, y })
      return `${x},${y}`
    })
    eqPath = 'M' + coords.join('L')
    eqArea = eqPath + `L${eqPad.left + eqPlotW},${eqPad.top + eqPlotH} L${eqPad.left},${eqPad.top + eqPlotH} Z`
  }

  // Daily bars
  const dailyArr = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
  const barMax = Math.max(...dailyArr.map(([, v]) => Math.abs(v.pnl)), 1)
  const dailyTop = barMax
  const dailyBottom = -barMax
  const bW = 500, bH = 180
  const bPad = { left: 56, right: 8, top: 8, bottom: 24 }
  const bPlotW = bW - bPad.left - bPad.right
  const bPlotH = bH - bPad.top - bPad.bottom
  const bMidY = bPad.top + bPlotH / 2
  const dailyTicksX = buildIndexTicks(dailyArr.length, 4)
  const barW = dailyArr.length > 0 ? Math.min(Math.floor(bW / dailyArr.length) - 3, 28) : 20

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
  const fmtAxisCurrency = (n) => {
    const num = Number(n || 0)
    const abs = Math.abs(num)
    if (abs >= 1000) return `${num < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}k`
    return `${num < 0 ? '-' : ''}$${abs.toFixed(0)}`
  }
  const pnlColor = (n) => parseFloat(n) >= 0 ? '#22C55E' : '#EF4444'
  const hoveredEq = hoveredEqIndex !== null ? eqSeries[hoveredEqIndex] : null
  const hoveredEqCoord = hoveredEqIndex !== null ? eqCoords[hoveredEqIndex] : null
  const hoveredBar = hoveredBarIndex !== null ? dailyArr[hoveredBarIndex] : null

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

  function Donut({ pct, color, size = 56, stroke = 7 }) {
    const r = (size - stroke * 2) / 2
    const circ = 2 * Math.PI * r
    const dash = Math.min((pct / 100) * circ, circ)
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
          strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/>
      </svg>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)', color: 'var(--text)', fontFamily: 'sans-serif' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--card-bg)' }}>
        <div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dashboard</div>
          <div style={{ fontSize: '18px', fontWeight: '600' }}>
            {greeting}
            {dashUsername ? ` ${dashUsername}` : ''} 👋
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border-md)', borderRadius: '7px', color: 'var(--text)', fontFamily: 'monospace', fontSize: '12px', padding: '6px 24px 6px 10px', outline: 'none', cursor: 'pointer', appearance: 'none' }}>
            <option value="all">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <Link
            href="/new-trade"
            aria-label="Add trade"
            style={{
              background: accent,
              color: '#fff',
              borderRadius: '999px',
              width: '28px',
              height: '28px',
              padding: 0,
              fontSize: '18px',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            +
          </Link>
        </div>
      </div>

      <div style={{ padding: '20px 24px' }}>

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

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: accent }}/>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Net P&L</div>
            <div style={{ fontSize: '22px', fontFamily: 'monospace', fontWeight: '700', color: pnlColor(totalPnl) }}>{fmtPnl(totalPnl)}</div>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginTop: '4px' }}>{filtered.length} trades</div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Donut pct={parseFloat(winRate)} color={accent}/>
            <div>
              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Trade Win %</div>
              <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: '700', color: 'var(--text)' }}>{winRate}%</div>
              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)' }}>{wins.length}W · {losses.length}L</div>
            </div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Donut pct={Math.min(parseFloat(profitFactor === '∞' ? 3 : profitFactor) / 3 * 100, 100)} color={parseFloat(profitFactor) >= 1.5 ? '#22C55E' : parseFloat(profitFactor) >= 1 ? '#EAB308' : '#EF4444'}/>
            <div>
              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Profit Factor</div>
              <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: '700', color: 'var(--text)' }}>{profitFactor}</div>
              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)' }}>gross win ÷ loss</div>
            </div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Donut pct={parseFloat(dayWinRate)} color={accent}/>
            <div>
              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Day Win %</div>
              <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: '700', color: 'var(--text)' }}>{dayWinRate}%</div>
              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)' }}>{todayTrades.length} trades today</div>
            </div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Avg Win / Loss</div>
            <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: '700', color: 'var(--text)', marginBottom: '6px' }}>{avgRatio}</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <div style={{ flex: 1, background: 'rgba(34,197,94,0.1)', borderRadius: '4px', padding: '3px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#22C55E', fontWeight: '600' }}>${avgWin}</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(239,68,68,0.1)', borderRadius: '4px', padding: '3px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#EF4444', fontWeight: '600' }}>-${avgLoss}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', minHeight: '280px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>Daily Net Cumulative P&L</div>
              <div style={{ fontSize: '13px', fontFamily: 'monospace', fontWeight: '600', color: pnlColor(totalPnl) }}>{fmtPnl(totalPnl)}</div>
            </div>
            {eqPoints.length > 1 ? (
              <div style={{ position: 'relative' }}>
                {hoveredEq && (
                  <div style={{ position: 'absolute', top: '8px', left: '10px', zIndex: 3, pointerEvents: 'none', background: 'rgba(0,0,0,0.85)', border: '1px solid var(--border-md)', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)' }}>{hoveredEq.date || 'No date'}</div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: pnlColor(hoveredEq.tradePnl), marginTop: '2px' }}>Trade: {fmtPnl(hoveredEq.tradePnl)}</div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: pnlColor(hoveredEq.cumPnl) }}>Cum: {fmtPnl(hoveredEq.cumPnl)}</div>
                  </div>
                )}
                <svg
                  width="100%"
                  height="210"
                  viewBox={`0 0 ${eqW} ${eqH}`}
                  preserveAspectRatio="none"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const rawX = ((e.clientX - rect.left) / rect.width) * eqW
                    const ratio = (rawX - eqPad.left) / Math.max(eqPlotW, 1)
                    const idx = Math.max(0, Math.min(eqSeries.length - 1, Math.round(ratio * (eqSeries.length - 1))))
                    setHoveredEqIndex(idx)
                  }}
                  onMouseLeave={() => setHoveredEqIndex(null)}
                >
                  <defs>
                    <linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity="0.25"/>
                      <stop offset="100%" stopColor={accent} stopOpacity="0.02"/>
                    </linearGradient>
                  </defs>
                  <line x1={eqPad.left} y1={eqPad.top + eqPlotH} x2={eqPad.left + eqPlotW} y2={eqPad.top + eqPlotH} stroke="var(--border-md)" strokeWidth="0.8" />
                  <line x1={eqPad.left} y1={eqPad.top} x2={eqPad.left} y2={eqPad.top + eqPlotH} stroke="var(--border-md)" strokeWidth="0.8" />
                  {eqTicksY.map((t, i) => {
                    const y = eqPad.top + (1 - ((t - eqMin) / (eqMax - eqMin || 1))) * eqPlotH
                    return (
                      <g key={`eq-y-${i}`}>
                        <line x1={eqPad.left} y1={y} x2={eqPad.left + eqPlotW} y2={y} stroke="var(--border)" strokeWidth="0.5" />
                        <text x={eqPad.left - 6} y={y + 3} textAnchor="end" fontSize="8.5" fill="var(--text3)" fontFamily="monospace">{fmtAxisCurrency(t)}</text>
                      </g>
                    )
                  })}
                  {eqTicksX.map((idx) => {
                    const x = eqPad.left + (eqSeries.length > 1 ? (idx / (eqSeries.length - 1)) * eqPlotW : 0)
                    return (
                      <text key={`eq-x-${idx}`} x={x} y={eqPad.top + eqPlotH + 13} textAnchor="middle" fontSize="8.5" fill="var(--text3)" fontFamily="monospace">
                        {formatDateTick(eqSeries[idx]?.date)}
                      </text>
                    )
                  })}
                  <path d={eqArea} fill="url(#eqg)"/>
                  <path d={eqPath} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  {hoveredEqCoord && (
                    <>
                      <line x1={hoveredEqCoord.x} y1={eqPad.top} x2={hoveredEqCoord.x} y2={eqPad.top + eqPlotH} stroke={accent} strokeOpacity="0.35" strokeDasharray="3 3"/>
                      <circle cx={hoveredEqCoord.x} cy={hoveredEqCoord.y} r="4" fill={accent} stroke="white" strokeWidth="1.5"/>
                    </>
                  )}
                </svg>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', color: 'var(--text3)', fontSize: '12px', fontFamily: 'monospace' }}>Log trades to see equity curve</div>
            )}
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', minHeight: '280px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)', marginBottom: '12px' }}>Net Daily P&L</div>
            {dailyArr.length > 0 ? (
              <div style={{ position: 'relative' }}>
                {hoveredBar && (
                  <div style={{ position: 'absolute', top: '8px', left: '10px', zIndex: 3, pointerEvents: 'none', background: 'rgba(0,0,0,0.85)', border: '1px solid var(--border-md)', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)' }}>{hoveredBar[0]}</div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: pnlColor(hoveredBar[1].pnl), marginTop: '2px' }}>PnL: {fmtPnl(hoveredBar[1].pnl)}</div>
                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)' }}>{hoveredBar[1].count} trade{hoveredBar[1].count !== 1 ? 's' : ''}</div>
                  </div>
                )}
                <svg
                  width="100%"
                  height="210"
                  viewBox={`0 0 ${bW} ${bH}`}
                  preserveAspectRatio="none"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const rawX = ((e.clientX - rect.left) / rect.width) * bW
                    const ratio = (rawX - bPad.left) / Math.max(bPlotW, 1)
                    const idx = Math.max(0, Math.min(dailyArr.length - 1, Math.floor(ratio * dailyArr.length)))
                    setHoveredBarIndex(idx)
                  }}
                  onMouseLeave={() => setHoveredBarIndex(null)}
                >
                  <line x1={bPad.left} y1={bPad.top + bPlotH} x2={bPad.left + bPlotW} y2={bPad.top + bPlotH} stroke="var(--border-md)" strokeWidth="0.8"/>
                  <line x1={bPad.left} y1={bPad.top} x2={bPad.left} y2={bPad.top + bPlotH} stroke="var(--border-md)" strokeWidth="0.8"/>
                  <line x1={bPad.left} y1={bMidY} x2={bPad.left + bPlotW} y2={bMidY} stroke="var(--border)" strokeWidth="0.8"/>
                  <text x={bPad.left - 6} y={bPad.top + 3} textAnchor="end" fontSize="8.5" fill="var(--text3)" fontFamily="monospace">{fmtAxisCurrency(dailyTop)}</text>
                  <text x={bPad.left - 6} y={bMidY + 3} textAnchor="end" fontSize="8.5" fill="var(--text3)" fontFamily="monospace">$0</text>
                  <text x={bPad.left - 6} y={bPad.top + bPlotH + 3} textAnchor="end" fontSize="8.5" fill="var(--text3)" fontFamily="monospace">{fmtAxisCurrency(dailyBottom)}</text>
                  {dailyArr.map(([, val], i) => {
                    const slotW = bPlotW / Math.max(dailyArr.length, 1)
                    const x = bPad.left + i * slotW + (slotW - barW) / 2
                    const bh = Math.max((Math.abs(val.pnl) / barMax) * (bPlotH / 2 - 4), 2)
                    const isPos = val.pnl >= 0
                    return (
                      <rect
                        key={i}
                        x={x}
                        y={isPos ? bMidY - bh : bMidY}
                        width={barW}
                        height={bh}
                        rx="3"
                        fill={isPos ? '#22C55E' : '#EF4444'}
                        opacity={hoveredBarIndex === null || hoveredBarIndex === i ? 0.95 : 0.45}
                      />
                    )
                  })}
                  {dailyTicksX.map((idx) => {
                    const x = bPad.left + (dailyArr.length > 1 ? (idx / (dailyArr.length - 1)) * bPlotW : 0)
                    return (
                      <text key={`daily-x-${idx}`} x={x} y={bPad.top + bPlotH + 13} textAnchor="middle" fontSize="8.5" fill="var(--text3)" fontFamily="monospace">
                        {formatDateTick(dailyArr[idx]?.[0])}
                      </text>
                    )
                  })}
                </svg>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', color: 'var(--text3)', fontSize: '12px', fontFamily: 'monospace' }}>No data yet</div>
            )}
          </div>
        </div>

        {/* Calendar */}
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
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