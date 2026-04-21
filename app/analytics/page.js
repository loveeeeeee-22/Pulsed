'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAccountsForUser } from '@/lib/getAccountsForUser'
import { fetchTradesForCurrentUser } from '@/lib/getTradesForUser'
import { supabase } from '@/lib/supabase'

const PROFIT_COLOR = '#22C55E'
const LOSS_COLOR = '#EF4444'
const AMBER_COLOR = '#EAB308'

function exitEfficiencyColor(pct) {
  if (pct >= 80) return PROFIT_COLOR
  if (pct >= 50) return AMBER_COLOR
  return LOSS_COLOR
}

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

const SESSIONS = ['London', 'New York', 'Asian', 'Other']
const WEEKDAY_ROWS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const GRADE_SCORE = { A: 100, B: 75, C: 50, D: 25, F: 0 }

function fmtDateIso(dateObj) {
  return dateObj.toISOString().slice(0, 10)
}

function dayStartFromIso(isoDate) {
  const d = new Date(`${String(isoDate || '').slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function scoreFromGrade(grade) {
  const key = String(grade || '').trim().toUpperCase()
  return GRADE_SCORE[key]
}

function mondayOnOrBefore(dateObj) {
  const day = dateObj.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + diff)
}

function sundayOnOrAfter(dateObj) {
  const day = dateObj.getDay()
  const diff = day === 0 ? 0 : 7 - day
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + diff)
}

function buildHeatmapCalendar(year) {
  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year, 11, 31)
  const start = mondayOnOrBefore(yearStart)
  const end = sundayOnOrAfter(yearEnd)
  const dayMs = 24 * 60 * 60 * 1000
  const weekCount = Math.round((end.getTime() - start.getTime()) / (7 * dayMs)) + 1
  const weeks = Array.from({ length: weekCount }, (_, idx) => {
    const weekStart = new Date(start.getTime() + idx * 7 * dayMs)
    const days = WEEKDAY_ROWS.map((_, rowIdx) => {
      const dateObj = new Date(weekStart.getTime() + rowIdx * dayMs)
      return {
        key: fmtDateIso(dateObj),
        iso: fmtDateIso(dateObj),
        dateObj,
        inYear: dateObj.getFullYear() === year,
      }
    })
    return { weekIndex: idx, weekStart, days }
  })

  const monthStarts = MONTH_LABELS.map((label, month) => {
    const first = new Date(year, month, 1)
    const weekIndex = Math.max(0, Math.floor((mondayOnOrBefore(first).getTime() - start.getTime()) / (7 * dayMs)))
    return { month, label, weekIndex }
  })

  return { weeks, monthStarts }
}

/** Heatmap daily cells: A–F → score (matches trade_ratings analytics). */
const HEATMAP_GRADE_TO_SCORE = { A: 100, B: 75, C: 50, D: 25, F: 0 }

function heatmapGradeToScore(grade) {
  const key = String(grade || '').trim().toUpperCase()
  const v = HEATMAP_GRADE_TO_SCORE[key]
  return typeof v === 'number' ? v : undefined
}

function getDayColor(dayData) {
  if (!dayData) return 'rgba(255,255,255,0.04)'
  if (dayData.tradeCount > 0 && !dayData.hasRatings) {
    return 'rgba(255,255,255,0.08)'
  }
  if (dayData.score === null || dayData.score === undefined) {
    return 'rgba(255,255,255,0.04)'
  }
  const score = dayData.score
  if (score <= 20) return 'rgba(239,68,68,0.75)'
  if (score <= 40) return 'rgba(239,68,68,0.45)'
  if (score <= 60) return 'rgba(234,179,8,0.55)'
  if (score <= 80) return 'rgba(34,197,94,0.45)'
  return 'rgba(34,197,94,0.80)'
}

function heatmapCellStyle(dayStats, inYear) {
  if (!inYear) {
    return {
      background: 'transparent',
      border: '1px solid transparent',
      opacity: 0.28,
      dot: false,
    }
  }
  const bg = getDayColor(dayStats)
  const unratedDot = Boolean(dayStats && dayStats.tradeCount > 0 && !dayStats.hasRatings)
  return {
    background: bg,
    border: unratedDot ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
    opacity: 1,
    dot: unratedDot,
  }
}

function adherenceBucket(dayStats) {
  if (!dayStats || dayStats.tradeCount === 0) return 'no_trades'
  if (!dayStats.hasRatings) return 'unrated'
  const score = asNum(dayStats.score)
  if (score <= 20) return 'very_poor'
  if (score <= 40) return 'poor'
  if (score <= 60) return 'moderate'
  if (score <= 80) return 'good'
  return 'excellent'
}

function adherenceStyle(bucket, inYear = true) {
  if (!inYear) {
    return {
      background: 'transparent',
      border: '1px solid transparent',
      opacity: 0.28,
      dot: false,
    }
  }
  if (bucket === 'unrated') {
    return {
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.15)',
      opacity: 1,
      dot: true,
    }
  }
  if (bucket === 'very_poor') return { background: 'rgba(239,68,68,0.75)', border: '1px solid transparent', opacity: 1, dot: false }
  if (bucket === 'poor') return { background: 'rgba(239,68,68,0.45)', border: '1px solid transparent', opacity: 1, dot: false }
  if (bucket === 'moderate') return { background: 'rgba(234,179,8,0.55)', border: '1px solid transparent', opacity: 1, dot: false }
  if (bucket === 'good') return { background: 'rgba(34,197,94,0.45)', border: '1px solid transparent', opacity: 1, dot: false }
  if (bucket === 'excellent') return { background: 'rgba(34,197,94,0.80)', border: '1px solid transparent', opacity: 1, dot: false }
  return { background: 'rgba(255,255,255,0.04)', border: '1px solid transparent', opacity: 1, dot: false }
}

function chunkArray(items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

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

function toIsoDateLocal(d) {
  if (!d || Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Inclusive YYYY-MM-DD range for analytics date filter (string compare safe). */
function analyticsDateRange(rangeId) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dateTo = toIsoDateLocal(today)
  if (rangeId === 'all') return { dateFrom: null, dateTo }
  if (rangeId === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { dateFrom: toIsoDateLocal(start), dateTo }
  }
  const ranges = {
    '7d': new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6),
    '30d': new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29),
    '90d': new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89),
  }
  const startDate = ranges[rangeId]
  if (!startDate) return { dateFrom: null, dateTo }
  return { dateFrom: toIsoDateLocal(startDate), dateTo }
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
  const router = useRouter()
  const heatmapWrapRef = useRef(null)
  const [trades, setTrades] = useState([])
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('all')
  const [selectedHeatmapYear, setSelectedHeatmapYear] = useState(new Date().getFullYear())
  const [selectedRange, setSelectedRange] = useState('all')
  const [grouping, setGrouping] = useState('day')
  const [leftMetric, setLeftMetric] = useState('net_pnl')
  const [rightMetric, setRightMetric] = useState('win_rate')
  const [chartType, setChartType] = useState('line')
  const [loading, setLoading] = useState(true)
  const [accent] = useState(() => {
    if (typeof window === 'undefined') return '#7C3AED'
    return window.localStorage.getItem('accentColor') || '#7C3AED'
  })
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const [rMultipleHover, setRMultipleHover] = useState(null)
  const [drawdownHover, setDrawdownHover] = useState(null)
  const [maeMfeHover, setMaeMfeHover] = useState(null)
  const [heatmapHover, setHeatmapHover] = useState(null)
  const [yearRatings, setYearRatings] = useState([])
  const [ratingsLoading, setRatingsLoading] = useState(false)
  const [debugInfo, setDebugInfo] = useState({})

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const accountRows = await getAccountsForUser()
      console.log('Analytics - accounts:', accountRows)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      console.log('Current user ID:', user?.id)

      const { trades: tradeRows, error: tradeFetchError } = await fetchTradesForCurrentUser({
        orderAscending: true,
      })

      const debugData = {
        rawTradeCount: tradeRows?.length || 0,
        error: tradeFetchError || null,
        firstTrade: tradeRows?.[0] || null,
        allAccountIds: (accountRows || []).map(a => a.id) || [],
      }
      if (!cancelled) {
        setDebugInfo(debugData)
      }
      console.log('ANALYTICS DEBUG:', debugData)

      if (!cancelled) {
        setAccounts(accountRows || [])
        setTrades(tradeRows || [])
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const availableHeatmapYears = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const yearSet = new Set([currentYear])
    for (const trade of trades) {
      const year = Number(String(trade?.date || '').slice(0, 4))
      if (Number.isFinite(year) && year > 1970 && year < 3000) yearSet.add(year)
    }
    return Array.from(yearSet).sort((a, b) => b - a)
  }, [trades])

  const effectiveHeatmapYear = availableHeatmapYears.includes(selectedHeatmapYear)
    ? selectedHeatmapYear
    : (availableHeatmapYears[0] || new Date().getFullYear())

  const yearTrades = useMemo(() => {
    const pool = selectedAccount === 'all' ? trades : trades.filter(t => t.account_id === selectedAccount)
    return pool
      .filter(t => String(t.date || '').slice(0, 4) === String(effectiveHeatmapYear))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  }, [trades, effectiveHeatmapYear, selectedAccount])

  useEffect(() => {
    let cancelled = false

    async function loadYearRatings() {
      const tradeIds = yearTrades.map(t => t.id).filter(Boolean)
      if (!tradeIds.length) {
        setYearRatings([])
        setRatingsLoading(false)
        return
      }

      setRatingsLoading(true)
      const batches = chunkArray(tradeIds, 400)
      const merged = []

      for (const batch of batches) {
        const { data, error } = await supabase
          .from('trade_ratings')
          .select('trade_id, criterion, grade')
          .in('trade_id', batch)
        if (error) {
          if (!cancelled) {
            console.warn('Unable to load trade_ratings for heatmap:', error.message)
            setYearRatings([])
            setRatingsLoading(false)
          }
          return
        }
        merged.push(...(data || []))
      }

      if (!cancelled) {
        setYearRatings(merged)
        setRatingsLoading(false)
      }
    }

    loadYearRatings()

    return () => {
      cancelled = true
    }
  }, [yearTrades])

  const filteredTrades = useMemo(() => {
    const { dateFrom, dateTo } = analyticsDateRange(selectedRange)
    console.log('Analytics - date range:', dateFrom, dateTo)
    console.log('Date filter start:', dateFrom)
    console.log('Sample trade date:', trades?.[0]?.date)

    const byAccount =
      selectedAccount === 'all' ? trades : trades.filter(t => t.account_id === selectedAccount)

    return byAccount
      .filter(t => {
        if (!dateFrom) return true
        const d = String(t.date || '').slice(0, 10)
        if (!d) return false
        return d >= dateFrom && d <= dateTo
      })
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  }, [trades, selectedRange, selectedAccount])

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

  const { overallStats, outcomeStats, activityStats, symbolRows, sessionRows } = useMemo(() => {
    const filtered = filteredTrades

    const wins = filtered.filter(t => t.status === 'Win')
    const losses = filtered.filter(t => t.status === 'Loss')
    const breakevens = filtered.filter(t => t.status === 'Breakeven')

    const totalPnl = filtered.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0)

    const grossWin = wins.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0)

    const grossLoss = Math.abs(losses.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0))

    const winRateStr =
      filtered.length > 0 ? ((wins.length / filtered.length) * 100).toFixed(1) : '0.0'
    const winRateRatio = filtered.length > 0 ? wins.length / filtered.length : 0

    const profitFactorNum =
      grossLoss > 0 ? grossWin / grossLoss : wins.length > 0 ? Infinity : 0

    const averageTradePnlNum = filtered.length > 0 ? totalPnl / filtered.length : 0
    const expectancyNum = averageTradePnlNum

    const largestProfit =
      filtered.length > 0 ? Math.max(...filtered.map(t => parseFloat(t.net_pnl || 0))) : 0
    const largestLoss =
      filtered.length > 0 ? Math.min(...filtered.map(t => parseFloat(t.net_pnl || 0))) : 0

    let maxConsecWins = 0
    let maxConsecLosses = 0
    let currentWins = 0
    let currentLosses = 0
    filtered.forEach(t => {
      if (t.status === 'Win') {
        currentWins++
        currentLosses = 0
        maxConsecWins = Math.max(maxConsecWins, currentWins)
      } else if (t.status === 'Loss') {
        currentLosses++
        currentWins = 0
        maxConsecLosses = Math.max(maxConsecLosses, currentLosses)
      } else {
        currentWins = 0
        currentLosses = 0
      }
    })

    const totalVolume = filtered.reduce((s, t) => s + parseFloat(t.contracts || 0), 0)

    const tradingDays = new Set(filtered.map(t => t.date?.slice(0, 10)).filter(Boolean)).size

    const avgDailyVolumeNum = tradingDays > 0 ? totalVolume / tradingDays : 0

    const symbolMap = {}
    filtered.forEach(t => {
      const sym = t.symbol || '—'
      if (!symbolMap[sym]) {
        symbolMap[sym] = {
          pnl: 0,
          trades: 0,
          wins: 0,
        }
      }
      symbolMap[sym].pnl += parseFloat(t.net_pnl || 0)
      symbolMap[sym].trades++
      if (t.status === 'Win') symbolMap[sym].wins++
    })

    const bestSymbol = Object.entries(symbolMap).sort(([, a], [, b]) => b.pnl - a.pnl)[0]

    const sessionMapAgg = {}
    filtered.forEach(t => {
      const sess = t.session || 'Other'
      if (!sessionMapAgg[sess]) {
        sessionMapAgg[sess] = { pnl: 0, trades: 0 }
      }
      sessionMapAgg[sess].pnl += parseFloat(t.net_pnl || 0)
      sessionMapAgg[sess].trades++
    })

    const bestSession = Object.entries(sessionMapAgg).sort(([, a], [, b]) => b.pnl - a.pnl)[0]

    const dowMap = {}
    filtered.forEach(t => {
      if (!t.date) return
      const dow = new Date(`${String(t.date).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
      })
      if (!dowMap[dow]) {
        dowMap[dow] = { pnl: 0, trades: 0 }
      }
      dowMap[dow].pnl += parseFloat(t.net_pnl || 0)
      dowMap[dow].trades++
    })

    const bestDow = Object.entries(dowMap).sort(([, a], [, b]) => b.pnl - a.pnl)[0]

    console.log('Filtered trades:', filtered.length)

    console.log('Stats calculated:', {
      totalTrades: filtered.length,
      wins: wins.length,
      losses: losses.length,
      totalPnl,
      winRate: winRateStr,
      profitFactor: profitFactorNum === Infinity ? '∞' : profitFactorNum.toFixed(2),
      bestSymbol,
      bestSession,
    })

    const sortedTrades = [...filtered].sort((a, b) => {
      const da = new Date(a.date).getTime()
      const db = new Date(b.date).getTime()
      if (Number.isFinite(da) && Number.isFinite(db)) return da - db
      return String(a.date || '').localeCompare(String(b.date || ''))
    })

    let cumPnl = 0
    const equityCurveData = sortedTrades.map(t => {
      cumPnl += parseFloat(t.net_pnl || 0)
      return {
        date: t.date?.slice(0, 10),
        value: cumPnl,
        pnl: parseFloat(t.net_pnl || 0),
      }
    })
    console.log('Equity curve data:', equityCurveData)

    const dailyPnlMap = {}
    sortedTrades.forEach(t => {
      const date = t.date?.slice(0, 10)
      if (!date) return
      if (!dailyPnlMap[date]) {
        dailyPnlMap[date] = 0
      }
      dailyPnlMap[date] += parseFloat(t.net_pnl || 0)
    })

    const dailyPnlData = Object.entries(dailyPnlMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, pnl]) => ({ date, pnl }))
    console.log('Daily P&L data:', dailyPnlData)

    const winRateData = {
      wins: wins.length,
      losses: losses.length,
      breakevens: breakevens.length,
      total: filtered.length,
      winRate: parseFloat(winRateStr),
    }
    console.log('Win rate data:', winRateData)

    const symbolTableData = Object.entries(symbolMap)
      .map(([symbol, data]) => ({
        symbol,
        trades: data.trades,
        winPct: data.trades > 0 ? ((data.wins / data.trades) * 100).toFixed(1) + '%' : '0.0%',
        netPnl: data.pnl,
        avgPnl: data.trades > 0 ? (data.pnl / data.trades).toFixed(2) : '0.00',
        bestTrade: (() => {
          const vals = filtered.filter(tr => tr.symbol === symbol).map(tr => parseFloat(tr.net_pnl || 0))
          return vals.length ? Math.max(...vals) : 0
        })(),
        worstTrade: (() => {
          const vals = filtered.filter(tr => tr.symbol === symbol).map(tr => parseFloat(tr.net_pnl || 0))
          return vals.length ? Math.min(...vals) : 0
        })(),
      }))
      .sort((a, b) => b.netPnl - a.netPnl)
    console.log('Symbol table:', symbolTableData)

    const symbolRowsLocal = symbolTableData.map(row => ({
      symbol: row.symbol,
      trades: row.trades,
      wins: symbolMap[row.symbol]?.wins ?? 0,
      net: row.netPnl,
      winRate: row.trades ? (symbolMap[row.symbol]?.wins ?? 0) / row.trades : 0,
      avg: row.trades ? row.netPnl / row.trades : 0,
      best: row.bestTrade,
      worst: row.worstTrade,
    }))

    const sessionTableData = SESSIONS.map(session => {
      const data = sessionMapAgg[session] || { pnl: 0, trades: 0 }
      const sessionTrades = filtered.filter(t => (t.session || 'Other') === session)
      const sessionWins = sessionTrades.filter(t => t.status === 'Win')
      return {
        session,
        trades: data.trades,
        winRate:
          data.trades > 0 ? ((sessionWins.length / data.trades) * 100).toFixed(1) + '%' : '0.0%',
        pnl: data.pnl,
      }
    })
    console.log('Session data:', sessionTableData)

    const sessionRowsLocal = sessionTableData.map(row => ({
      name: row.session,
      trades: row.trades,
      winRate: row.trades ? parseFloat(row.winRate) / 100 : 0,
      net: row.pnl,
    }))
    const maxAbs = Math.max(...sessionRowsLocal.map(r => Math.abs(r.net)), 1)
    const sessionRowsResolved = sessionRowsLocal.map(r => ({
      ...r,
      pct: (Math.abs(r.net) / maxAbs) * 100,
    }))

    return {
      overallStats: {
        totalPnl,
        totalTrades: filtered.length,
        averageTradePnl: averageTradePnlNum,
        expectancy: expectancyNum,
        profitFactor: profitFactorNum,
        winRate: winRateRatio,
        insight: buildInsightOverall({
          totalPnl,
          expectancy: expectancyNum,
          profitFactor: profitFactorNum,
          winRate: winRateRatio,
        }),
      },
      outcomeStats: {
        wins: wins.length,
        losses: losses.length,
        breakeven: breakevens.length,
        largestProfit,
        largestLoss,
        maxWinStreak: maxConsecWins,
        maxLossStreak: maxConsecLosses,
        insight: buildInsightOutcomes({
          wins: wins.length,
          losses: losses.length,
          maxWinStreak: maxConsecWins,
          maxLossStreak: maxConsecLosses,
          largestProfit,
          largestLoss,
        }),
      },
      activityStats: {
        avgDailyVolume: avgDailyVolumeNum,
        tradingDays,
        loggedDays: tradingDays,
        bestDay: bestDow?.[0] ?? '—',
        bestSession: bestSession?.[0] ?? '—',
        bestSymbol: bestSymbol?.[0] ?? '—',
        insight: buildInsightActivity({
          tradingDays,
          loggedDays: tradingDays,
          bestSession: bestSession?.[0] ?? '—',
          bestSymbol: bestSymbol?.[0] ?? '—',
        }),
      },
      symbolRows: symbolRowsLocal,
      sessionRows: sessionRowsResolved,
    }
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
    const points = sorted.reduce((acc, t) => {
      const running = acc.running + asNum(t.net_pnl)
      const peak = Math.max(acc.peak, running)
      const dd = peak > 0 ? ((running - peak) / peak) * 100 : 0
      return {
        running,
        peak,
        points: [...acc.points, { date: String(t.date || '').slice(0, 10), cumPnl: running, peak, drawdown: dd }],
      }
    }, { running: 0, peak: 0, points: [] }).points
    const maxDrawdown = Math.min(...points.map(p => p.drawdown), 0)
    const currentDrawdown = points[points.length - 1]?.drawdown ?? 0
    return { points, maxDrawdown, currentDrawdown }
  }, [filteredTrades])

  // PRO: MAE/MFE scatter (from stored mae_price / mfe_price + entry / exit)
  const { maeMfeScatter, maeMfeStats } = useMemo(() => {
    const scatterData = filteredTrades
      .filter(
        t =>
          t.mae_price != null &&
          t.mfe_price != null &&
          t.entry_price != null &&
          t.exit_price != null,
      )
      .map(t => {
        const isLong = String(t.direction || '').toLowerCase() === 'long'
        const entry = parseFloat(t.entry_price)
        const mae = parseFloat(t.mae_price)
        const mfe = parseFloat(t.mfe_price)
        const exit = parseFloat(t.exit_price)
        if (![entry, mae, mfe, exit].every(Number.isFinite)) return null

        const maePoints = isLong ? entry - mae : mae - entry
        const mfePoints = isLong ? mfe - entry : entry - mfe
        const actualPoints = isLong ? exit - entry : entry - exit

        const exitEfficiency = mfePoints > 0 ? (actualPoints / mfePoints) * 100 : 0
        const entryEfficiency = mfePoints > 0 ? ((mfePoints - maePoints) / mfePoints) * 100 : 0

        return {
          x: Math.max(0, maePoints),
          y: Math.max(0, mfePoints),
          mae: Math.max(0, maePoints),
          mfe: Math.max(0, mfePoints),
          pnl: asNum(t.net_pnl),
          symbol: t.symbol,
          date: t.date,
          status: t.status,
          direction: t.direction,
          contracts: Math.max(0, asNum(t.contracts) || 0),
          exitEfficiency,
          entryEfficiency,
          actualPoints,
        }
      })
      .filter(Boolean)

    if (scatterData.length === 0) {
      return { maeMfeScatter: [], maeMfeStats: null }
    }

    const avgExit = scatterData.reduce((s, p) => s + p.exitEfficiency, 0) / scatterData.length
    const avgEntry = scatterData.reduce((s, p) => s + p.entryEfficiency, 0) / scatterData.length
    const best = scatterData.reduce((a, b) => (b.exitEfficiency > a.exitEfficiency ? b : a))
    const worst = scatterData.reduce((a, b) => (b.exitEfficiency < a.exitEfficiency ? b : a))

    return {
      maeMfeScatter: scatterData,
      maeMfeStats: { avgExit, avgEntry, best, worst },
    }
  }, [filteredTrades])

  const heatmapData = useMemo(() => {
    const tradeDateById = {}
    for (const trade of yearTrades) {
      const iso = String(trade?.date || '').slice(0, 10)
      if (trade?.id && iso) tradeDateById[trade.id] = iso
    }

    const ratingsByTrade = {}
    for (const row of yearRatings) {
      const tid = row.trade_id
      if (!tid) continue
      if (!ratingsByTrade[tid]) ratingsByTrade[tid] = []
      ratingsByTrade[tid].push(row)
    }

    const dayAccum = {}
    for (const trade of yearTrades) {
      const date = String(trade?.date || '').slice(0, 10)
      if (!date) continue
      if (!dayAccum[date]) {
        dayAccum[date] = { scores: [], tradeCount: 0, hasRatings: false, trades: [] }
      }
      dayAccum[date].tradeCount += 1
      dayAccum[date].trades.push(trade)

      const tradeRatings = ratingsByTrade[trade.id] || []
      if (tradeRatings.length > 0) {
        dayAccum[date].hasRatings = true
        for (const r of tradeRatings) {
          const sc = heatmapGradeToScore(r.grade)
          if (sc !== undefined) dayAccum[date].scores.push(sc)
        }
      } else if (trade.trade_grade != null && String(trade.trade_grade).trim() !== '') {
        dayAccum[date].hasRatings = true
        const sc = heatmapGradeToScore(trade.trade_grade)
        if (sc !== undefined) dayAccum[date].scores.push(sc)
      }
    }

    const finalDailyScores = {}
    const dayMap = {}

    for (const [date, data] of Object.entries(dayAccum)) {
      const avgScore =
        data.scores.length > 0
          ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
          : null
      finalDailyScores[date] = {
        score: avgScore,
        tradeCount: data.tradeCount,
        hasRatings: data.hasRatings,
        trades: data.trades,
      }
      dayMap[date] = {
        date,
        tradeCount: data.tradeCount,
        hasRatings: data.hasRatings,
        score: avgScore,
        ratingCount: data.scores.length,
        bestRule: null,
        weakestRule: null,
        criterionMap: {},
      }
    }

    const weekdayScoreMap = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] }
    const criterionMap = {}

    for (const row of yearRatings) {
      const iso = tradeDateById[row.trade_id]
      if (!iso || !dayMap[iso]) continue
      const score = scoreFromGrade(row.grade)
      if (!Number.isFinite(score)) continue
      const criterion = String(row.criterion || 'Uncategorized').trim() || 'Uncategorized'
      const grade = String(row.grade || '').trim().toUpperCase()
      const day = dayMap[iso]
      if (!day.criterionMap[criterion]) day.criterionMap[criterion] = { count: 0, scoreSum: 0 }
      day.criterionMap[criterion].count += 1
      day.criterionMap[criterion].scoreSum += score

      if (!criterionMap[criterion]) {
        criterionMap[criterion] = {
          criterion,
          totalRatings: 0,
          scoreSum: 0,
          gradeCounts: { A: 0, B: 0, C: 0, D: 0, F: 0 },
          recent: [],
          previous: [],
        }
      }
      criterionMap[criterion].totalRatings += 1
      criterionMap[criterion].scoreSum += score
      if (criterionMap[criterion].gradeCounts[grade] != null) criterionMap[criterion].gradeCounts[grade] += 1
    }

    for (const day of Object.values(dayMap)) {
      const criteria = Object.entries(day.criterionMap).map(([criterion, item]) => ({
        criterion,
        avg: item.count ? item.scoreSum / item.count : 0,
      }))
      criteria.sort((a, b) => b.avg - a.avg)
      day.bestRule = criteria[0]?.criterion || null
      day.weakestRule = criteria[criteria.length - 1]?.criterion || null
    }

    const anchorDate = new Date(effectiveHeatmapYear, 11, 31, 23, 59, 59)
    const recentStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() - 29)
    const previousStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() - 59)
    const previousEnd = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() - 30)

    for (const row of yearRatings) {
      const iso = tradeDateById[row.trade_id]
      if (!iso) continue
      const criterion = String(row.criterion || 'Uncategorized').trim() || 'Uncategorized'
      const item = criterionMap[criterion]
      if (!item) continue
      const score = scoreFromGrade(row.grade)
      if (!Number.isFinite(score)) continue
      const d = dayStartFromIso(iso)
      if (!d) continue
      if (d >= recentStart && d <= anchorDate) item.recent.push(score)
      if (d >= previousStart && d <= previousEnd) item.previous.push(score)
    }

    const ratedDays = []
    for (const day of Object.values(dayMap)) {
      if (day.ratingCount > 0 && day.score != null && Number.isFinite(day.score)) {
        const wd = WEEKDAY_NAMES[new Date(`${day.date}T12:00:00`).getDay()]
        if (weekdayScoreMap[wd]) weekdayScoreMap[wd].push(day.score)
        ratedDays.push(day)
      }
    }

    const overallAdherence = ratedDays.length
      ? ratedDays.reduce((sum, d) => sum + asNum(d.score), 0) / ratedDays.length
      : null

    const weekdayRows = Object.entries(weekdayScoreMap)
      .map(([name, scores]) => ({
        name,
        avg: scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null,
      }))
      .filter(row => row.avg != null)
      .sort((a, b) => b.avg - a.avg)

    const bestWeekday = weekdayRows[0] || null
    const worstWeekday = weekdayRows[weekdayRows.length - 1] || null

    const ruleRows = Object.values(criterionMap)
      .map(item => {
        const avg = item.totalRatings ? item.scoreSum / item.totalRatings : 0
        const recentAvg = item.recent.length ? item.recent.reduce((sum, s) => sum + s, 0) / item.recent.length : null
        const previousAvg = item.previous.length ? item.previous.reduce((sum, s) => sum + s, 0) / item.previous.length : null
        const delta = recentAvg != null && previousAvg != null ? recentAvg - previousAvg : 0
        const trend = delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat'
        return {
          ...item,
          avg,
          recentAvg,
          previousAvg,
          delta,
          trend,
        }
      })
      .sort((a, b) => a.avg - b.avg)

    const mostBrokenRule = ruleRows[0] || null

    const tradeIdsWithRatings = new Set(yearRatings.map(r => r.trade_id).filter(Boolean))
    let tradesWithDetailedRatings = 0
    let tradesWithOverallGradeOnly = 0
    let unratedTrades = 0
    for (const t of yearTrades) {
      if (tradeIdsWithRatings.has(t.id)) {
        tradesWithDetailedRatings += 1
      } else if (heatmapGradeToScore(t.trade_grade) !== undefined) {
        tradesWithOverallGradeOnly += 1
      } else {
        unratedTrades += 1
      }
    }

    return {
      dayMap,
      finalDailyScores,
      ratedDays,
      ruleRows,
      overallAdherence,
      bestWeekday,
      worstWeekday,
      mostBrokenRule,
      heatmapDebug: {
        totalTrades: yearTrades.length,
        tradesWithDetailedRatings,
        tradesWithOverallGradeOnly,
        unratedTrades,
        dateRange: `${effectiveHeatmapYear}-01-01 to ${effectiveHeatmapYear}-12-31`,
      },
    }
  }, [effectiveHeatmapYear, yearRatings, yearTrades])

  const heatmapCalendar = useMemo(() => buildHeatmapCalendar(effectiveHeatmapYear), [effectiveHeatmapYear])
  const heatmapYearTradeCount = yearTrades.length
  const heatmapUnratedCount = heatmapData.heatmapDebug?.unratedTrades ?? 0
  const showHeatmapEmptyOverlay = heatmapYearTradeCount === 0 && !ratingsLoading

  useEffect(() => {
    if (ratingsLoading) return
    console.log('Trades fetched:', yearTrades.length)
    console.log('Ratings fetched:', yearRatings.length)
    console.log('Daily scores:', heatmapData.finalDailyScores)
    console.log('Sample trade:', yearTrades[0])
    console.log('Sample rating:', yearRatings[0])
  }, [ratingsLoading, yearTrades, yearRatings, heatmapData.finalDailyScores])

  function onHeatmapHover(dayInfo, event) {
    if (!heatmapWrapRef.current || !dayInfo?.inYear) return
    const rect = heatmapWrapRef.current.getBoundingClientRect()
    const targetRect = event.currentTarget?.getBoundingClientRect?.()
    const fallbackX = targetRect ? targetRect.left + targetRect.width / 2 : rect.left + 12
    const fallbackY = targetRect ? targetRect.top + targetRect.height / 2 : rect.top + 12
    setHeatmapHover({
      dayInfo,
      left: ((event.clientX ?? fallbackX) - rect.left) + 12,
      top: ((event.clientY ?? fallbackY) - rect.top) + 14,
    })
  }

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

  const dateRangeLabel = DATE_RANGES.find(r => r.id === selectedRange)?.label || 'All time'
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
      {Object.keys(debugInfo).length > 0 && (
        <div
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid #EF4444',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#EF4444',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '8px' }}>DEBUG INFO (remove before launch)</div>
          <div>Raw trades from DB: {debugInfo.rawTradeCount}</div>
          <div>Error: {debugInfo.error || 'none'}</div>
          <div>Selected account: {selectedAccount}</div>
          <div>Selected range: {selectedRange || 'none'}</div>
          <div>After filters (charts): {filteredTrades.length}</div>
          <div>First trade date: {debugInfo.firstTrade?.date}</div>
          <div>First trade account_id: {debugInfo.firstTrade?.account_id}</div>
          <div>Available account IDs: {debugInfo.allAccountIds.join(', ')}</div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
        <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 650, letterSpacing: '-0.02em', flex: '1 1 auto' }}>Reports</h1>

        <div style={{ flex: '0 1 320px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '9px', color: 'var(--text3)', fontSize: '14px' }}>📅</span>
          <select
            id="analytics-date-range"
            name="analytics-date-range"
            value={selectedRange}
            onChange={e => setSelectedRange(e.target.value)}
            autoComplete="off"
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
          id="analytics-account"
          name="analytics-account"
          value={selectedAccount}
          onChange={e => setSelectedAccount(e.target.value)}
          autoComplete="off"
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
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              id="analytics-chart-metric-left"
              name="analytics-chart-metric-left"
              value={leftMetric}
              onChange={e => setLeftMetric(e.target.value)}
              style={metricSelectStyle}
              autoComplete="off"
            >
              {METRICS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            {rightMetric ? (
              <select
                id="analytics-chart-metric-right"
                name="analytics-chart-metric-right"
                value={rightMetric}
                onChange={e => setRightMetric(e.target.value)}
                style={metricSelectStyle}
                autoComplete="off"
              >
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
              <text key={`x-${row.key}`} x={x} y={chartH - 16} textAnchor="middle" fontSize="10" fill={hoveredIndex === i ? 'var(--text)' : 'var(--text3)'}>
                {row.label}
              </text>
            )
          })}

          {/* Hover crosshair + dots */}
          {hoveredIndex != null && chartRows[hoveredIndex] && (() => {
            const row = chartRows[hoveredIndex]
            const x = xAt(hoveredIndex, chartRows.length)
            const lyv = yLeft(row.leftValue)
            const ryv = rightMetric ? yRight(row.rightValue) : null
            const leftLabel = METRICS.find(m => m.id === leftMetric)?.label || leftMetric
            const rightLabel = rightMetric ? METRICS.find(m => m.id === rightMetric)?.label : null
            const leftFmt = formatAxisValue(row.leftValue, leftMetric)
            const rightFmt = rightMetric ? formatAxisValue(row.rightValue, rightMetric) : null
            // Tooltip box positioning — flip to left side if near right edge
            const tipX = x > chartW * 0.65 ? x - 180 : x + 14
            const tipY = pad.top
            return (
              <g pointerEvents="none">
                {/* Vertical rule */}
                <line x1={x} y1={pad.top} x2={x} y2={pad.top + plotH} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 3" />
                {/* Left metric dot */}
                <circle cx={x} cy={lyv} r="5" fill={leftColor} stroke="var(--card-bg)" strokeWidth="2" />
                {/* Right metric dot */}
                {ryv != null && <circle cx={x} cy={ryv} r="4" fill={rightColor} stroke="var(--card-bg)" strokeWidth="2" />}
                {/* Tooltip card */}
                <rect x={tipX - 2} y={tipY} width="176" height={rightMetric ? 72 : 56} rx="8" fill="var(--card-bg)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                <text x={tipX + 10} y={tipY + 16} fontSize="10" fill="var(--text3)" fontFamily="monospace">{row.label}</text>
                <text x={tipX + 10} y={tipY + 33} fontSize="12" fill={leftColor} fontFamily="monospace" fontWeight="700">{leftLabel}: {leftFmt}</text>
                {rightLabel && <text x={tipX + 10} y={tipY + 52} fontSize="12" fill={rightColor} fontFamily="monospace" fontWeight="700">{rightLabel}: {rightFmt}</text>}
                {/* Trade count sub-label */}
                <text x={tipX + 10} y={rightMetric ? tipY + 66 : tipY + 50} fontSize="10" fill="var(--text3)" fontFamily="monospace">{row.trades} trade{row.trades !== 1 ? 's' : ''}</text>
              </g>
            )
          })()}

          {/* Invisible hit-area rects for hover detection */}
          {chartRows.map((row, i) => {
            const x = xAt(i, chartRows.length)
            const slotW = chartRows.length > 1 ? plotW / (chartRows.length - 1) : plotW
            return (
              <rect
                key={`hit-${row.key}`}
                x={x - slotW / 2}
                y={pad.top}
                width={slotW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(i)}
              />
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
            ['Largest Profit', fmtCurrency(outcomeStats.largestProfit)],
            ['Largest Loss', fmtCurrency(outcomeStats.largestLoss)],
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
              <div onMouseLeave={() => setRMultipleHover(null)}>
                <svg width="100%" viewBox="0 0 540 210" style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}>
                  {rMultipleData.bins.map((bin, i) => {
                    const barH = (bin.count / rMultipleData.maxCount) * 150
                    const x = 30 + i * 56
                    const y = 170 - barH
                    const isHovered = rMultipleHover === i
                    return (
                      <g key={bin.label}
                        onMouseEnter={() => setRMultipleHover(i)}
                        style={{ cursor: 'pointer' }}
                      >
                        <rect x={x} y={y} width={40} height={Math.max(barH, 1)} fill={bin.color} rx="4"
                          opacity={rMultipleHover === null || isHovered ? 0.9 : 0.35}
                          style={{ transition: 'opacity 0.15s' }}
                        />
                        {isHovered && (
                          <rect x={x - 2} y={y - 2} width={44} height={Math.max(barH, 1) + 4} fill="none"
                            stroke={bin.color} strokeWidth="1.5" rx="5" opacity="0.8" />
                        )}
                        <text x={x + 20} y={y - 7} textAnchor="middle" fontSize="11"
                          fill={isHovered ? 'var(--text)' : 'var(--text2)'}
                          fontWeight={isHovered ? '700' : '400'}>
                          {bin.count > 0 ? bin.count : ''}
                        </text>
                        <text x={x + 20} y={190} textAnchor="middle" fontSize="10"
                          fill={isHovered ? 'var(--text)' : 'var(--text3)'}
                          fontWeight={isHovered ? '700' : '400'}>
                          {bin.label}
                        </text>
                        {/* Hover tooltip */}
                        {isHovered && bin.count > 0 && (() => {
                          const tipX = x > 300 ? x - 110 : x + 46
                          return (
                            <g pointerEvents="none">
                              <rect x={tipX} y={Math.max(y - 2, 4)} width={100} height={44} rx="7"
                                fill="var(--card-bg)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                              <text x={tipX + 8} y={Math.max(y - 2, 4) + 16} fontSize="11" fill={bin.color} fontFamily="monospace" fontWeight="700">{bin.label}</text>
                              <text x={tipX + 8} y={Math.max(y - 2, 4) + 32} fontSize="10" fill="var(--text3)" fontFamily="monospace">
                                {bin.count} trade{bin.count !== 1 ? 's' : ''}
                              </text>
                            </g>
                          )
                        })()}
                      </g>
                    )
                  })}
                  <line x1={28} y1={170} x2={526} y2={170} stroke="var(--border)" strokeWidth="1" />
                </svg>
                <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text3)', marginTop: '4px', fontFamily: 'monospace' }}>
                  <span>Trades w/ R data: <strong style={{ color: 'var(--text)' }}>{rMultipleData.total}</strong></span>
                  <span>Avg R: <strong style={{ color: 'var(--text)' }}>{rMultipleData.total ? (filteredTrades.reduce((s, t) => s + asNum(t.actual_rr), 0) / rMultipleData.total).toFixed(2) : '—'}R</strong></span>
                </div>
              </div>
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
              const worstIdx = pts.reduce((mi, p, i) => p.drawdown < pts[mi].drawdown ? i : mi, 0)
              const slotW = pts.length > 1 ? plotW / (pts.length - 1) : plotW
              return (
                <div onMouseLeave={() => setDrawdownHover(null)}>
                  <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible', cursor: 'crosshair' }}>
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
                    {/* Max drawdown marker */}
                    <circle cx={xAt(worstIdx)} cy={yAt(pts[worstIdx].drawdown)} r="4" fill="#EF4444" stroke="var(--card-bg)" strokeWidth="1.5" />
                    {/* Hover crosshair + tooltip */}
                    {drawdownHover != null && pts[drawdownHover] && (() => {
                      const idx = drawdownHover
                      const pt = pts[idx]
                      const cx = xAt(idx)
                      const cy = yAt(pt.drawdown)
                      const tipX = cx > w * 0.6 ? cx - 148 : cx + 10
                      return (
                        <g pointerEvents="none">
                          <line x1={cx} y1={padT} x2={cx} y2={padT + plotH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3 3" />
                          <circle cx={cx} cy={cy} r="5" fill="#3B82F6" stroke="var(--card-bg)" strokeWidth="2" />
                          <rect x={tipX} y={padT} width={140} height={60} rx="7" fill="var(--card-bg)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                          <text x={tipX + 8} y={padT + 16} fontSize="9" fill="var(--text3)" fontFamily="monospace">{pt.date}</text>
                          <text x={tipX + 8} y={padT + 31} fontSize="11" fill="#3B82F6" fontFamily="monospace" fontWeight="700">DD: {pt.drawdown.toFixed(1)}%</text>
                          <text x={tipX + 8} y={padT + 47} fontSize="10" fill={pt.cumPnl >= 0 ? '#22C55E' : '#EF4444'} fontFamily="monospace">Cum: {pt.cumPnl >= 0 ? '+' : ''}${pt.cumPnl.toFixed(2)}</text>
                        </g>
                      )
                    })()}
                    {/* Hit-area rects */}
                    {pts.map((pt, i) => (
                      <rect key={i} x={xAt(i) - slotW / 2} y={padT} width={slotW} height={plotH}
                        fill="transparent" onMouseEnter={() => setDrawdownHover(i)} />
                    ))}
                  </svg>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text3)', marginTop: '4px', fontFamily: 'monospace' }}>
                    <span>Max Drawdown: <strong style={{ color: '#EF4444' }}>{drawdownData.maxDrawdown.toFixed(1)}%</strong></span>
                    <span>Current: <strong style={{ color: drawdownData.currentDrawdown < -5 ? '#F87171' : 'var(--text)' }}>{drawdownData.currentDrawdown.toFixed(1)}%</strong></span>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* MAE / MFE Scatter Plot — full width */}
        <div style={{ ...panelStyle, borderTop: '2px solid #8B5CF6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={panelTitleStyle}>MAE / MFE Scatter — &quot;The Holy Grail&quot;</div>
            <span style={{ fontSize: '10px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', padding: '2px 7px', borderRadius: '999px', fontFamily: 'monospace', fontWeight: 700 }}>PRO</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>
            X: MAE in price points (adverse excursion) · Y: MFE in price points (favorable excursion). Same scale on both axes; diagonal is MAE = MFE. Dot size reflects contracts and scales down when there are many trades so points stay readable. Data comes from optional excursion prices on each trade.
          </div>
          {filteredTrades.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px', borderRadius: '10px', border: '1px dashed var(--border)' }}>
              No trades match your filters. Widen the date range or choose a different account.
            </div>
          ) : maeMfeScatter.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '28px 20px', background: 'rgba(139,92,246,0.05)', borderRadius: '10px', border: '1px dashed rgba(139,92,246,0.25)' }}>
              <div style={{ fontSize: '40px', flexShrink: 0 }}>📈</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text)' }}>Add MAE/MFE prices when logging trades to unlock this chart</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.55, marginBottom: '12px' }}>
                  Enter the lowest and highest price reached during the trade on the new trade form. The chart plots excursion in points and exit efficiency.
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/new-trade')}
                  style={{
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    background: '#8B5CF6',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Log a Trade →
                </button>
              </div>
            </div>
          ) : (() => {
            const allMae = maeMfeScatter.map(p => p.mae)
            const allMfe = maeMfeScatter.map(p => p.mfe)
            const maxVal = Math.max(1, ...allMae, ...allMfe)
            const w = 900
            const h = 320
            const padL = 60
            const padB = 44
            const padT = 36
            const padR = 24
            const plotW = w - padL - padR
            const plotH = h - padB - padT
            const xAt = v => padL + (v / maxVal) * plotW
            const yAt = v => padT + (1 - v / maxVal) * plotH
            const hPt = maeMfeHover != null ? maeMfeScatter[maeMfeHover] : null
            const contractVals = maeMfeScatter.map(p => p.contracts)
            const cMin = Math.min(...contractVals, 0)
            const cMax = Math.max(...contractVals, 1)
            const ptCount = maeMfeScatter.length
            // Smaller glyphs + extra shrink as N grows so dense plots stay legible.
            const densityScale = Math.max(0.62, 1 - Math.max(0, ptCount - 18) * 0.011)
            const dotR = (contracts, isH) => {
              let base = 2.75
              if (cMax > cMin) base = 2.75 + ((contracts - cMin) / (cMax - cMin)) * 3.25
              base *= densityScale
              const r = isH ? base + 1.1 : base
              return Math.max(1.75, Math.min(isH ? 7.5 : 6.75, r))
            }
            const dotFill = pt =>
              String(pt.status) === 'Win'
                ? PROFIT_COLOR
                : String(pt.status) === 'Loss'
                  ? LOSS_COLOR
                  : 'var(--text3)'
            const fmtDir = d => {
              const s = String(d || '').toLowerCase()
              if (s === 'long') return 'Long'
              if (s === 'short') return 'Short'
              return d || '—'
            }
            return (
              <div onMouseLeave={() => setMaeMfeHover(null)}>
                <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', cursor: 'crosshair' }}>
                  <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="var(--border)" strokeWidth="1" />
                  <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="var(--border)" strokeWidth="1" />
                  <line
                    x1={xAt(0)}
                    y1={yAt(0)}
                    x2={xAt(maxVal)}
                    y2={yAt(maxVal)}
                    stroke="rgba(139,92,246,0.45)"
                    strokeWidth="1.5"
                    strokeDasharray="6 4"
                  />
                  <text x={padL + plotW / 2} y={h - 6} textAnchor="middle" fontSize="10" fill="var(--text3)">
                    MAE (points)
                  </text>
                  <text
                    x={12}
                    y={padT + plotH / 2}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--text3)"
                    transform={`rotate(-90, 12, ${padT + plotH / 2})`}
                  >
                    MFE (points)
                  </text>
                  <text x={xAt(maxVal) - 6} y={yAt(maxVal) + 14} textAnchor="end" fontSize="9" fill="#8B5CF6" fontFamily="monospace">
                    MAE = MFE
                  </text>
                  <text x={padL + 6} y={padT + 48} fontSize="9" fill="#22C55E" fontWeight="600">
                    Perfect entries
                  </text>
                  <text x={padL + plotW * 0.5} y={padT + 16} fontSize="9" fill="#EAB308" fontWeight="600">
                    Survived but risky
                  </text>
                  <text x={padL + 6} y={padT + plotH * 0.88} fontSize="9" fill="#3B82F6" fontWeight="600">
                    Tight but small
                  </text>
                  <text x={padL + plotW * 0.52} y={padT + plotH * 0.88} fontSize="9" fill="#EF4444" fontWeight="600">
                    Poor entries
                  </text>
                  {maeMfeScatter.map((pt, i) => {
                    const isH = maeMfeHover === i
                    return (
                      <circle
                        key={i}
                        cx={xAt(pt.mae)}
                        cy={yAt(pt.mfe)}
                        r={dotR(pt.contracts, isH)}
                        fill={dotFill(pt)}
                        opacity={maeMfeHover === null || isH ? 0.92 : 0.32}
                        stroke={isH ? 'var(--card-bg)' : 'none'}
                        strokeWidth={isH ? 1.25 : 0}
                        style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
                        onMouseEnter={() => setMaeMfeHover(i)}
                      />
                    )
                  })}
                  {hPt &&
                    (() => {
                      const cx = xAt(hPt.mae)
                      const cy = yAt(hPt.mfe)
                      const tipX = cx > w * 0.58 ? cx - 176 : cx + 14
                      const tipY = cy > h * 0.55 ? cy - 118 : cy + 12
                      const effCol = exitEfficiencyColor(hPt.exitEfficiency)
                      return (
                        <g pointerEvents="none">
                          <line x1={cx} y1={padT} x2={cx} y2={padT + plotH} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4 3" />
                          <line x1={padL} y1={cy} x2={padL + plotW} y2={cy} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4 3" />
                          <rect x={tipX} y={tipY} width={172} height={112} rx="8" fill="var(--card-bg)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                          <text x={tipX + 10} y={tipY + 16} fontSize="9" fill="var(--text3)" fontFamily="monospace">
                            {String(hPt.date || '').slice(0, 10)}
                          </text>
                          <text x={tipX + 10} y={tipY + 32} fontSize="11" fill="var(--text)" fontFamily="monospace" fontWeight="700">
                            {hPt.symbol || '—'} · {fmtDir(hPt.direction)}
                          </text>
                          <text x={tipX + 10} y={tipY + 48} fontSize="10" fill="var(--text3)" fontFamily="monospace">
                            MAE: {hPt.mae.toFixed(2)} pts
                          </text>
                          <text x={tipX + 10} y={tipY + 62} fontSize="10" fill="var(--text3)" fontFamily="monospace">
                            MFE: {hPt.mfe.toFixed(2)} pts
                          </text>
                          <text x={tipX + 10} y={tipY + 78} fontSize="10" fill={effCol} fontFamily="monospace" fontWeight="600">
                            Exit efficiency: {hPt.exitEfficiency.toFixed(1)}%
                          </text>
                          <text x={tipX + 10} y={tipY + 96} fontSize="10" fill={hPt.pnl >= 0 ? PROFIT_COLOR : LOSS_COLOR} fontFamily="monospace">
                            Net P&amp;L: {hPt.pnl >= 0 ? '+' : ''}
                            {hPt.pnl.toFixed(2)}
                          </text>
                        </g>
                      )
                    })()}
                </svg>
                {maeMfeStats ? (
                  <div
                    style={{
                      marginTop: '16px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '12px 20px',
                      fontSize: '12px',
                      color: 'var(--text2)',
                      lineHeight: 1.45,
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--text3)' }}>Avg exit efficiency</span>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700, color: exitEfficiencyColor(maeMfeStats.avgExit) }}>
                        {maeMfeStats.avgExit.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Share of MFE captured at exit</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text3)' }}>Avg entry efficiency</span>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700, color: exitEfficiencyColor(maeMfeStats.avgEntry) }}>
                        {maeMfeStats.avgEntry.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>(MFE − MAE) / MFE — entry timing</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text3)' }}>Best exit efficiency</span>
                      <div style={{ fontFamily: 'monospace', fontWeight: 600, color: exitEfficiencyColor(maeMfeStats.best.exitEfficiency) }}>
                        {maeMfeStats.best.symbol || '—'} · {String(maeMfeStats.best.date || '').slice(0, 10)} ·{' '}
                        {maeMfeStats.best.exitEfficiency.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text3)' }}>Worst exit efficiency</span>
                      <div style={{ fontFamily: 'monospace', fontWeight: 600, color: exitEfficiencyColor(maeMfeStats.worst.exitEfficiency) }}>
                        {maeMfeStats.worst.symbol || '—'} · {String(maeMfeStats.worst.date || '').slice(0, 10)} ·{' '}
                        {maeMfeStats.worst.exitEfficiency.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })()}
        </div>
      </div>

      <div style={{ marginTop: '16px' }}>
        <div style={{ ...panelStyle, borderTop: '2px solid #f59e0b' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <div style={{ fontSize: '15px', fontWeight: 650, color: 'var(--text)' }}>Rule Adherence Heatmap</div>
                <span style={{ fontSize: '10px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', padding: '2px 7px', borderRadius: '999px', fontFamily: 'monospace', fontWeight: 700 }}>PRO</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Daily discipline score across all trades and criteria</div>
            </div>
            <select
              id="analytics-heatmap-year"
              name="analytics-heatmap-year"
              value={effectiveHeatmapYear}
              onChange={e => setSelectedHeatmapYear(Number(e.target.value))}
              style={metricSelectStyle}
              autoComplete="off"
            >
              {availableHeatmapYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          {heatmapYearTradeCount > 0 && heatmapUnratedCount > 0 && !ratingsLoading ? (
            <div
              style={{
                marginBottom: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(234,179,8,0.35)',
                background: 'rgba(234,179,8,0.08)',
                padding: '10px 12px',
                fontSize: '12px',
                color: 'var(--text2)',
                lineHeight: 1.5,
              }}
              role="status"
            >
              You have {heatmapUnratedCount} trade{heatmapUnratedCount === 1 ? '' : 's'} without grades. Grade your trades when logging them to see your discipline patterns.
            </div>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)' }}>Poor</span>
              {['very_poor', 'poor', 'moderate', 'good', 'excellent'].map(bucket => {
                const s = adherenceStyle(bucket, true)
                return <span key={bucket} style={{ width: '14px', height: '14px', borderRadius: '3px', background: s.background, border: s.border, display: 'inline-block' }} />
              })}
              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)' }}>Excellent</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '14px', height: '14px', borderRadius: '3px', background: 'rgba(255,255,255,0.04)', display: 'inline-block' }} />
                <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'monospace' }}>No trades</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '14px', height: '14px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: '3px', height: '3px', borderRadius: '99px', background: 'rgba(255,255,255,0.75)' }} />
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'monospace' }}>Unrated</span>
              </div>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <div ref={heatmapWrapRef} style={{ overflowX: 'auto', paddingBottom: '4px' }} onMouseLeave={() => setHeatmapHover(null)}>
              <div style={{ minWidth: `${Math.max(920, heatmapCalendar.weeks.length * 18 + 120)}px`, paddingRight: '8px' }}>
                <div style={{ marginLeft: '34px', display: 'grid', gridTemplateColumns: `repeat(${heatmapCalendar.weeks.length}, 14px)`, gap: '3px', marginBottom: '5px' }}>
                  {Array.from({ length: heatmapCalendar.weeks.length }).map((_, idx) => {
                    const month = heatmapCalendar.monthStarts.find(m => m.weekIndex === idx)
                    return (
                      <div key={`month-${idx}`} style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                        {month ? month.label : ''}
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ width: '28px', display: 'grid', gridTemplateRows: 'repeat(5, 14px)', gap: '3px' }}>
                    {WEEKDAY_ROWS.map(label => (
                      <div key={label} style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', lineHeight: '14px' }}>{label}</div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateRows: 'repeat(5, 14px)', gap: '3px' }}>
                    {WEEKDAY_ROWS.map((_, rowIdx) => (
                      <div key={`row-${rowIdx}`} style={{ display: 'grid', gridTemplateColumns: `repeat(${heatmapCalendar.weeks.length}, 14px)`, gap: '3px' }}>
                        {heatmapCalendar.weeks.map((week, weekIdx) => {
                          const day = week.days[rowIdx]
                          const dayStats = heatmapData.dayMap[day.iso]
                          const style = heatmapCellStyle(dayStats, day.inYear)
                          const clickable = Boolean(day.inYear && dayStats?.tradeCount > 0)
                          return (
                            <button
                              key={`day-${rowIdx}-${weekIdx}`}
                              type="button"
                              onMouseEnter={e => onHeatmapHover(day, e)}
                              onMouseMove={e => onHeatmapHover(day, e)}
                              onFocus={e => onHeatmapHover(day, e)}
                              onBlur={() => setHeatmapHover(null)}
                              onClick={() => {
                                if (!clickable) return
                                router.push(`/trade-log?date=${day.iso}`)
                              }}
                              style={{
                                width: '14px',
                                height: '14px',
                                borderRadius: '3px',
                                background: style.background,
                                border: style.border,
                                opacity: style.opacity,
                                padding: 0,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: clickable ? 'pointer' : 'default',
                                transform: heatmapHover?.dayInfo?.iso === day.iso ? 'scale(1.3)' : 'scale(1)',
                                transition: 'transform 0.15s ease, opacity 0.15s ease',
                              }}
                            >
                              {style.dot ? <span style={{ width: '3px', height: '3px', borderRadius: '99px', background: 'rgba(255,255,255,0.75)' }} /> : null}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {showHeatmapEmptyOverlay ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ pointerEvents: 'auto', textAlign: 'center', background: 'rgba(9,11,20,0.82)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', maxWidth: '460px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 650, marginBottom: '4px' }}>No trades in {effectiveHeatmapYear}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '10px', lineHeight: 1.55 }}>
                    Log trades for this year (with optional A–F grades) to see your rule adherence heatmap here.
                  </div>
                  <a href="/new-trade" style={{ pointerEvents: 'auto', fontSize: '12px', textDecoration: 'none', borderRadius: '8px', border: '1px solid rgba(124,58,237,0.45)', background: 'rgba(124,58,237,0.2)', color: 'var(--text)', padding: '7px 11px', fontWeight: 600 }}>
                    Log a Trade →
                  </a>
                </div>
              </div>
            ) : null}

            {heatmapHover?.dayInfo?.inYear ? (() => {
              const iso = heatmapHover.dayInfo.iso
              const dateLabel = new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
              const dayStats = heatmapData.dayMap[iso]
              const score = dayStats?.score != null ? `${Math.round(dayStats.score)}%` : null
              return (
                <div
                  style={{
                    position: 'absolute',
                    left: `${Math.max(10, heatmapHover.left)}px`,
                    top: `${Math.max(10, heatmapHover.top)}px`,
                    minWidth: '240px',
                    maxWidth: '300px',
                    zIndex: 20,
                    background: 'rgba(13,16,26,0.96)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: '8px',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.38)',
                    padding: '10px 12px',
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '8px', fontWeight: 600 }}>{dateLabel}</div>
                  {!dayStats || dayStats.tradeCount === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text3)' }}>No trades this day</div>
                  ) : !dayStats.hasRatings || dayStats.ratingCount === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{dayStats.tradeCount} trades — not yet rated</div>
                  ) : (
                    <div style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                      <div style={{ color: 'var(--text2)' }}>{dayStats.tradeCount} trades taken</div>
                      <div style={{ color: 'var(--text2)' }}>Adherence score: <strong style={{ color: 'var(--text)' }}>{score}</strong></div>
                      <div style={{ color: 'var(--text2)' }}>Best rule: <strong style={{ color: '#22C55E' }}>{dayStats.bestRule || '—'}</strong></div>
                      <div style={{ color: 'var(--text2)' }}>Weakest rule: <strong style={{ color: '#EF4444' }}>{dayStats.weakestRule || '—'}</strong></div>
                      <div style={{ color: 'var(--text3)', marginTop: '2px' }}>Tap to view trades</div>
                    </div>
                  )}
                </div>
              )
            })() : null}
          </div>

          <div
            style={{
              marginTop: '12px',
              borderRadius: '8px',
              border: '1px dashed rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.03)',
              padding: '10px 12px',
              fontSize: '11px',
              fontFamily: 'monospace',
              color: 'var(--text3)',
              lineHeight: 1.6,
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--text2)', marginBottom: '6px' }}>Heatmap debug (temporary)</div>
            <div>Total trades found: {heatmapData.heatmapDebug?.totalTrades ?? 0}</div>
            <div>Trades with detailed ratings: {heatmapData.heatmapDebug?.tradesWithDetailedRatings ?? 0}</div>
            <div>Trades with overall grade only: {heatmapData.heatmapDebug?.tradesWithOverallGradeOnly ?? 0}</div>
            <div>Unrated trades: {heatmapData.heatmapDebug?.unratedTrades ?? 0}</div>
            <div>Date range: {heatmapData.heatmapDebug?.dateRange ?? '—'}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', marginTop: '14px' }}>
            <div style={{ ...panelStyle, padding: '12px', borderLeft: '3px solid rgba(34,197,94,0.7)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Overall Adherence Score</div>
              <div style={{ fontSize: '26px', fontWeight: 700, marginTop: '6px', color: (heatmapData.overallAdherence ?? 0) >= 70 ? '#22C55E' : (heatmapData.overallAdherence ?? 0) >= 45 ? '#EAB308' : '#EF4444' }}>
                {heatmapData.overallAdherence != null ? `${Math.round(heatmapData.overallAdherence)}%` : '—'}
              </div>
            </div>
            <div style={{ ...panelStyle, padding: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Most Disciplined Day</div>
              <div style={{ fontSize: '17px', fontWeight: 650, marginTop: '8px', color: 'var(--text)' }}>
                {heatmapData.bestWeekday ? `${heatmapData.bestWeekday.name} — ${Math.round(heatmapData.bestWeekday.avg)}% avg` : '—'}
              </div>
            </div>
            <div style={{ ...panelStyle, padding: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Least Disciplined Day</div>
              <div style={{ fontSize: '17px', fontWeight: 650, marginTop: '8px', color: 'var(--text)' }}>
                {heatmapData.worstWeekday ? `${heatmapData.worstWeekday.name} — ${Math.round(heatmapData.worstWeekday.avg)}% avg` : '—'}
              </div>
            </div>
            <div style={{ ...panelStyle, padding: '12px', borderLeft: '3px solid rgba(239,68,68,0.7)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Most Broken Rule</div>
              <div style={{ fontSize: '16px', fontWeight: 650, marginTop: '8px', color: 'var(--text)' }}>
                {heatmapData.mostBrokenRule ? `${heatmapData.mostBrokenRule.criterion} — ${Math.round(heatmapData.mostBrokenRule.avg)}% avg` : '—'}
              </div>
            </div>
          </div>

          <div style={{ ...panelStyle, marginTop: '12px', padding: '12px' }}>
            <div style={{ ...panelTitleStyle, marginBottom: '8px' }}>Rule Breakdown</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Rule</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Total Ratings</th>
                    <th style={thStyle}>Grade Distribution</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Average Score</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Trend (30d)</th>
                  </tr>
                </thead>
                <tbody>
                  {heatmapData.ruleRows.map(row => {
                    const total = Math.max(row.totalRatings, 1)
                    const pct = key => (row.gradeCounts[key] / total) * 100
                    const trendColor = row.trend === 'up' ? '#22C55E' : row.trend === 'down' ? '#EF4444' : 'var(--text3)'
                    const trendSymbol = row.trend === 'up' ? '↑' : row.trend === 'down' ? '↓' : '→'
                    return (
                      <tr key={row.criterion} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={tdStyle}>{row.criterion}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{row.totalRatings}</td>
                        <td style={{ ...tdStyle, minWidth: '180px' }}>
                          <div style={{ height: '10px', width: '100%', borderRadius: '999px', border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', background: 'var(--page-bg)' }}>
                            <span style={{ width: `${pct('A')}%`, background: 'rgba(34,197,94,0.9)' }} />
                            <span style={{ width: `${pct('B')}%`, background: 'rgba(34,197,94,0.6)' }} />
                            <span style={{ width: `${pct('C')}%`, background: 'rgba(234,179,8,0.65)' }} />
                            <span style={{ width: `${pct('D')}%`, background: 'rgba(239,68,68,0.55)' }} />
                            <span style={{ width: `${pct('F')}%`, background: 'rgba(239,68,68,0.85)' }} />
                          </div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{Math.round(row.avg)}%</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: trendColor, fontWeight: 700 }}>{trendSymbol}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {heatmapData.ruleRows.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: '12px', padding: '12px 2px' }}>No rule ratings yet for this year and account.</div> : null}
            </div>
          </div>
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
