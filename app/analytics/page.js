'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getAccountsForUser } from '@/lib/getAccountsForUser'
import { getTradesForUser } from '@/lib/getTradesForUser'

const GREEN = '#22C55E'
const RED = '#EF4444'

function asNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function fmtPnl(n) {
  const v = Number(n || 0)
  const sign = v >= 0 ? '+$' : '-$'
  return sign + Math.abs(v).toFixed(2)
}

function pnlColor(n) {
  return asNum(n) >= 0 ? GREEN : RED
}

function fmtPct(n) {
  return `${Number(n).toFixed(1)}%`
}

function fmtAxisCurrency(n) {
  const v = Number(n || 0)
  const abs = Math.abs(v)
  if (abs >= 1000) return `${v < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}k`
  return `${v < 0 ? '-' : ''}$${abs.toFixed(0)}`
}

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

export default function AnalyticsPage() {
  const [trades, setTrades] = useState([])
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('all')
  const [loading, setLoading] = useState(true)
  const [hoverPoint, setHoverPoint] = useState(null)
  const [hoverDailyIndex, setHoverDailyIndex] = useState(null)
  const svgRef = useRef(null)

  const [tier, setTier] = useState('basic') // 'basic' | 'advanced'
  const [accent, setAccent] = useState('#7C3AED')

  useEffect(() => {
    const lsAccent = typeof window !== 'undefined' ? window.localStorage.getItem('accentColor') : null
    const nextAccent = lsAccent || '#7C3AED'
    setAccent(nextAccent)
    document.documentElement.style.setProperty('--accent', nextAccent)
  }, [])

  useEffect(() => {
    fetchAccounts()
    fetchTrades()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const filtered = useMemo(() => {
    return trades.filter(t => selectedAccount === 'all' || t.account_id === selectedAccount)
  }, [trades, selectedAccount])

  const filteredSorted = useMemo(() => {
    return [...filtered].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }, [filtered])

  const wins = useMemo(() => filtered.filter(t => t.status === 'Win'), [filtered])
  const losses = useMemo(() => filtered.filter(t => t.status === 'Loss'), [filtered])

  const totalTrades = filtered.length
  const totalPnl = useMemo(() => filtered.reduce((s, t) => s + asNum(t.net_pnl), 0), [filtered])
  const grossWin = useMemo(() => wins.reduce((s, t) => s + asNum(t.net_pnl), 0), [wins])
  const grossLoss = useMemo(() => Math.abs(losses.reduce((s, t) => s + asNum(t.net_pnl), 0)), [losses])

  const pf = useMemo(() => (grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : '∞'), [grossWin, grossLoss])
  const wr = useMemo(() => (totalTrades ? (wins.length / totalTrades) * 100 : 0), [wins.length, totalTrades])
  const avgRR = useMemo(() => {
    const rrTrades = filtered.filter(t => t.actual_rr !== null && t.actual_rr !== undefined && t.actual_rr !== '')
    if (!rrTrades.length) return '—'
    const sum = rrTrades.reduce((s, t) => s + asNum(t.actual_rr), 0)
    return (sum / rrTrades.length).toFixed(2)
  }, [filtered])
  const expectancy = useMemo(() => (totalTrades ? totalPnl / totalTrades : 0), [totalPnl, totalTrades])

  const avgWin = wins.length ? grossWin / wins.length : 0
  const avgLoss = losses.length ? grossLoss / losses.length : 0

  // Equity curve points
  const eqPoints = useMemo(() => {
    let cum = 0
    return filteredSorted.map((t, i) => {
      cum += asNum(t.net_pnl)
      return {
        x: i,
        y: cum,
        pnl: asNum(t.net_pnl),
        date: t.date?.slice(0, 10),
      }
    })
  }, [filteredSorted])

  const eqW = 520
  const eqH = 140
  const eqPad = { left: 58, right: 8, top: 8, bottom: 24 }
  const eqPlotW = eqW - eqPad.left - eqPad.right
  const eqPlotH = eqH - eqPad.top - eqPad.bottom
  const eqRange = useMemo(() => {
    if (!eqPoints.length) return { minV: 0, maxV: 0, range: 1 }
    const ys = eqPoints.map(p => p.y)
    const minV = Math.min(0, ...ys)
    const maxV = Math.max(0, ...ys)
    const range = maxV - minV || 1
    return { minV, maxV, range }
  }, [eqPoints])

  const toCoord = p => {
    const x = eqPoints.length > 1 ? eqPad.left + (p.x / (eqPoints.length - 1)) * eqPlotW : eqPad.left + eqPlotW / 2
    const y = eqPad.top + (1 - ((p.y - eqRange.minV) / eqRange.range)) * eqPlotH
    return { x, y }
  }

  function handleSvgMouseMove(e) {
    if (!svgRef.current || eqPoints.length < 2) return
    const rect = svgRef.current.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * eqW
    const ratio = (mouseX - eqPad.left) / Math.max(eqPlotW, 1)
    const idx = Math.round(ratio * (eqPoints.length - 1))
    const clamped = Math.max(0, Math.min(eqPoints.length - 1, idx))
    setHoverPoint({ ...eqPoints[clamped], ...toCoord(eqPoints[clamped]) })
  }

  // Daily PnL (Basic)
  const dailyData = useMemo(() => {
    const dailyMap = {}
    filteredSorted.forEach(t => {
      const d = t.date?.slice(0, 10)
      if (!d) return
      dailyMap[d] = (dailyMap[d] || 0) + asNum(t.net_pnl)
    })
    return Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredSorted])

  const barMaxAbs = Math.max(...dailyData.map(([, v]) => Math.abs(v)), 1)
  const dW = 520
  const dH = 92
  const dPad = { left: 58, right: 8, top: 8, bottom: 22 }
  const dPlotW = dW - dPad.left - dPad.right
  const dPlotH = dH - dPad.top - dPad.bottom
  const dMidY = dPad.top + dPlotH / 2
  const eqTicksY = buildLinearTicks(eqRange.minV, eqRange.maxV, 5)
  const eqTicksX = buildIndexTicks(eqPoints.length, 4)
  const dailyTicksX = buildIndexTicks(dailyData.length, 4)
  const barWidth = dailyData.length > 0 ? Math.min(Math.floor(dW / dailyData.length) - 3, 34) : 20

  const r = 36
  const circ = 2 * Math.PI * r
  const winDash = (wr / 100) * circ

  const s = {
    page: {
      minHeight: '100vh',
      background: 'var(--page-bg)',
      color: 'var(--text)',
      padding: '20px 24px',
      fontFamily: 'sans-serif',
    },
    card: {
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '14px 16px',
    },
    panelTitle: {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: 'var(--text2)',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      marginBottom: '10px',
    },
    label: {
      fontSize: '9px',
      fontFamily: 'monospace',
      color: 'var(--text3)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: '5px',
    },
  }

  // Advanced computations
  const sessions = ['London', 'New York', 'Asian']
  const sessionData = useMemo(() => {
    return sessions.map(name => {
      const st = filteredSorted.filter(t => t.session === name)
      const winCount = st.filter(t => t.status === 'Win').length
      const pnl = st.reduce((sum, t) => sum + asNum(t.net_pnl), 0)
      const winRate = st.length ? (winCount / st.length) * 100 : 0
      return { name, trades: st.length, wins: winCount, winRate, pnl }
    })
  }, [filteredSorted])

  const dowData = useMemo(() => {
    const dowMap = {}
    filteredSorted.forEach(t => {
      if (!t.date) return
      const dow = new Date(t.date + 'T00:00:00').getDay()
      const name = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow]
      if (!dowMap[name]) dowMap[name] = { pnl: 0, trades: 0 }
      dowMap[name].pnl += asNum(t.net_pnl)
      dowMap[name].trades += 1
    })
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => ({
      name: d,
      pnl: dowMap[d]?.pnl || 0,
      trades: dowMap[d]?.trades || 0,
    }))
  }, [filteredSorted])

  const gradeDistribution = useMemo(() => {
    const grades = ['A', 'B', 'C', 'D', 'F']
    const res = grades.map(g => {
      const cnt = filteredSorted.filter(t => t.trade_grade === g).length
      const pct = totalTrades ? (cnt / totalTrades) * 100 : 0
      return { grade: g, count: cnt, pct }
    })
    return res
  }, [filteredSorted, totalTrades])

  const drawdownMetrics = useMemo(() => {
    if (!eqPoints.length) {
      return { maxDrawdown: 0, avgDrawdown: 0, recoveryFactor: '—', longestLosingStreak: 0 }
    }

    let peak = -Infinity
    let maxDD = 0 // magnitude
    let sumDD = 0
    let ddCount = 0

    for (const p of eqPoints) {
      peak = Math.max(peak, p.y)
      const dd = peak - p.y // magnitude >= 0
      if (dd > 0) {
        maxDD = Math.max(maxDD, dd)
        sumDD += dd
        ddCount += 1
      }
    }

    const avgDrawdown = ddCount ? sumDD / ddCount : 0
    const recoveryFactor = maxDD > 0 ? totalPnl / maxDD : Infinity
    const longestLosingStreak = computeWorstLosingStreak(filteredSorted)

    return {
      maxDrawdown: maxDD,
      avgDrawdown,
      recoveryFactor,
      longestLosingStreak,
    }
  }, [eqPoints, filteredSorted, totalPnl])

  const streakMetrics = useMemo(() => {
    return computeStreakMetrics(filteredSorted)
  }, [filteredSorted])

  const symbolStats = useMemo(() => {
    const map = {}
    filteredSorted.forEach(t => {
      const sym = t.symbol || '—'
      if (!map[sym]) map[sym] = { symbol: sym, trades: 0, wins: 0, pnl: 0 }
      map[sym].trades += 1
      if (t.status === 'Win') map[sym].wins += 1
      map[sym].pnl += asNum(t.net_pnl)
    })
    const rows = Object.values(map).map(r => ({
      ...r,
      winRate: r.trades ? (r.wins / r.trades) * 100 : 0,
    }))
    rows.sort((a, b) => b.pnl - a.pnl)
    return rows
  }, [filteredSorted])

  function computeWorstLosingStreak(list) {
    let lossStreak = 0
    let worst = 0
    for (const t of list) {
      if (t.status === 'Loss') {
        lossStreak += 1
        worst = Math.max(worst, lossStreak)
      } else {
        lossStreak = 0
      }
    }
    return worst
  }

  function computeStreakMetrics(list) {
    let winStreak = 0
    let lossStreak = 0
    let bestWin = 0
    let worstLoss = 0

    for (const t of list) {
      if (t.status === 'Win') {
        winStreak += 1
        bestWin = Math.max(bestWin, winStreak)
        lossStreak = 0
      } else if (t.status === 'Loss') {
        lossStreak += 1
        worstLoss = Math.max(worstLoss, lossStreak)
        winStreak = 0
      } else {
        winStreak = 0
        lossStreak = 0
      }
    }

    // Current streak at the end of the dataset
    let currentType = 'None'
    let currentCount = 0
    const last = list[list.length - 1]
    if (last?.status === 'Win') currentType = 'Win'
    if (last?.status === 'Loss') currentType = 'Loss'

    if (currentType !== 'None') {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (list[i].status === currentType) currentCount += 1
        else break
      }
    }

    return { currentType, currentCount, bestWin, worstLoss }
  }

  const tierToggle = (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
      <button
        type="button"
        onClick={() => setTier('basic')}
        style={{
          borderRadius: '10px',
          border: tier === 'basic' ? `1px solid ${accent}` : '1px solid var(--border)',
          background: tier === 'basic' ? 'rgba(124,58,237,0.12)' : 'var(--bg3)',
          color: 'var(--text)',
          padding: '10px 16px',
          fontSize: '13px',
          fontFamily: 'monospace',
          cursor: 'pointer',
          minWidth: '140px',
        }}
      >
        Basic
      </button>
      <button
        type="button"
        onClick={() => setTier('advanced')}
        style={{
          borderRadius: '10px',
          border: tier === 'advanced' ? `1px solid ${accent}` : '1px solid var(--border)',
          background: tier === 'advanced' ? 'rgba(124,58,237,0.12)' : 'var(--bg3)',
          color: 'var(--text)',
          padding: '10px 16px',
          fontSize: '13px',
          fontFamily: 'monospace',
          cursor: 'pointer',
          minWidth: '160px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
        }}
      >
        <span>Advanced</span>
        <span
          style={{
            fontSize: '10px',
            fontFamily: 'monospace',
            borderRadius: '999px',
            padding: '3px 10px',
            border: '1px solid rgba(245,158,11,0.55)',
            background: 'rgba(245,158,11,0.15)',
            color: '#F59E0B',
          }}
        >
          PRO
        </span>
      </button>
    </div>
  )

  const basicKpis = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '8px', marginBottom: '16px' }}>
      {[
        { label: 'Net P&L', value: fmtPnl(totalPnl), color: pnlColor(totalPnl), primary: true },
        { label: 'Profit Factor', value: pf, color: 'var(--text)' },
        { label: 'Win Rate', value: fmtPct(wr), color: accent },
        { label: 'Avg RR', value: avgRR === '—' ? avgRR : `${avgRR}R`, color: 'var(--text)' },
        { label: 'Expectancy', value: fmtPnl(expectancy), color: pnlColor(expectancy), primary: true },
        { label: 'Total Trades', value: totalTrades, color: 'var(--text)' },
      ].map((k, i) => (
        <div
          key={i}
          style={{
            ...s.card,
            position: 'relative',
            overflow: 'hidden',
            borderColor: k.primary ? 'rgba(124,58,237,0.45)' : 'var(--border)',
          }}
        >
          {k.primary && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: accent }} />}
          <div style={s.label}>{k.label}</div>
          <div style={{ fontSize: '17px', fontFamily: 'monospace', fontWeight: 500, color: k.color }}>{k.value}</div>
        </div>
      ))}
    </div>
  )

  const equityCard = (
    <div style={s.card}>
      <div style={s.panelTitle}>Equity Curve — hover to inspect</div>
      {eqPoints.length > 1 ? (
        <div style={{ position: 'relative' }}>
          <svg
            ref={svgRef}
            width="100%"
            viewBox={`0 0 ${eqW} ${eqH}`}
            preserveAspectRatio="none"
            style={{ display: 'block', cursor: 'crosshair' }}
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={() => setHoverPoint(null)}
          >
            <line x1={eqPad.left} y1={eqPad.top + eqPlotH} x2={eqPad.left + eqPlotW} y2={eqPad.top + eqPlotH} stroke="var(--border-md)" strokeWidth="0.8" />
            <line x1={eqPad.left} y1={eqPad.top} x2={eqPad.left} y2={eqPad.top + eqPlotH} stroke="var(--border-md)" strokeWidth="0.8" />
            {eqTicksY.map((t, i) => {
              const y = eqPad.top + (1 - ((t - eqRange.minV) / (eqRange.maxV - eqRange.minV || 1))) * eqPlotH
              return (
                <g key={`eq-grid-${i}`}>
                  <line x1={eqPad.left} y1={y} x2={eqPad.left + eqPlotW} y2={y} stroke="var(--border)" strokeWidth="0.5" />
                  <text x={eqPad.left - 7} y={y + 3} textAnchor="end" fontSize="8.5" fill="var(--text3)" fontFamily="monospace">{fmtAxisCurrency(t)}</text>
                </g>
              )
            })}
            {eqPoints.slice(1).map((pt, i) => {
              const prev = eqPoints[i]
              const c1 = toCoord(prev)
              const c2 = toCoord(pt)
              const isUp = pt.y >= prev.y
              return (
                <line
                  key={i}
                  x1={c1.x}
                  y1={c1.y}
                  x2={c2.x}
                  y2={c2.y}
                  stroke={isUp ? GREEN : RED}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              )
            })}
            {hoverPoint && (
              <>
                <line x1={hoverPoint.x} y1={eqPad.top} x2={hoverPoint.x} y2={eqPad.top + eqPlotH} stroke="var(--text3)" strokeWidth="0.8" strokeDasharray="3 3" />
                <circle cx={hoverPoint.x} cy={hoverPoint.y} r="5" fill={hoverPoint.pnl >= 0 ? GREEN : RED} stroke="var(--card-bg)" strokeWidth="2" />
              </>
            )}
            {eqTicksX.map((idx) => {
              const x = eqPad.left + (eqPoints.length > 1 ? (idx / (eqPoints.length - 1)) * eqPlotW : 0)
              return (
                <text key={`eq-date-${idx}`} x={x} y={eqPad.top + eqPlotH + 13} textAnchor="middle" fontSize="8.5" fill="var(--text3)" fontFamily="monospace">
                  {formatDateTick(eqPoints[idx]?.date)}
                </text>
              )
            })}
          </svg>

          {hoverPoint && (
            <div
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'var(--bg3)',
                border: '1px solid var(--border-md)',
                borderRadius: '8px',
                padding: '8px 12px',
                pointerEvents: 'none',
                minWidth: '140px',
              }}
            >
              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginBottom: '4px' }}>{hoverPoint.date}</div>
              <div style={{ fontSize: '13px', fontFamily: 'monospace', fontWeight: 500, color: pnlColor(hoverPoint.pnl), marginBottom: '2px' }}>
                {fmtPnl(hoverPoint.pnl)} this trade
              </div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: pnlColor(hoverPoint.y) }}>Cumulative: {fmtPnl(hoverPoint.y)}</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)', fontSize: '12px', fontFamily: 'monospace' }}>
          Log more trades to see your equity curve
        </div>
      )}
    </div>
  )

  const winLossCard = (
    <div style={s.card}>
      <div style={s.panelTitle}>Win / Loss Split</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '10px 0' }}>
        <svg width="88" height="88" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(239,68,68,0.25)" strokeWidth="8" />
          <circle
            cx="44"
            cy="44"
            r={r}
            fill="none"
            stroke={GREEN}
            strokeWidth="8"
            strokeDasharray={`${winDash} ${circ - winDash}`}
            strokeLinecap="round"
            transform="rotate(-90 44 44)"
          />
          <text x="44" y="48" textAnchor="middle" fontFamily="monospace" fontSize="13" fontWeight="500" fill="var(--text)">
            {wr.toFixed(1)}%
          </text>
        </svg>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '16px', fontFamily: 'monospace', fontWeight: 500, color: GREEN }}>{wins.length} Wins</div>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)' }}>avg {avgWin >= 0 ? '+' : '-'}${Math.abs(avgWin).toFixed(2)}</div>
          </div>
          <div>
            <div style={{ fontSize: '16px', fontFamily: 'monospace', fontWeight: 500, color: RED }}>{losses.length} Losses</div>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)' }}>avg -${avgLoss.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  )

  const dailyCard = (
    <div style={s.card}>
      <div style={s.panelTitle}>Daily P&L</div>
      {dailyData.length > 0 ? (
        <div style={{ position: 'relative' }}>
          {hoverDailyIndex !== null && dailyData[hoverDailyIndex] && (
            <div
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'var(--bg3)',
                border: '1px solid var(--border-md)',
                borderRadius: '8px',
                padding: '8px 12px',
                pointerEvents: 'none',
                minWidth: '130px',
              }}
            >
              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginBottom: '4px' }}>{dailyData[hoverDailyIndex][0]}</div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: pnlColor(dailyData[hoverDailyIndex][1]), marginBottom: '2px' }}>
                Day: {fmtPnl(dailyData[hoverDailyIndex][1])}
              </div>
            </div>
          )}

          <svg
            width="100%"
            viewBox={`0 0 ${dW} ${dH}`}
            preserveAspectRatio="none"
            style={{ cursor: 'crosshair' }}
            onMouseMove={e => {
              const rect = e.currentTarget.getBoundingClientRect()
              const rawX = ((e.clientX - rect.left) / rect.width) * dW
              const ratio = (rawX - dPad.left) / Math.max(dPlotW, 1)
              const idx = Math.max(0, Math.min(dailyData.length - 1, Math.floor(ratio * dailyData.length)))
              setHoverDailyIndex(idx)
            }}
            onMouseLeave={() => setHoverDailyIndex(null)}
          >
            <line x1={dPad.left} y1={dPad.top + dPlotH} x2={dPad.left + dPlotW} y2={dPad.top + dPlotH} stroke="var(--border-md)" strokeWidth="0.8" />
            <line x1={dPad.left} y1={dPad.top} x2={dPad.left} y2={dPad.top + dPlotH} stroke="var(--border-md)" strokeWidth="0.8" />
            <line x1={dPad.left} y1={dMidY} x2={dPad.left + dPlotW} y2={dMidY} stroke="var(--border)" strokeWidth="0.8" />
            <text x={dPad.left - 7} y={dPad.top + 3} textAnchor="end" fontSize="8.5" fill="var(--text3)" fontFamily="monospace">{fmtAxisCurrency(barMaxAbs)}</text>
            <text x={dPad.left - 7} y={dMidY + 3} textAnchor="end" fontSize="8.5" fill="var(--text3)" fontFamily="monospace">$0</text>
            <text x={dPad.left - 7} y={dPad.top + dPlotH + 3} textAnchor="end" fontSize="8.5" fill="var(--text3)" fontFamily="monospace">{fmtAxisCurrency(-barMaxAbs)}</text>
            {dailyData.map(([, val], i) => {
              const slotW = dPlotW / Math.max(dailyData.length, 1)
              const x = dPad.left + i * slotW + (slotW - barWidth) / 2
              const bh = Math.max((Math.abs(val) / barMaxAbs) * (dPlotH / 2 - 4), 2)
              const isPos = val >= 0
              return (
                <rect
                  key={i}
                  x={x}
                  y={isPos ? dMidY - bh : dMidY}
                  width={barWidth}
                  height={bh}
                  rx="2"
                  fill={isPos ? GREEN : RED}
                  opacity={hoverDailyIndex === null || hoverDailyIndex === i ? 0.9 : 0.4}
                />
              )
            })}
            {dailyTicksX.map((idx) => {
              const x = dPad.left + (dailyData.length > 1 ? (idx / (dailyData.length - 1)) * dPlotW : 0)
              return (
                <text key={`daily-date-${idx}`} x={x} y={dPad.top + dPlotH + 13} textAnchor="middle" fontSize="8.5" fill="var(--text3)" fontFamily="monospace">
                  {formatDateTick(dailyData[idx]?.[0])}
                </text>
              )
            })}
          </svg>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)', fontSize: '12px', fontFamily: 'monospace' }}>
          No data yet
        </div>
      )}
    </div>
  )

  const advancedPanels = (
    <>
      {/* Session + Day of week */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px', marginBottom: '12px' }}>
        <div style={s.card}>
          <div style={s.panelTitle}>Performance by Session</div>
          {sessionData.some(x => x.trades > 0) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sessionData.map(row => {
                const maxAbs = Math.max(...sessionData.map(s => Math.abs(s.pnl)), 1)
                const pct = (Math.abs(row.pnl) / maxAbs) * 100
                const barColor = row.pnl >= 0 ? GREEN : RED
                return (
                  <div key={row.name} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text2)' }}>{row.name}</span>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', color: pnlColor(row.pnl) }}>
                        {row.trades ? `${row.trades} trades · ${row.winRate.toFixed(0)}% WR · ${fmtPnl(row.pnl)}` : '—'}
                      </span>
                    </div>
                    <div style={{ height: '14px', background: 'var(--bg3)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '4px', opacity: 0.85 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '22px', color: 'var(--text3)', fontFamily: 'monospace', fontSize: '12px' }}>
              No session data yet
            </div>
          )}
        </div>

        <div style={s.card}>
          <div style={s.panelTitle}>Performance by Day of Week</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {dowData.map(row => {
              const maxAbs = Math.max(...dowData.map(x => Math.abs(x.pnl)), 1)
              const pct = (Math.abs(row.pnl) / maxAbs) * 100
              const barColor = row.pnl >= 0 ? GREEN : RED
              return (
                <div key={row.name} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text2)' }}>{row.name}</span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: pnlColor(row.pnl) }}>
                      {row.trades ? `${row.trades} trades · ${fmtPnl(row.pnl)}` : '—'}
                    </span>
                  </div>
                  <div style={{ height: '14px', background: 'var(--bg3)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '4px', opacity: 0.85 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Trade grade + Drawdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div style={s.card}>
          <div style={s.panelTitle}>Trade Grade Distribution</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {gradeDistribution.map(g => {
              const colors = { A: GREEN, B: '#4ADE80', C: '#EAB308', D: '#F97316', F: RED }
              return (
                <div key={g.grade} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text2)' }}>{g.grade}</span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)' }}>
                      {g.count ? `${Math.round(g.pct)}% · ${g.count} trades` : '—'}
                    </span>
                  </div>
                  <div style={{ height: '14px', background: 'var(--bg3)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${g.pct}%`, height: '100%', background: colors[g.grade], borderRadius: '4px', opacity: 0.9 }} />
                  </div>
                </div>
              )
            })}
          </div>
          {filteredSorted.filter(t => t.trade_grade).length === 0 && (
            <div style={{ textAlign: 'center', padding: '18px', color: 'var(--text3)', fontFamily: 'monospace', fontSize: '12px' }}>
              Grade your trades to see distribution
            </div>
          )}
        </div>

        <div style={s.card}>
          <div style={s.panelTitle}>Drawdown Analysis</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <Stat
              title="Max drawdown"
              value={drawdownMetrics.maxDrawdown ? fmtPnl(-drawdownMetrics.maxDrawdown) : '—'}
              valueColor={drawdownMetrics.maxDrawdown ? RED : 'var(--text3)'}
            />
            <Stat
              title="Longest losing streak"
              value={drawdownMetrics.longestLosingStreak || 0}
              valueColor={drawdownMetrics.longestLosingStreak ? RED : 'var(--text3)'}
            />
            <Stat
              title="Average drawdown"
              value={drawdownMetrics.avgDrawdown ? fmtPnl(-drawdownMetrics.avgDrawdown) : '—'}
              valueColor={drawdownMetrics.avgDrawdown ? RED : 'var(--text3)'}
            />
            <Stat
              title="Recovery factor"
              value={Number.isFinite(drawdownMetrics.recoveryFactor) ? drawdownMetrics.recoveryFactor.toFixed(2) : '∞'}
              valueColor={'var(--text)'}
            />
          </div>
        </div>
      </div>

      {/* Streak tracker */}
      <div style={{ marginBottom: '12px' }}>
        <div style={s.card}>
          <div style={s.panelTitle}>Streak Tracker</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: '10px',
                background: 'var(--bg3)',
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Current streak
              </div>
              <div
                style={{
                  fontSize: '18px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: streakMetrics.currentType === 'Win' ? GREEN : streakMetrics.currentType === 'Loss' ? RED : 'var(--text3)',
                  marginTop: '6px',
                }}
              >
                {streakMetrics.currentType === 'None' ? 'No streak' : `${streakMetrics.currentCount} ${streakMetrics.currentType} Streak`}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Stat title="Best winning streak" value={streakMetrics.bestWin} valueColor={GREEN} />
              <Stat title="Worst losing streak" value={streakMetrics.worstLoss} valueColor={RED} />
            </div>
          </div>
        </div>
      </div>

      {/* Symbols */}
      <div style={{ ...s.card, marginBottom: '12px' }}>
        <div style={s.panelTitle}>Best & Worst Symbols</div>
        {symbolStats.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', padding: '10px 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Symbol
                  </th>
                  <th style={{ textAlign: 'right', fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', padding: '10px 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Trades
                  </th>
                  <th style={{ textAlign: 'right', fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', padding: '10px 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Win rate
                  </th>
                  <th style={{ textAlign: 'right', fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', padding: '10px 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Net P&L
                  </th>
                </tr>
              </thead>
              <tbody>
                {symbolStats.map(row => (
                  <tr key={row.symbol} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '10px 6px', fontFamily: 'monospace', color: 'var(--text)' }}>{row.symbol}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text2)' }}>{row.trades}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text2)' }}>{row.winRate.toFixed(1)}%</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontFamily: 'monospace', color: pnlColor(row.pnl) }}>
                      {fmtPnl(row.pnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '22px', color: 'var(--text3)', fontFamily: 'monospace', fontSize: '12px' }}>No symbol data yet</div>
        )}
      </div>
    </>
  )

  // Helper component inside file
  function Stat({ title, value, valueColor }) {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg3)', padding: '12px 14px' }}>
        <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </div>
        <div style={{ marginTop: '6px', fontSize: '18px', fontFamily: 'monospace', fontWeight: 800, color: valueColor }}>{value}</div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
            Analytics
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>Performance Overview</h1>
        </div>

        <select
          value={selectedAccount}
          onChange={e => setSelectedAccount(e.target.value)}
          style={{
            background: 'var(--bg3)',
            border: '1px solid var(--border-md)',
            borderRadius: '7px',
            color: 'var(--text)',
            fontFamily: 'monospace',
            fontSize: '12px',
            padding: '6px 12px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="all">All Accounts</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {tierToggle}

      {basicKpis}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
        {equityCard}
        {winLossCard}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginBottom: '12px' }}>{dailyCard}</div>

      {tier === 'advanced' ? advancedPanels : null}

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)', fontFamily: 'monospace', fontSize: '12px' }}>
          Loading...
        </div>
      )}
    </div>
  )
}