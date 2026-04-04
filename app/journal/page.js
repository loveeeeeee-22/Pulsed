'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useRef } from 'react'
import { getTradesForUser } from '@/lib/getTradesForUser'

function JournalContent() {
  const searchParams = useSearchParams()
  const [trades, setTrades] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedDays, setExpandedDays] = useState({})
  const [noteDay, setNoteDay] = useState(null)
  const [noteText, setNoteText] = useState('')
  const accent = '#7C3AED'
  const [calDate, setCalDate] = useState(new Date())
  const [previewImageSrc, setPreviewImageSrc] = useState(null)
  const noteEditorRef = useRef(null)
  const imageInputRef = useRef(null)

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', '#7C3AED')
    fetchAll()
    const dateParam = searchParams.get('date')
    if (dateParam) setNoteDay(dateParam)
  }, [])

  useEffect(() => {
    if (!noteDay) return
    setTimeout(() => {
      normalizeEditorImages()
    }, 0)
  }, [noteDay])

  async function fetchAll() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    const journalPromise = uid
      ? supabase.from('journal_entries').select('*').eq('user_id', uid)
      : Promise.resolve({ data: [] })
    const [{ data: t }, { data: e }] = await Promise.all([
      getTradesForUser({ orderAscending: false }).then(data => ({ data })),
      journalPromise,
    ])
    if (t) setTrades(t)
    if (e) setEntries(e)
    setLoading(false)
  }

  async function saveNote() {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return
    const existing = entries.find(e => e.date === noteDay)
    const html = noteEditorRef.current?.innerHTML || noteText
    if (existing) {
      await supabase.from('journal_entries').update({ pre_market_notes: html }).eq('id', existing.id)
    } else {
      await supabase.from('journal_entries').insert({ date: noteDay, pre_market_notes: html, user_id: uid })
    }
    await fetchAll()
    setNoteDay(null)
  }

  function focusEditor() {
    if (noteEditorRef.current) noteEditorRef.current.focus()
  }

  function applyFormat(command, value = null) {
    focusEditor()
    document.execCommand(command, false, value)
  }

  function insertImageAtCaret(dataUrl) {
    focusEditor()
    document.execCommand('insertImage', false, dataUrl)
    setTimeout(() => {
      normalizeEditorImages()
    }, 0)
  }

  function normalizeEditorImages() {
    if (!noteEditorRef.current) return
    const imgs = noteEditorRef.current.querySelectorAll('img')
    imgs.forEach(img => {
      img.style.maxWidth = '320px'
      img.style.width = '100%'
      img.style.height = 'auto'
      img.style.maxHeight = '240px'
      img.style.objectFit = 'contain'
      img.style.display = 'block'
      img.style.margin = '8px 0'
      img.style.borderRadius = '8px'
      img.style.cursor = 'zoom-in'
      img.style.border = '1px solid var(--border)'
    })
  }

  function handlePaste(e) {
    const items = Array.from(e.clipboardData?.items || [])
    const imageItem = items.find(item => item.type.startsWith('image/'))
    if (!imageItem) return

    e.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl === 'string') {
        insertImageAtCaret(dataUrl)
      }
    }
    reader.readAsDataURL(file)
  }

  function handleImageUpload(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    files.forEach(file => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result
        if (typeof dataUrl === 'string') {
          insertImageAtCaret(dataUrl)
        }
      }
      reader.readAsDataURL(file)
    })

    e.target.value = ''
  }

  // Group trades by date
  const dayMap = {}
  trades.forEach(t => {
    const d = t.date?.slice(0, 10)
    if (!d) return
    if (!dayMap[d]) dayMap[d] = []
    dayMap[d].push(t)
  })

  const sortedDays = Object.keys(dayMap).sort((a, b) => b.localeCompare(a))

  const fmtPnl = (n) => (parseFloat(n) >= 0 ? '+$' : '-$') + Math.abs(parseFloat(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const pnlColor = (n) => parseFloat(n) >= 0 ? '#22C55E' : '#EF4444'

  // Calendar for right sidebar
  const year = calDate.getFullYear()
  const month = calDate.getMonth()
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay()
  const todayStr = new Date().toISOString().slice(0, 10)

  const calDays = []
  for (let i = 0; i < firstDow; i++) calDays.push(null)
  for (let d = 1; d <= daysInMonth; d++) calDays.push(d)
  while (calDays.length % 7 !== 0) calDays.push(null)

  const dailyPnl = {}
  trades.forEach(t => {
    const d = t.date?.slice(0, 10)
    if (!d) return
    if (!dailyPnl[d]) dailyPnl[d] = 0
    dailyPnl[d] += parseFloat(t.net_pnl || 0)
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)', color: 'var(--text)', fontFamily: 'sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--card-bg)' }}>
        <div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Daily Journal</div>
          <div style={{ fontSize: '18px', fontWeight: '600' }}>Trading Journal</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: '0', minHeight: 'calc(100vh - 57px)' }}>

        {/* Main feed */}
        <div style={{ padding: '20px 24px', borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text3)', fontFamily: 'monospace', fontSize: '12px' }}>Loading...</div>
          ) : sortedDays.length > 0 ? sortedDays.map(dateStr => {
            const dayTrades = dayMap[dateStr]
            const dayPnl = dayTrades.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0)
            const dayWins = dayTrades.filter(t => t.status === 'Win')
            const dayLosses = dayTrades.filter(t => t.status === 'Loss')
            const dayGross = dayTrades.reduce((s, t) => s + parseFloat(t.gross_pnl || 0), 0)
            const dayFees = dayTrades.reduce((s, t) => s + parseFloat(t.fees || 0), 0)
            const dayGrossWin = dayWins.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0)
            const dayGrossLoss = Math.abs(dayLosses.reduce((s, t) => s + parseFloat(t.net_pnl || 0), 0))
            const dayPF = dayGrossLoss > 0 ? (dayGrossWin / dayGrossLoss).toFixed(2) : '—'
            const dayWR = dayTrades.length ? ((dayWins.length / dayTrades.length) * 100).toFixed(2) : '0.00'
            const isExpanded = expandedDays[dateStr]
            const existingNote = entries.find(e => e.date === dateStr)

            // Mini equity curve for this day
            let dayCum = 0
            const dayEqPts = dayTrades.slice().reverse().map(t => { dayCum += parseFloat(t.net_pnl || 0); return dayCum })
            const dEqW = 200, dEqH = 80
            let dEqPath = '', dEqArea = ''
            if (dayEqPts.length > 1) {
              const minV = Math.min(0, ...dayEqPts), maxV = Math.max(0, ...dayEqPts)
              const range = maxV - minV || 1
              const coords = dayEqPts.map((v, i) => {
                const x = (i / (dayEqPts.length - 1)) * dEqW
                const y = dEqH - ((v - minV) / range) * (dEqH - 10) - 5
                return `${x},${y}`
              })
              dEqPath = 'M' + coords.join('L')
              dEqArea = dEqPath + `L${dEqW},${dEqH} L0,${dEqH} Z`
            }

            const formattedDate = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

            return (
              <div key={dateStr} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '12px', overflow: 'hidden' }}>

                {/* Day header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--border)' : 'none' }}
                  onClick={() => setExpandedDays(prev => ({ ...prev, [dateStr]: !prev[dateStr] }))}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '11px', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>›</div>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)' }}>{formattedDate}</div>
                    <div style={{ fontSize: '14px', fontFamily: 'monospace', fontWeight: '600', color: pnlColor(dayPnl) }}>· Net P&L {fmtPnl(dayPnl)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      onClick={e => { e.stopPropagation(); setNoteText(existingNote?.pre_market_notes || ''); setNoteDay(dateStr) }}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '7px', border: '1px solid var(--border-md)', background: existingNote?.pre_market_notes ? `${accent}20` : 'var(--bg3)', color: existingNote?.pre_market_notes ? accent : 'var(--text2)', cursor: 'pointer', fontSize: '11px', fontFamily: 'monospace' }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1"/><path d="M3 4h6M3 6.5h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                      {existingNote?.pre_market_notes ? 'View Note' : 'Add Note'}
                    </button>
                  </div>
                </div>

                {/* Collapsed view — mini chart + stats */}
                {!isExpanded && (
                  <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '0', padding: '14px 18px', alignItems: 'center' }}>
                    {dayEqPts.length > 1 ? (
                      <svg width="100%" viewBox={`0 0 ${dEqW} ${dEqH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
                        <defs>
                          <linearGradient id={`dg-${dateStr}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={dayPnl >= 0 ? '#22C55E' : '#EF4444'} stopOpacity="0.3"/>
                            <stop offset="100%" stopColor={dayPnl >= 0 ? '#22C55E' : '#EF4444'} stopOpacity="0.02"/>
                          </linearGradient>
                        </defs>
                        <path d={dEqArea} fill={`url(#dg-${dateStr})`}/>
                        <path d={dEqPath} fill="none" stroke={dayPnl >= 0 ? '#22C55E' : '#EF4444'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <div style={{ width: '200px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '11px', fontFamily: 'monospace' }}>1 trade</div>
                    )}

                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr) repeat(3,1fr)', gap: '0', borderLeft: '1px solid var(--border)', marginLeft: '16px', paddingLeft: '20px' }}>
                      {[
                        { label: 'Total Trades', value: dayTrades.length },
                        { label: 'Winners', value: dayWins.length },
                        { label: 'Gross P&L', value: `$${dayGross.toFixed(2)}` },
                        { label: 'Winrate', value: dayWR + '%' },
                        { label: 'Losers', value: dayLosses.length },
                        { label: 'Commissions', value: `$${dayFees.toFixed(2)}` },
                      ].map((stat, i) => (
                        <div key={i} style={{ padding: '6px 10px', borderRight: i % 3 !== 2 ? '1px solid var(--border)' : 'none', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginBottom: '3px' }}>{stat.label}</div>
                          <div style={{ fontSize: '14px', fontFamily: 'monospace', fontWeight: '600', color: stat.label === 'Winners' ? '#22C55E' : stat.label === 'Losers' ? '#EF4444' : 'var(--text)' }}>{stat.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Expanded — full trade table */}
                {isExpanded && (
                  <div style={{ padding: '14px 18px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          {['Time','Symbol','Direction','Contracts','Entry','Exit','Net P&L','Status','RR'].map(h => (
                            <th key={h} style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: '400', padding: '0 12px 8px 0', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dayTrades.map((t, i) => {
                          const pnl = parseFloat(t.net_pnl || 0)
                          return (
                            <tr key={i} style={{ borderBottom: i < dayTrades.length - 1 ? '1px solid var(--border)' : 'none' }}>
                              <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '10px 12px 10px 0' }}>{t.entry_time || '—'}</td>
                              <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text)', fontWeight: '600', padding: '10px 12px 10px 0' }}>{t.symbol}</td>
                              <td style={{ fontSize: '12px', fontFamily: 'monospace', color: t.direction === 'Long' ? '#22C55E' : '#EF4444', padding: '10px 12px 10px 0' }}>{t.direction}</td>
                              <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '10px 12px 10px 0' }}>{t.contracts}</td>
                              <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '10px 12px 10px 0' }}>{t.entry_price}</td>
                              <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '10px 12px 10px 0' }}>{t.exit_price}</td>
                              <td style={{ fontSize: '12px', fontFamily: 'monospace', color: pnlColor(pnl), fontWeight: '600', padding: '10px 12px 10px 0' }}>{fmtPnl(pnl)}</td>
                              <td style={{ padding: '10px 12px 10px 0' }}>
                                <span style={{ fontSize: '10px', fontFamily: 'monospace', padding: '2px 8px', borderRadius: '4px', background: t.status === 'Win' ? 'rgba(34,197,94,0.1)' : t.status === 'Loss' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', color: t.status === 'Win' ? '#22C55E' : t.status === 'Loss' ? '#EF4444' : '#EAB308' }}>{t.status || '—'}</span>
                              </td>
                              <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '10px 0' }}>{t.actual_rr ? t.actual_rr + 'R' : '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          }) : (
            <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text3)', fontFamily: 'monospace', fontSize: '13px' }}>
              No trades logged yet.{' '}
              <a href="/new-trade" style={{ color: accent }}>Log your first trade →</a>
            </div>
          )}
        </div>

        {/* Right sidebar — mini calendar */}
        <div style={{ padding: '20px 16px', background: 'var(--card-bg)', borderTop: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <button onClick={() => setCalDate(new Date(year, month - 1, 1))}
              style={{ width: '24px', height: '24px', borderRadius: '5px', border: '1px solid var(--border-md)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)' }}>{monthNames[month]} {year}</span>
            <button onClick={() => setCalDate(new Date(year, month + 1, 1))}
              style={{ width: '24px', height: '24px', borderRadius: '5px', border: '1px solid var(--border-md)', background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px', marginBottom: '4px' }}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '9px', fontFamily: 'monospace', color: 'var(--text3)', paddingBottom: '4px' }}>{d}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px' }}>
            {calDays.map((day, i) => {
              if (!day) return <div key={i}/>
              const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const pnl = dailyPnl[dateStr]
              const isToday = dateStr === todayStr
              const isProfit = pnl && pnl > 0
              const isLoss = pnl && pnl < 0
              return (
                <div key={i}
                  onClick={() => pnl && setNoteDay(dateStr)}
                  style={{
                    height: '28px', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', fontFamily: 'monospace', cursor: pnl ? 'pointer' : 'default',
                    background: isToday ? `${accent}25` : isProfit ? 'rgba(34,197,94,0.15)' : isLoss ? 'rgba(239,68,68,0.15)' : 'transparent',
                    color: isToday ? accent : isProfit ? '#22C55E' : isLoss ? '#EF4444' : 'var(--text3)',
                    fontWeight: isToday || pnl ? '600' : '400',
                    border: isToday ? `1px solid ${accent}` : '1px solid transparent',
                  }}>
                  {day}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Note Modal */}
      {noteDay && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setNoteDay(null) }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: '16px', width: '100%', maxWidth: '700px', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)' }}>
                {new Date(noteDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                {dailyPnl[noteDay] && <span style={{ fontSize: '13px', fontFamily: 'monospace', color: pnlColor(dailyPnl[noteDay]), marginLeft: '10px' }}>· Net P&L {fmtPnl(dailyPnl[noteDay])}</span>}
              </div>
              <button onClick={saveNote}
                style={{ padding: '7px 18px', borderRadius: '8px', background: accent, color: '#fff', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>Save</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg3)', flexWrap: 'wrap' }}>
              {[
                { label: 'B', cmd: 'bold', style: { fontWeight: '700' } },
                { label: 'I', cmd: 'italic', style: { fontStyle: 'italic' } },
                { label: 'U', cmd: 'underline', style: { textDecoration: 'underline' } },
                { label: 'S', cmd: 'strikeThrough', style: { textDecoration: 'line-through' } },
              ].map(btn => (
                <button key={btn.cmd}
                  onMouseDown={e => { e.preventDefault(); applyFormat(btn.cmd) }}
                  style={{ width: '28px', height: '28px', borderRadius: '5px', border: '1px solid var(--border-md)', background: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', ...btn.style }}>
                  {btn.label}
                </button>
              ))}
              <div style={{ width: '1px', height: '20px', background: 'var(--border-md)', margin: '0 4px' }}/>
              {[
                { label: '≡', cmd: 'insertUnorderedList' },
                { label: '1.', cmd: 'insertOrderedList' },
                { label: '❝', cmd: 'formatBlock', value: 'blockquote' },
                { label: '↶', cmd: 'undo' },
                { label: '↷', cmd: 'redo' },
              ].map(btn => (
                <button key={btn.cmd}
                  onMouseDown={e => { e.preventDefault(); applyFormat(btn.cmd, btn.value || null) }}
                  style={{ width: '28px', height: '28px', borderRadius: '5px', border: '1px solid var(--border-md)', background: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {btn.label}
                </button>
              ))}
              <div style={{ width: '1px', height: '20px', background: 'var(--border-md)', margin: '0 4px' }}/>
              <button
                onMouseDown={e => { e.preventDefault(); focusEditor(); applyFormat('removeFormat') }}
                style={{ borderRadius: '5px', border: '1px solid var(--border-md)', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: '11px', height: '28px', padding: '0 8px', fontFamily: 'monospace' }}
              >
                Clear
              </button>
              <button
                onMouseDown={e => { e.preventDefault(); imageInputRef.current?.click() }}
                style={{ borderRadius: '5px', border: '1px solid var(--border-md)', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: '11px', height: '28px', padding: '0 8px', fontFamily: 'monospace' }}
              >
                + Image
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
            </div>

            <div style={{ padding: '16px 24px', minHeight: '280px' }}>
              <div
                id="noteEditor"
                ref={noteEditorRef}
                contentEditable
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: entries.find(e => e.date === noteDay)?.pre_market_notes || '' }}
                onPaste={handlePaste}
                onInput={normalizeEditorImages}
                onClick={e => {
                  if (e.target?.tagName === 'IMG') {
                    e.preventDefault()
                    e.stopPropagation()
                    setPreviewImageSrc(e.target.getAttribute('src'))
                  }
                }}
                style={{ minHeight: '240px', outline: 'none', fontSize: '14px', lineHeight: '1.8', color: 'var(--text)', fontFamily: 'sans-serif' }}
              />
            </div>
          </div>
        </div>
      )}

      {previewImageSrc && (
        <div
          onClick={() => setPreviewImageSrc(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 550,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <img
            src={previewImageSrc}
            alt="Journal note preview"
            style={{
              maxWidth: '92vw',
              maxHeight: '88vh',
              width: 'auto',
              height: 'auto',
              borderRadius: '10px',
              border: '1px solid var(--border-md)',
              boxShadow: '0 22px 54px rgba(0,0,0,0.6)',
            }}
          />
        </div>
      )}
    </div>
  )
}

export default function JournalPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', color: 'var(--text3)', fontFamily: 'monospace', fontSize: '12px' }}>Loading...</div>}>
      <JournalContent />
    </Suspense>
  )
}