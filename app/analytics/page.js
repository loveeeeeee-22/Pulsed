'use client'

import { useEffect, useMemo, useState } from 'react'
import { getAccountsForUser } from '@/lib/getAccountsForUser'
import { getTradesForUser } from '@/lib/getTradesForUser'

const PROFIT_COLOR = '#22C55E'
const LOSS_COLOR = '#EF4444'

const DATE_RANGES = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
]

const GROUPING_OPTIONS = ['day', 'week', 'month']

const METRICS = [
  { id: 'net_pnl', label: 'Net P&L', kind: 'currency' },
  { id: 'gross_pnl', label: 'Gross P&L', kind: 'currency' },
  { id: 'win_rate', label: 'Win Rate', kind: 'ratio' },
  { id: 'profit_factor', label: 'Profit Factor', kind: 'number' },
  { id: 'trade_count', label: 'Trade Count', kind: 'number' },
]

const SESSIONS = ['London', 'New York', 'Asian']

function asNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function fmtCurrency(v, withSign = true) {
  const n = asNum(v)
  const abs = Math.abs(n)
  const head = withSign ? (n >= 0 ? '+' : '-') : ''
  return `${head}$${abs.toFixed(2)}`
}

function fmtPercent(v, decimals = 1) {
  return `${(asNum(v) * 100).toFixed(decimals)}%`
}

function fmtDay(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fmtDayLong(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function rangeStart(rangeId) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (rangeId === 'all') return null
  if (rangeId === 'month') return new Date(today.getFullYear(), today.getMonth(), 1)
  if (rangeId === '7d') return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)
  if (rangeId === '30d') return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)
  if (rangeId === '90d') return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89)
  return null
}

function weekStart(dateObj) {
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate())
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function yTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0]
  if (Math.abs(max - min) < 1e-9) return [min]
  return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1))
}

function formatAxisValue(v, metricId) {
  const metric = METRICS.find(m => m.id === metricId)
  if (!metric) return String(v)
  if (metric.kind === 'currency') {
    const n = asNum(v)
    const abs = Math.abs(n)
    if (abs >= 1000) return `${n < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}k`
    return `${n < 0 ? '-' : ''}$${abs.toFixed(0)}`
  }
  if (metric.kind === 'ratio') return asNum(v).toFixed(2)
  return asNum(v).toFixed(1)
}

function calcMetric(bucket, metricId) {
  if (metricId === 'net_pnl') return bucket.net
  if (metricId === 'gross_pnl') return bucket.gross
  if (metricId === 'win_rate') return bucket.trades ? bucket.wins / bucket.trades : 0
  if (metricId === 'profit_factor') {
    const grossLoss = Math.abs(bucket.lossGross)
    if (grossLoss <= 0) return bucket.winGross > 0 ? bucket.winGross : 0
    return bucket.winGross / grossLoss
  }
  if (metricId === 'trade_count') return bucket.trades
  return 0
}

function buildInsightOverall(stats) {
  const { totalPnl, expectancy, profitFactor, winRate } = stats
  if (totalPnl > 0 && expectancy > 0 && profitFactor >= 1) {
    return 'Your trading results show a solid profit with consistent trade expectancy.'
  }
  if (totalPnl < 0 && expectancy < 0) {
    return 'Results are currently under pressure; tightening risk and improving setup quality could help.'
  }
  if (winRate >= 0.5) {
    return 'You are maintaining a healthy win rate, but average outcome per trade can still improve.'
  }
  return 'Performance is mixed; focus on execution consistency to stabilize outcomes.'
}

function buildInsightOutcomes(stats) {
  const { wins, losses, maxWinStreak, maxLossStreak, largestProfit, largestLoss } = stats
  if (wins > losses && maxWinStreak >= maxLossStreak) {
    return 'Winning pressure is stronger than losing pressure, with favorable streak behavior.'
  }
  if (losses > wins && Math.abs(largestLoss) > Math.abs(largestProfit)) {
    return 'Losses are dominating outcomes; consider tighter stop discipline and position sizing.'
  }
  return 'Outcome distribution is balanced, so consistency in risk management is the key edge.'
}

function buildInsightActivity(stats) {
  const { tradingDays, loggedDays, bestSession, bestSymbol } = stats
  if (tradingDays > 0 && loggedDays / tradingDays >= 0.8) {
    return `Great logging consistency. ${bestSession} session and ${bestSymbol} are currently your strongest contributors.`
  }
  if (tradingDays > 0 && loggedDays / tradingDays < 0.5) {
    return 'Journaling coverage is low; logging more sessions should reveal clearer performance patterns.'
  }
  return `Activity data suggests your edge is concentrating around ${bestSession} and ${bestSymbol}.`
}

export default function AnalyticsPage() {
  const [trades, setTrades] = useState([])
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('all')
  const [selectedRange, setSelectedRange] = useState('30d')
  const [grouping, setGrouping] = useState('day')
  const [leftMetric, setLeftMetric] = useState('net_pnl')
  const [rightMetric, setRightMetric] = useState('win_rate')
  const [chartType, setChartType] = useState('line')
  const [loading, setLoading] = useState(true)
  const [accent, setAccent] = useState('#7C3AED')

  useEffect(() => {
    const lsAccent = typeof window !== 'undefined' ? window.localStorage.getItem('accentColor') : null
    setAccent(lsAccent || '#7C3AED')
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [accountRows, tradeRows] = await Promise.all([getAccountsForUser(), getTradesForUser({ orderAscending: true })])
      setAccounts(accountRows || [])
      setTrades(tradeRows || [])
      setLoading(false)
    }
    load()
  }, [])

  const filteredTrades = useMemo(() => {
    const start = rangeStart(selectedRange)
    return trades
      .filter(t => selectedAccount === 'all' || t.account_id === selectedAccount)
      .filter(t => {
        if (!start) return true
        const d = new Date(`${String(t.date || '').slice(0, 10)}T00:00:00`)
        if (Number.isNaN(d.getTime())) return false
        return d >= start
      })
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  }, [trades, selectedAccount, selectedRange])

  const grouped = useMemo(() => {
    const map = {}
    for (const t of filteredTrades) {
      const d = new Date(`${String(t.date || '').slice(0, 10)}T00:00:00`)
      if (Number.isNaN(d.getTime())) continue
      let key = ''
      let label = ''
      if (grouping === 'day') {
        key = String(t.date || '').slice(0, 10)
        label = fmtDay(key)
      } else if (grouping === 'week') {
        const ws = weekStart(d)
        key = ws.toISOString().slice(0, 10)
        label = `Wk ${ws.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        label = d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      }
      if (!map[key]) {
        map[key] = {
          key,
          label,
          net: 0,
          gross: 0,
          trades: 0,
          wins: 0,
          losses: 0,
          winGross: 0,
          lossGross: 0,
          startDate: key,
        }
      }
      const net = asNum(t.net_pnl)
      const gross = asNum(t.gross_pnl)
      map[key].net += net
      map[key].gross += gross
      map[key].trades += 1
      if (t.status === 'Win') {
        map[key].wins += 1
        map[key].winGross += Math.max(0, gross)
      }
      if (t.status === 'Loss') {
        map[key].losses += 1
        map[key].lossGross += Math.min(0, gross)
      }
    }
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
  }, [filteredTrades, grouping])

  const chartRows = useMemo(() => {
    return grouped.map(row => ({
      ...row,
      leftValue: calcMetric(row, leftMetric),
      rightValue: rightMetric ? calcMetric(row, rightMetric) : null,
    }))
  }, [grouped, leftMetric, rightMetric])

  const chartRanges = useMemo(() => {
    const leftVals = chartRows.map(r => asNum(r.leftValue))
    const rightVals = rightMetric ? chartRows.map(r => asNum(r.rightValue)) : []
    const lMin = Math.min(0, ...leftVals, 0)
    const lMax = Math.max(0, ...leftVals, 1)
    const rMin = rightMetric ? Math.min(...rightVals, 0) : 0
    const rMax = rightMetric ? Math.max(...rightVals, 1) : 1
    return {
      leftMin: lMin,
      leftMax: lMax,
      rightMin: rMin,
      rightMax: rMax,
      leftRange: lMax - lMin || 1,
      rightRange: rMax - rMin || 1,
    }
  }, [chartRows, rightMetric])

  const overallStats = useMemo(() => {
    const totalTrades = filteredTrades.length
    const totalPnl = filteredTrades.reduce((s, t) => s + asNum(t.net_pnl), 0)
    const wins = filteredTrades.filter(t => t.status === 'Win')
    const losses = filteredTrades.filter(t => t.status === 'Loss')
    const grossWin = wins.reduce((s, t) => s + Math.max(0, asNum(t.gross_pnl)), 0)
    const grossLoss = Math.abs(losses.reduce((s, t) => s + Math.min(0, asNum(t.gross_pnl)), 0))
    const winRate = totalTrades ? wins.length / totalTrades : 0
    const expectancy = totalTrades ? totalPnl / totalTrades : 0
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0

    return {
      totalPnl,
      totalTrades,
      averageTradePnl: expectancy,
      expectancy,
      profitFactor,
      winRate,
      insight: buildInsightOverall({ totalPnl, expectancy, profitFactor, winRate }),
    }
  }, [filteredTrades])

  const outcomeStats = useMemo(() => {
    let largestProfit = 0
    let largestLoss = 0
    let wins = 0
    let losses = 0
    let breakeven = 0
    let curWin = 0
    let curLoss = 0
    let maxWinStreak = 0
    let maxLossStreak = 0

    for (const t of filteredTrades) {
      const pnl = asNum(t.net_pnl)
      if (pnl > largestProfit) largestProfit = pnl
      if (pnl < largestLoss) largestLoss = pnl
      if (t.status === 'Win') {
        wins += 1
        curWin += 1
        curLoss = 0
        maxWinStreak = Math.max(maxWinStreak, curWin)
      } else if (t.status === 'Loss') {
        losses += 1
        curLoss += 1
        curWin = 0
        maxLossStreak = Math.max(maxLossStreak, curLoss)
      } else {
        breakeven += 1
        curWin = 0
        curLoss = 0
      }
    }
    return {
      wins,
      losses,
      breakeven,
      largestProfit,
      largestLoss,
      maxWinStreak,
      maxLossStreak,
      insight: buildInsightOutcomes({ wins, losses, maxWinStreak, maxLossStreak, largestProfit, largestLoss }),
    }
  }, [filteredTrades])

  const activityStats = useMemo(() => {
    const dayMap = {}
    const sessionMap = { London: { pnl: 0, trades: 0 }, 'New York': { pnl: 0, trades: 0 }, Asian: { pnl: 0, trades: 0 } }
    const symbolMap = {}
    const loggedDaysSet = new Set()
    let totalContracts = 0

    for (const t of filteredTrades) {
      const date = String(t.date || '').slice(0, 10)
      if (!date) continue
      const pnl = asNum(t.net_pnl)
      totalContracts += asNum(t.contracts)
      loggedDaysSet.add(date)
      dayMap[date] = (dayMap[date] || 0) + pnl
      if (sessionMap[t.session]) {
        sessionMap[t.session].pnl += pnl
        sessionMap[t.session].trades += 1
      }
      const sym = t.symbol || '—'
      symbolMap[sym] = (symbolMap[sym] || 0) + pnl
    }

    const dayPnls = Object.entries(dayMap)
    const tradingDays = dayPnls.length
    const avgDailyVolume = tradingDays ? totalContracts / tradingDays : 0
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    let bestDay = '—'
    let bestDayPnl = -Infinity
    for (const [date, pnl] of dayPnls) {
      if (pnl > bestDayPnl) {
        bestDayPnl = pnl
        const wd = new Date(`${date}T12:00:00`).getDay()
        bestDay = weekdays[wd] || '—'
      }
    }

    let bestSession = '—'
    let bestSessionPnl = -Infinity
    for (const [name, s] of Object.entries(sessionMap)) {
      if (s.pnl > bestSessionPnl) {
        bestSessionPnl = s.pnl
        bestSession = name
      }
    }

    let bestSymbol = '—'
    let bestSymbolPnl = -Infinity
    for (const [sym, pnl] of Object.entries(symbolMap)) {
      if (pnl > bestSymbolPnl) {
        bestSymbolPnl = pnl
        bestSymbol = sym
      }
    }

    return {
      avgDailyVolume,
      tradingDays,
      loggedDays: loggedDaysSet.size,
      bestDay,
      bestSession,
      bestSymbol,
      insight: buildInsightActivity({
        tradingDays,
        loggedDays: loggedDaysSet.size,
        bestSession,
        bestSymbol,
      }),
    }
  }, [filteredTrades])

  const symbolRows = useMemo(() => {
    const map = {}
    for (const t of filteredTrades) {
      const sym = t.symbol || '—'
      if (!map[sym]) {
        map[sym] = { symbol: sym, trades: 0, wins: 0, net: 0, best: -Infinity, worst: Infinity }
      }
      const pnl = asNum(t.net_pnl)
      map[sym].trades += 1
      if (t.status === 'Win') map[sym].wins += 1
      map[sym].net += pnl
      map[sym].best = Math.max(map[sym].best, pnl)
      map[sym].worst = Math.min(map[sym].worst, pnl)
    }
    return Object.values(map)
      .map(r => ({
        ...r,
        winRate: r.trades ? r.wins / r.trades : 0,
        avg: r.trades ? r.net / r.trades : 0,
        best: Number.isFinite(r.best) ? r.best : 0,
        worst: Number.isFinite(r.worst) ? r.worst : 0,
      }))
      .sort((a, b) => b.net - a.net)
  }, [filteredTrades])

  const sessionRows = useMemo(() => {
    const rows = SESSIONS.map(name => {
      const list = filteredTrades.filter(t => t.session === name)
      const tradesCount = list.length
      const wins = list.filter(t => t.status === 'Win').length
      const net = list.reduce((s, t) => s + asNum(t.net_pnl), 0)
      return {
        name,
        trades: tradesCount,
        winRate: tradesCount ? wins / tradesCount : 0,
        net,
      }
    })
    const maxAbs = Math.max(...rows.map(r => Math.abs(r.net)), 1)
    return rows.map(r => ({ ...r, pct: (Math.abs(r.net) / maxAbs) * 100 }))
  }, [filteredTrades])

  // PRO: R-Multiple distribution
  const rMultipleData = useMemo(() => {
    const bins = [
      { label: '<-3R', min: -Infinity, max: -3, color: '#EF4444' },
      { label: '-3R',  min: -3, max: -2, color: '#EF4444' },
      { label: '-2R',  min: -2, max: -1, color: '#F87171' },
      { label: '-1R',  min: -1, max: -0.001, color: '#FCA5A5' },
      { label: '0R',   min: -0.001, max: 0.5, color: 'var(--text3)' },
      { label: '+1R',  min: 0.5, max: 1.5, color: '#86EFAC' },
      { label: '+2R',  min: 1.5, max: 2.5, color: '#4ADE80' },
      { label: '+3R',  min: 2.5, max: 3.5, color: '#22C55E' },
      { label: '>+3R', min: 3.5, max: Infinity, color: '#16A34A' },
    ]
    const counts = bins.map(b => ({
      ...b,
      count: filteredTrades.filter(t => {
        const r = asNum(t.actual_rr)
        return r > b.min && r <= b.max
      }).length
    }))
    const maxCount = Math.max(...counts.map(c => c.count), 1)
    return { bins: counts, maxCount, total: filteredTrades.filter(t => t.actual_rr != null).length }
  }, [filteredTrades])

  // PRO: Underwater Equity Curve (drawdown)
  const drawdownData = useMemo(() => {
    const sorted = [...filteredTrades].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
    if (!sorted.length) return { points: [], maxDrawdown: 0, currentDrawdown: 0 }
    let running = 0
    let peak = 0
    const points = sorted.map(t => {
      running += asNum(t.net_pnl)
      if (running > peak) peak = running
      const dd = peak > 0 ? ((running - peak) / peak) * 100 : 0
      return { date: String(t.date || '').slice(0, 10), cumPnl: running, peak, drawdown: dd }
    })
    const maxDrawdown = Math.min(...points.map(p => p.drawdown), 0)
    const currentDrawdown = points[points.length - 1]?.drawdown ?? 0
    return { points, maxDrawdown, currentDrawdown }
  }, [filteredTrades])

  // PRO: MAE/MFE scatter
  const maeMfeData = useMemo(() => {
    const pts = filteredTrades.filter(t => t.mae != null && t.mfe != null).map(t => ({
      mae: asNum(t.mae),
      mfe: asNum(t.mfe),
      status: t.status,
      symbol: t.symbol,
      pnl: asNum(t.net_pnl),
    }))
    return pts
  }, [filteredTrades])

  function exportCsv() {
    const rows = filteredTrades
    const headers = [
      'id',
      'account_id',
      'date',
      'symbol',
      'session',
      'direction',
      'contracts',
      'gross_pnl',
      'fees',
      'net_pnl',
      'entry_price',
      'exit_price',
      'entry_time',
      'exit_time',
      'status',
      'actual_rr',
      'trade_grade',
      'created_at',
    ]
    const csv = [
      headers.join(','),
      ...rows.map(r =>
        headers
          .map(h => {
            const v = r[h] ?? ''
            const s = String(v).replaceAll('"', '""')
            return `"${s}"`
          })
          .join(',')
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pulsed-reports-${selectedRange}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const dateRangeLabel = DATE_RANGES.find(r => r.id === selectedRange)?.label || 'Last 30 days'
  const leftColor = accent
  const rightColor = PROFIT_COLOR

  const chartW = 1000
  const chartH = 360
  const pad = { top: 24, left: 70, right: 72, bottom: 48 }
  const plotW = chartW - pad.left - pad.right
  const plotH = chartH - pad.top - pad.bottom

  function xAt(i, total) {
    if (total <= 1) return pad.left + plotW / 2
    return pad.left + (i / (total - 1)) * plotW
  }
  function yLeft(v) {
    return pad.top + (1 - (asNum(v) - chartRanges.leftMin) / chartRanges.leftRange) * plotH
  }
  function yRight(v) {
    return pad.top + (1 - (asNum(v) - chartRanges.rightMin) / chartRanges.rightRange) * plotH
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--page-bg)',
        color: 'var(--text)',
        padding: '22px 24px 28px',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
        <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 650, letterSpacing: '-0.02em', flex: '1 1 auto' }}>Reports</h1>

        <div style={{ flex: '0 1 320px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '9px', color: 'var(--text3)', fontSize: '14px' }}>📅</span>
          <select
            value={selectedRange}
            onChange={e => setSelectedRange(e.target.value)}
            style={{
              width: '100%',
              appearance: 'none',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--card-bg)',
              color: 'var(--text)',
              fontSize: '13px',
              padding: '9px 34px 9px 34px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {DATE_RANGES.map(r => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <span style={{ position: 'absolute', right: '10px', top: '8px', color: 'var(--text3)' }}>▾</span>
        </div>

        <select
          value={selectedAccount}
          onChange={e => setSelectedAccount(e.target.value)}
          style={{
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
            color: 'var(--text)',
            fontSize: '13px',
            padding: '9px 12px',
            outline: 'none',
            cursor: 'pointer',
            minWidth: '170px',
          }}
        >
          <option value="all">All Accounts</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={exportCsv}
          style={{
            borderRadius: '10px',
            border: '1px solid var(--border)',
            background: 'var(--card-bg)',
            color: 'var(--text)',
            fontSize: '13px',
            fontWeight: 600,
            padding: '9px 14px',
            cursor: 'pointer',
          }}
        >
          Export CSV
        </button>
      </div>

      <div
        style={{
          border: '1px solid var(--border)',
          background: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '10px 14px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text2)', fontSize: '13px' }}>
          <strong style={{ color: 'var(--text)' }}>Summary</strong>
          <span>▾</span>
          <span>
            report for <strong style={{ color: 'var(--text)' }}>{dateRangeLabel}</strong>
          </span>
        </div>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          {GROUPING_OPTIONS.map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setGrouping(g)}
              style={{
                border: 'none',
                borderRight: g !== 'month' ? '1px solid var(--border)' : 'none',
                background: grouping === g ? 'rgba(124,58,237,0.12)' : 'var(--card-bg)',
                color: grouping === g ? accent : 'var(--text2)',
                fontSize: '12px',
                fontWeight: 600,
                padding: '7px 14px',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          border: '1px solid var(--border)',
          background: 'var(--card-bg)',
          borderRadius: '14px',
          padding: '14px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select value={leftMetric} onChange={e => setLeftMetric(e.target.value)} style={metricSelectStyle}>
              {METRICS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            {rightMetric ? (
              <select value={rightMetric} onChange={e => setRightMetric(e.target.value)} style={metricSelectStyle}>
                {METRICS.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            ) : (
              <button type="button" onClick={() => setRightMetric('win_rate')} style={metricButtonStyle}>
                Add Metric
              </button>
            )}
            {rightMetric ? (
              <button type="button" onClick={() => setRightMetric(null)} style={metricButtonStyle}>
                Clear
              </button>
            ) : null}
          </div>

          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setChartType('line')}
              style={{
                ...iconToggleStyle,
                background: chartType === 'line' ? 'rgba(124,58,237,0.12)' : 'var(--card-bg)',
                color: chartType === 'line' ? accent : 'var(--text2)',
              }}
              title="Line chart"
            >
              ╱╲
            </button>
            <button
              type="button"
              onClick={() => setChartType('bar')}
              style={{
                ...iconToggleStyle,
                borderLeft: '1px solid var(--border)',
                background: chartType === 'bar' ? 'rgba(124,58,237,0.12)' : 'var(--card-bg)',
                color: chartType === 'bar' ? accent : 'var(--text2)',
              }}
              title="Bar chart"
            >
              ▮▮
            </button>
          </div>
        </div>

        <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
          {yTicks(chartRanges.leftMin, chartRanges.leftMax, 5).map((tick, i) => {
            const y = yLeft(tick)
            return (
              <g key={`l-${i}`}>
                <line x1={pad.left} y1={y} x2={pad.left + plotW} y2={y} stroke="var(--border)" strokeWidth="1" />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--text3)">
                  {formatAxisValue(tick, leftMetric)}
                </text>
              </g>
            )
          })}

          {rightMetric
            ? yTicks(chartRanges.rightMin, chartRanges.rightMax, 5).map((tick, i) => {
                const y = yRight(tick)
                return (
                  <text key={`r-${i}`} x={pad.left + plotW + 8} y={y + 4} textAnchor="start" fontSize="10" fill="var(--text3)">
                    {formatAxisValue(tick, rightMetric)}
                  </text>
                )
              })
            : null}

          {leftMetric === 'net_pnl' ? (
            <line
              x1={pad.left}
              x2={pad.left + plotW}
              y1={yLeft(0)}
              y2={yLeft(0)}
              stroke="var(--text3)"
              strokeWidth="1"
              strokeDasharray="5 5"
            />
          ) : null}

          {chartRows.length > 0
            ? chartRows.map((row, i) => {
                const x = xAt(i, chartRows.length)
                if (chartType === 'bar') {
                  const base = yLeft(0)
                  const y = yLeft(row.leftValue)
                  const barW = Math.max(10, Math.min(28, plotW / Math.max(1, chartRows.length * 1.8)))
                  return (
                    <rect
                      key={`bar-l-${row.key}`}
                      x={x - barW / 2}
                      y={Math.min(y, base)}
                      width={barW}
                      height={Math.max(1, Math.abs(base - y))}
                      fill={leftColor}
                      opacity="0.78"
                      rx="4"
                    />
                  )
                }
                if (i === 0) return null
                const prev = chartRows[i - 1]
                return (
                  <line
                    key={`line-l-${row.key}`}
                    x1={xAt(i - 1, chartRows.length)}
                    y1={yLeft(prev.leftValue)}
                    x2={x}
                    y2={yLeft(row.leftValue)}
                    stroke={leftColor}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                )
              })
            : null}

          {rightMetric
            ? chartRows.map((row, i) => {
                const x = xAt(i, chartRows.length)
                if (chartType === 'bar') {
                  const base = yRight(0)
                  const y = yRight(row.rightValue)
                  const barW = Math.max(8, Math.min(20, plotW / Math.max(1, chartRows.length * 2.4)))
                  return (
                    <rect
                      key={`bar-r-${row.key}`}
                      x={x + 6}
                      y={Math.min(y, base)}
                      width={barW}
                      height={Math.max(1, Math.abs(base - y))}
                      fill={rightColor}
                      opacity="0.7"
                      rx="3"
                    />
                  )
                }
                if (i === 0) return null
                const prev = chartRows[i - 1]
                return (
                  <line
                    key={`line-r-${row.key}`}
                    x1={xAt(i - 1, chartRows.length)}
                    y1={yRight(prev.rightValue)}
                    x2={x}
                    y2={yRight(row.rightValue)}
                    stroke={rightColor}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                )
              })
            : null}

          {chartRows.map((row, i) => {
            const x = xAt(i, chartRows.length)
            return (
              <text key={`x-${row.key}`} x={x} y={chartH - 16} textAnchor="middle" fontSize="10" fill="var(--text3)">
                {row.label}
              </text>
            )
          })}
        </svg>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <SummaryCard
          title="Overall Performance"
          borderColor={accent}
          items={[
            ['Total P&L', fmtCurrency(overallStats.totalPnl)],
            ['Total Number of Trades', overallStats.totalTrades],
            ['Average Trade P&L', fmtCurrency(overallStats.averageTradePnl)],
            ['Trade Expectancy', fmtCurrency(overallStats.expectancy)],
            ['Profit Factor', Number.isFinite(overallStats.profitFactor) ? overallStats.profitFactor.toFixed(2) : '∞'],
          ]}
          insight={overallStats.insight}
        />
        <SummaryCard
          title="Trade Outcomes"
          borderColor={PROFIT_COLOR}
          items={[
            ['Winning Trades', outcomeStats.wins],
            ['Losing Trades', outcomeStats.losses],
            ['Break Even Trades', outcomeStats.breakeven],
            ['Largest Profit', <span style={{ color: PROFIT_COLOR }}>{fmtCurrency(outcomeStats.largestProfit)}</span>],
            ['Largest Loss', <span style={{ color: LOSS_COLOR }}>{fmtCurrency(outcomeStats.largestLoss)}</span>],
            ['Max Consecutive Wins', outcomeStats.maxWinStreak],
            ['Max Consecutive Losses', outcomeStats.maxLossStreak],
          ]}
          insight={outcomeStats.insight}
        />
        <SummaryCard
          title="Trading Activity"
          borderColor={'#3B82F6'}
          items={[
            ['Average Daily Volume', `${activityStats.avgDailyVolume.toFixed(1)} contracts`],
            ['Total Trading Days', activityStats.tradingDays],
            ['Logged Days', activityStats.loggedDays],
            ['Best Trading Day', activityStats.bestDay],
            ['Best Session', activityStats.bestSession],
            ['Best Symbol', activityStats.bestSymbol],
          ]}
          insight={activityStats.insight}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '12px' }}>
        <div style={panelStyle}>
          <div style={panelTitleStyle}>Performance by Symbol</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Symbol', 'Trades', 'Win%', 'Net P&L', 'Avg P&L', 'Best Trade', 'Worst Trade'].map(h => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symbolRows.map(row => (
                  <tr key={row.symbol} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={tdStyle}>{row.symbol}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{row.trades}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtPercent(row.winRate)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: row.net >= 0 ? PROFIT_COLOR : LOSS_COLOR }}>{fmtCurrency(row.net)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtCurrency(row.avg)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: PROFIT_COLOR }}>{fmtCurrency(row.best)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: LOSS_COLOR }}>{fmtCurrency(row.worst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {symbolRows.length === 0 ? <div style={{ color: 'var(--text3)', padding: '14px 2px' }}>No symbol performance data yet.</div> : null}
          </div>
        </div>

        <div style={panelStyle}>
          <div style={panelTitleStyle}>Performance by Session</div>
          <div style={{ display: 'grid', gap: '12px' }}>
            {sessionRows.map(row => (
              <div key={row.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}>
                  <strong>{row.name}</strong>
                  <span style={{ color: 'var(--text2)' }}>
                    {row.trades} trades · {fmtPercent(row.winRate)} · <span style={{ color: row.net >= 0 ? PROFIT_COLOR : LOSS_COLOR }}>{fmtCurrency(row.net)}</span>
                  </span>
                </div>
                <div style={{ height: '12px', borderRadius: '99px', background: 'var(--page-bg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${row.pct}%`,
                      height: '100%',
                      background: row.net >= 0 ? PROFIT_COLOR : LOSS_COLOR,
                      opacity: 0.85,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>


      {/* ── PRO ANALYTICS ── */}
      <div style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <span style={{ fontSize: '11px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)' }}>Pro Analytics</span>
          <span style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: '#fff',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '999px',
            letterSpacing: '0.06em',
            fontFamily: 'monospace',
          }}>PRO</span>
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Advanced charts for optimizing your edge</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>

          {/* R-Multiple Histogram */}
          <div style={{ ...panelStyle, borderTop: '2px solid #f59e0b' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={panelTitleStyle}>R-Multiple Distribution</div>
              <span style={{ fontSize: '10px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', padding: '2px 7px', borderRadius: '999px', fontFamily: 'monospace', fontWeight: 700 }}>PRO</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>
              Frequency of trade outcomes in risk units (R). Shows your edge independent of position size.
            </div>
            {rMultipleData.total === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', gap: '8px' }}>
                <div style={{ fontSize: '28px' }}>📊</div>
                <div style={{ color: 'var(--text3)', fontSize: '12px', textAlign: 'center' }}>No trades with R-multiple data yet.<br/>Set a trade risk ($) when logging trades.</div>
              </div>
            ) : (
              <>
                <svg width="100%" viewBox="0 0 540 200" style={{ display: 'block', overflow: 'visible' }}>
                  {rMultipleData.bins.map((bin, i) => {
                    const barH = (bin.count / rMultipleData.maxCount) * 150
                    const x = 30 + i * 56
                    const y = 170 - barH
                    return (
                      <g key={bin.label}>
                        <rect x={x} y={y} width={40} height={Math.max(barH, 1)} fill={bin.color} rx="4" opacity="0.85" />
                        {bin.count > 0 && (
                          <text x={x + 20} y={y - 5} textAnchor="middle" fontSize="10" fill="var(--text2)">{bin.count}</text>
                        )}
                        <text x={x + 20} y={190} textAnchor="middle" fontSize="10" fill="var(--text3)">{bin.label}</text>
                      </g>
                    )
                  })}
                  <line x1={28} y1={170} x2={526} y2={170} stroke="var(--border)" strokeWidth="1" />
                </svg>
                <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text3)', marginTop: '4px', fontFamily: 'monospace' }}>
                  <span>Trades w/ R data: <strong style={{ color: 'var(--text)' }}>{rMultipleData.total}</strong></span>
                  <span>Avg R: <strong style={{ color: 'var(--text)' }}>{rMultipleData.total ? (filteredTrades.reduce((s, t) => s + asNum(t.actual_rr), 0) / rMultipleData.total).toFixed(2) : '—'}R</strong></span>
                </div>
              </>
            )}
          </div>

          {/* Underwater Equity Curve */}
          <div style={{ ...panelStyle, borderTop: '2px solid #3B82F6' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={panelTitleStyle}>Drawdown (Underwater Curve)</div>
              <span style={{ fontSize: '10px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', padding: '2px 7px', borderRadius: '999px', fontFamily: 'monospace', fontWeight: 700 }}>PRO</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>
              How far below your peak equity you are at any point. Critical for prop firm traders.
            </div>
            {drawdownData.points.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', gap: '8px' }}>
                <div style={{ fontSize: '28px' }}>📉</div>
                <div style={{ color: 'var(--text3)', fontSize: '12px', textAlign: 'center' }}>No trade data yet for this period.</div>
              </div>
            ) : (() => {
              const pts = drawdownData.points
              const minDD = Math.min(...pts.map(p => p.drawdown), 0)
              const ddRange = Math.abs(minDD) || 1
              const w = 500, h = 160, padL = 46, padB = 20, padT = 10
              const plotW = w - padL
              const plotH = h - padB - padT
              const xAt = (i) => padL + (i / Math.max(pts.length - 1, 1)) * plotW
              const yAt = (v) => padT + (1 - (v - minDD) / ddRange) * plotH
              const areaPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.drawdown).toFixed(1)}`).join(' ') +
                ` L${xAt(pts.length - 1).toFixed(1)},${yAt(0).toFixed(1)} L${padL},${yAt(0).toFixed(1)} Z`
              const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.drawdown).toFixed(1)}`).join(' ')
              const ticks = [0, -25, -50, -75, -100].filter(v => v >= minDD - 5)
              return (
                <>
                  <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }}>
                    <defs>
                      <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.03" />
                      </linearGradient>
                    </defs>
                    {ticks.map(v => (
                      <g key={v}>
                        <line x1={padL} y1={yAt(v)} x2={w} y2={yAt(v)} stroke="var(--border)" strokeWidth="1" />
                        <text x={padL - 4} y={yAt(v) + 4} textAnchor="end" fontSize="9" fill="var(--text3)">{v.toFixed(0)}%</text>
                      </g>
                    ))}
                    <path d={areaPath} fill="url(#ddGrad)" />
                    <path d={linePath} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinejoin="round" />
                    {/* Mark max drawdown */}
                    {(() => {
                      const worstIdx = pts.reduce((mi, p, i) => p.drawdown < pts[mi].drawdown ? i : mi, 0)
                      return (
                        <circle
                          cx={xAt(worstIdx)}
                          cy={yAt(pts[worstIdx].drawdown)}
                          r="4"
                          fill="#EF4444"
                          stroke="var(--card-bg)"
                          strokeWidth="1.5"
                        />
                      )
                    })()}
                  </svg>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text3)', marginTop: '4px', fontFamily: 'monospace' }}>
                    <span>Max Drawdown: <strong style={{ color: '#EF4444' }}>{drawdownData.maxDrawdown.toFixed(1)}%</strong></span>
                    <span>Current: <strong style={{ color: drawdownData.currentDrawdown < -5 ? '#F87171' : 'var(--text)' }}>{drawdownData.currentDrawdown.toFixed(1)}%</strong></span>
                  </div>
                </>
              )
            })()}
          </div>
        </div>

        {/* MAE / MFE Scatter Plot — full width */}
        <div style={{ ...panelStyle, borderTop: '2px solid #8B5CF6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={panelTitleStyle}>MAE / MFE Scatter — "The Holy Grail"</div>
            <span style={{ fontSize: '10px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', padding: '2px 7px', borderRadius: '999px', fontFamily: 'monospace', fontWeight: 700 }}>PRO</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>
            X-axis: Maximum Adverse Excursion (how far it went against you) · Y-axis: Maximum Favorable Excursion (peak profit available). Dots hugging the top axis = exiting winners too early. Dots far right = holding losers too long.
          </div>
          {maeMfeData.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '28px 20px', background: 'rgba(139,92,246,0.05)', borderRadius: '10px', border: '1px dashed rgba(139,92,246,0.25)' }}>
              <div style={{ fontSize: '40px', flexShrink: 0 }}>📡</div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text)' }}>MAE / MFE data not yet available</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.55 }}>
                  This chart requires Maximum Adverse Excursion and Maximum Favorable Excursion data per trade.<br />
                  These values are captured by broker integrations (MT5/Tradovate) or can be manually logged in the future.<br />
                  <span style={{ color: '#8B5CF6', fontWeight: 600 }}>Once connected, this becomes the single most powerful chart for optimizing stops and targets.</span>
                </div>
              </div>
            </div>
          ) : (() => {
            const allMae = maeMfeData.map(p => p.mae)
            const allMfe = maeMfeData.map(p => p.mfe)
            const maxMae = Math.max(...allMae, 1)
            const maxMfe = Math.max(...allMfe, 1)
            const w = 900, h = 300, padL = 60, padB = 40, padT = 14, padR = 20
            const plotW = w - padL - padR
            const plotH = h - padB - padT
            const xAt = (v) => padL + (v / maxMae) * plotW
            const yAt = (v) => padT + (1 - v / maxMfe) * plotH
            return (
              <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
                <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="var(--border)" strokeWidth="1" />
                <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="var(--border)" strokeWidth="1" />
                <text x={padL + plotW / 2} y={h - 4} textAnchor="middle" fontSize="10" fill="var(--text3)">Maximum Adverse Excursion ($)</text>
                <text x={12} y={padT + plotH / 2} textAnchor="middle" fontSize="10" fill="var(--text3)" transform={`rotate(-90, 12, ${padT + plotH / 2})`}>Max Favorable Excursion ($)</text>
                {maeMfeData.map((pt, i) => (
                  <circle
                    key={i}
                    cx={xAt(pt.mae)}
                    cy={yAt(pt.mfe)}
                    r="5"
                    fill={pt.status === 'Win' ? PROFIT_COLOR : LOSS_COLOR}
                    opacity="0.72"
                  />
                ))}
              </svg>
            )
          })()}
        </div>
      </div>

      <div style={{ color: 'var(--text3)', fontSize: '12px', marginTop: '14px' }}>
        {loading ? 'Loading report data...' : `Showing ${filteredTrades.length} trades · Updated ${fmtDayLong(new Date().toISOString())}`}
      </div>
    </div>
  )
}

function SummaryCard({ title, items, insight, borderColor }) {
  return (
    <section
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '14px',
        minHeight: '235px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <h3 style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 650 }}>{title}</h3>
      <div style={{ display: 'grid', gap: '6px', marginBottom: '10px' }}>
        {items.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '13px' }}>
            <span style={{ color: 'var(--text2)' }}>{label}</span>
            <span style={{ color: 'var(--text)', textAlign: 'right', fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', fontSize: '12px', color: 'var(--text2)', borderTop: '1px solid var(--border)', paddingTop: '9px', lineHeight: 1.45 }}>
        ⚡ {insight}
      </div>
    </section>
  )
}

const panelStyle = {
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '14px',
}

const panelTitleStyle = {
  fontSize: '13px',
  fontWeight: 650,
  marginBottom: '10px',
}

const thStyle = {
  textAlign: 'left',
  padding: '9px 7px',
  color: 'var(--text3)',
  fontSize: '11px',
  fontWeight: 600,
}

const tdStyle = {
  padding: '8px 7px',
  fontSize: '12px',
  color: 'var(--text)',
}

const metricSelectStyle = {
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--card-bg)',
  color: 'var(--text)',
  fontSize: '12px',
  padding: '7px 10px',
  outline: 'none',
  cursor: 'pointer',
}

const metricButtonStyle = {
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--card-bg)',
  color: 'var(--text2)',
  fontSize: '12px',
  padding: '7px 10px',
  cursor: 'pointer',
}

const iconToggleStyle = {
  border: 'none',
  cursor: 'pointer',
  fontSize: '13px',
  padding: '7px 12px',
}
