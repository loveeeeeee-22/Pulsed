'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getAccountsForUser } from '@/lib/getAccountsForUser'

export default function CalendarPage() {
  const [trades, setTrades] = useState([])
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('all')
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 1))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAccounts()
    fetchTrades()
  }, [])

  async function fetchAccounts() {
    const data = await getAccountsForUser()
    setAccounts(data)
  }

  async function fetchTrades() {
    setLoading(true)
    const { data } = await supabase
      .from('trades')
      .select('*')
      .order('date', { ascending: true })
    if (data) setTrades(data)
    setLoading(false)
  }

  const filteredTrades = trades.filter(t =>
    selectedAccount === 'all' || t.account_id === selectedAccount
  )

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const monthNames = ['January','February','March','April','May','June',
    'July','August','September','October','November','December']

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)) }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)) }

  // Build day map — normalize date strings
  const dayMap = {}
  filteredTrades.forEach(t => {
    if (!t.date) return
    const dateStr = t.date.slice(0, 10)
    if (!dayMap[dateStr]) dayMap[dateStr] = { pnl: 0, count: 0 }
    dayMap[dateStr].pnl += parseFloat(t.net_pnl || 0)
    dayMap[dateStr].count++
  })

  // Month stats
  const monthTrades = filteredTrades.filter(t => {
    if (!t.date) return false
    const d = new Date(t.date)
    return d.getFullYear() === year && d.getMonth() === month
  })

  const monthPnl = monthTrades.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0)

  const profitDays = Object.entries(dayMap).filter(([d, v]) => {
    const dt = new Date(d + 'T00:00:00')
    return dt.getFullYear() === year && dt.getMonth() === month && v.pnl > 0
  }).length

  const lossDays = Object.entries(dayMap).filter(([d, v]) => {
    const dt = new Date(d + 'T00:00:00')
    return dt.getFullYear() === year && dt.getMonth() === month && v.pnl < 0
  }).length

  // Build calendar — Monday start, 5 days only (Mon-Fri)
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()

  // 0=Sun,1=Mon...6=Sat → convert to Mon=0
  const firstDow = firstDayOfMonth.getDay()
  const startOffset = firstDow === 0 ? 6 : firstDow - 1

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  // Build full grid including weekends but only display Mon-Fri
  // We need to track ALL days to get correct week rows
  const allDays = []
  // Add empty slots for days before the 1st
  for (let i = 0; i < startOffset; i++) {
    allDays.push(null)
  }
  for (let d = 1; d <= daysInMonth; d++) {
    allDays.push(d)
  }
  // Pad to complete last row of 7
  while (allDays.length % 7 !== 0) {
    allDays.push(null)
  }

  // Group into weeks of 7, then slice Mon-Fri (indices 0-4) for display
  const weeks = []
  for (let w = 0; w < allDays.length / 7; w++) {
    const allSevenDays = allDays.slice(w * 7, w * 7 + 7)
    const weekdays = allSevenDays.slice(0, 5) // Mon-Fri only
    let weekPnl = 0
    let weekTrades = 0

    const cells = weekdays.map((day, di) => {
      if (!day) return null
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      const data = dayMap[dateStr]
      if (data) {
        weekPnl += data.pnl
        weekTrades += data.count
      }
      return { day, dateStr, data }
    })

    weeks.push({ cells, weekPnl, weekTrades })
  }

  const fmtPnl = (n) => {
    if (n === null || n === undefined || n === 0) return null
    return (n > 0 ? '+$' : '-$') + Math.abs(n).toFixed(2)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0D0D0D', color: '#F0EEE8', fontFamily: 'sans-serif', padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#D93025', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>P&L Calendar</div>
          <h1 style={{ fontSize: '24px', fontWeight: '600', margin: 0 }}>Monthly Overview</h1>
        </div>
        <select
          value={selectedAccount}
          onChange={e => setSelectedAccount(e.target.value)}
          style={{ background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '7px', color: '#F0EEE8', fontFamily: 'monospace', fontSize: '12px', padding: '6px 12px', outline: 'none', cursor: 'pointer' }}
        >
          <option value="all">All Accounts</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'Monthly P&L', value: fmtPnl(monthPnl) || '$0.00', color: monthPnl >= 0 ? '#22C55E' : '#EF4444' },
          { label: 'Profit Days', value: profitDays, color: '#22C55E' },
          { label: 'Loss Days', value: lossDays, color: '#EF4444' },
          { label: 'Total Trades', value: monthTrades.length, color: '#F0EEE8' },
        ].map((s, i) => (
          <div key={i} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#555350', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontFamily: 'monospace', fontWeight: '500', color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
        <button onClick={prevMonth} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: '#1C1C1C', color: '#8A8880', cursor: 'pointer', fontSize: '16px' }}>‹</button>
        <span style={{ fontSize: '16px', fontWeight: '500', minWidth: '140px', textAlign: 'center' }}>{monthNames[month]} {year}</span>
        <button onClick={nextMonth} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.12)', background: '#1C1C1C', color: '#8A8880', cursor: 'pointer', fontSize: '16px' }}>›</button>
      </div>

      {/* Calendar grid */}
      <div style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', overflow: 'hidden' }}>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr) 120px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {['Mon','Tue','Wed','Thu','Fri'].map(d => (
            <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: '10px', fontFamily: 'monospace', color: '#555350', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{d}</div>
          ))}
          <div style={{ padding: '10px 0', textAlign: 'center', fontSize: '10px', fontFamily: 'monospace', color: '#555350', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Week Total</div>
        </div>

        {/* Week rows */}
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr) 120px', borderBottom: wi < weeks.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>

            {week.cells.map((cell, di) => {
              const isToday = cell?.dateStr === todayStr
              const isProfit = cell?.data && cell.data.pnl > 0
              const isLoss = cell?.data && cell.data.pnl < 0

              return (
                <div
                  key={di}
                  style={{
                    borderRight: '1px solid rgba(255,255,255,0.07)',
                    minHeight: '80px',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    background: isToday
                      ? 'rgba(217,48,37,0.06)'
                      : isProfit
                      ? 'rgba(34,197,94,0.06)'
                      : isLoss
                      ? 'rgba(239,68,68,0.06)'
                      : 'transparent',
                    borderTop: isToday ? '2px solid #D93025' : '2px solid transparent',
                  }}
                >
                  {cell && (
                    <>
                      <div style={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: isToday ? '#D93025' : '#555350',
                        fontWeight: isToday ? '600' : '400',
                      }}>
                        {cell.day}
                      </div>
                      {cell.data && (
                        <>
                          <div style={{
                            fontSize: '13px',
                            fontFamily: 'monospace',
                            fontWeight: '500',
                            color: isProfit ? '#22C55E' : '#EF4444',
                          }}>
                            {fmtPnl(cell.data.pnl)}
                          </div>
                          <div style={{
                            fontSize: '9px',
                            fontFamily: 'monospace',
                            color: '#555350',
                          }}>
                            {cell.data.count} trade{cell.data.count !== 1 ? 's' : ''}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )
            })}

            {/* Weekly tally */}
            <div style={{
              padding: '8px 14px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '4px',
              background: 'rgba(0,0,0,0.2)',
              borderLeft: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{ fontSize: '9px', fontFamily: 'monospace', color: '#555350', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Weekly P&L</div>
              <div style={{
                fontSize: '14px',
                fontFamily: 'monospace',
                fontWeight: '500',
                color: week.weekPnl > 0 ? '#22C55E' : week.weekPnl < 0 ? '#EF4444' : '#555350',
              }}>
                {week.weekPnl !== 0 ? fmtPnl(week.weekPnl) : '—'}
              </div>
              {week.weekTrades > 0 && (
                <div style={{ fontSize: '9px', fontFamily: 'monospace', color: '#555350' }}>
                  {week.weekTrades} trade{week.weekTrades !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#555350', fontFamily: 'monospace', fontSize: '12px' }}>
          Loading...
        </div>
      )}

    </div>
  )
}