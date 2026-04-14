'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getAccountsForUser } from '@/lib/getAccountsForUser'
import { getTradesForUser } from '@/lib/getTradesForUser'
import { compareTradesChronoDesc } from '@/lib/tradeSort'
import { getStrategiesForUser } from '@/lib/getStrategiesForUser'
import { countTradesNeedingReview, isTradeReviewed } from '@/lib/tradeReviewStatus'
import EditTradeModal from '@/components/EditTradeModal'
import TradeReviewModal from '@/components/TradeReviewModal'

function TradeLogContent() {
  const searchParams = useSearchParams()
  const [trades, setTrades] = useState([])
  const [accounts, setAccounts] = useState([])
  const [strategies, setStrategies] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('all')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editTrade, setEditTrade] = useState(null)
  const [reviewTrade, setReviewTrade] = useState(null)
  const [sessionUserId, setSessionUserId] = useState(null)

  const selectedDate = String(searchParams.get('date') || '').slice(0, 10)

  useEffect(() => {
    fetchAccounts()
    fetchStrategies()
    fetchTrades()
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUserId(session?.user?.id ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUserId(session?.user?.id ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sessionUserId) return undefined

    const channel = supabase
      .channel('trades-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trades',
        },
        (payload) => {
          const row = payload.new
          if (!row?.id) return
          setTrades((prev) => {
            if (prev.some((t) => t.id === row.id)) return prev
            return [...prev, row].sort(compareTradesChronoDesc)
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionUserId])

  async function fetchAccounts() {
    const data = await getAccountsForUser()
    setAccounts(data)
  }

  async function fetchTrades({ silent = false } = {}) {
    if (!silent) setLoading(true)
    try {
      const data = await getTradesForUser({ orderAscending: false })
      setTrades(data)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  async function fetchStrategies() {
    const rows = await getStrategiesForUser({ select: 'id,name', order: { column: 'name', ascending: true } })
    setStrategies(rows || [])
  }

  const filtered = trades.filter(t => {
    const matchAcct = selectedAccount === 'all' || t.account_id === selectedAccount
    const matchFilter = filter === 'all' || t.status === filter
    const matchSearch = !search || t.symbol?.toLowerCase().includes(search.toLowerCase())
    const matchDate = !selectedDate || String(t.date || '').slice(0, 10) === selectedDate
    return matchAcct && matchFilter && matchSearch && matchDate
  })

  const wins = filtered.filter(t => t.status === 'Win')
  const losses = filtered.filter(t => t.status === 'Loss')
  const bes = filtered.filter(t => t.status === 'Breakeven')
  const totalPnl = filtered.reduce((s,t) => s + parseFloat(t.net_pnl||0), 0)
  const grossWin = wins.reduce((s,t) => s + parseFloat(t.net_pnl||0), 0)
  const grossLoss = Math.abs(losses.reduce((s,t) => s + parseFloat(t.net_pnl||0), 0))
  const pf = grossLoss > 0 ? (grossWin/grossLoss).toFixed(2) : '∞'
  const wr = filtered.length ? ((wins.length/filtered.length)*100).toFixed(1) : '0.0'
  const avgWin = wins.length ? (grossWin/wins.length).toFixed(2) : '0.00'
  const avgLoss = losses.length ? (grossLoss/losses.length).toFixed(2) : '0.00'
  const ratio = parseFloat(avgLoss) > 0 ? (parseFloat(avgWin)/parseFloat(avgLoss)).toFixed(2) : '—'

  const pendingReviewCount = countTradesNeedingReview(filtered)

  const fmtPnl = (n) => (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2)
  const pnlColor = (n) => n >= 0 ? '#22C55E' : '#EF4444'

  // Donut ring values
  const wrNum = parseFloat(wr)
  const r = 28, circ = 2*Math.PI*r

  const s = {
    page: { minHeight: '100vh', background: 'var(--page-bg)', color: 'var(--text)', padding: '20px 24px', fontFamily: 'sans-serif' },
    card: { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px' },
  }

  return (
    <div style={s.page}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Trading Journal</div>
          <h1 style={{ fontSize: '24px', fontWeight: '600', margin: 0 }}>Trade Log</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text" placeholder="Search symbol..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border-md)', borderRadius: '7px', color: 'var(--text)', fontFamily: 'monospace', fontSize: '12px', padding: '6px 12px', outline: 'none', width: '160px' }}
          />
          <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            {['all','Win','Loss','Breakeven'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ border: 'none', padding: '5px 10px', fontSize: '11px', fontFamily: 'monospace', cursor: 'pointer', background: filter === f ? 'var(--accent)' : 'transparent', color: filter === f ? '#fff' : 'var(--text3)', transition: 'all 0.1s' }}>
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
          <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border-md)', borderRadius: '7px', color: 'var(--text)', fontFamily: 'monospace', fontSize: '11px', padding: '5px 12px', outline: 'none', cursor: 'pointer' }}>
            <option value="all">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {pendingReviewCount > 0 ? (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '10px',
            border: '1px solid rgba(245,158,11,0.45)',
            background: 'rgba(245,158,11,0.08)',
            color: 'var(--text)',
            fontSize: '13px',
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span>
            <strong style={{ color: '#F59E0B' }}>{pendingReviewCount}</strong> trade{pendingReviewCount === 1 ? '' : 's'} left to review
            {selectedAccount !== 'all' ? ` (this account)` : ''}. Click a row to open review, then use <strong>Mark as reviewed</strong> when you are done, or <strong>Edit</strong> to change the trade.
          </span>
        </div>
      ) : filtered.length > 0 ? (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '10px',
            border: '1px solid rgba(34,197,94,0.4)',
            background: 'rgba(34,197,94,0.08)',
            color: 'var(--text)',
            fontSize: '13px',
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span>
            <strong style={{ color: '#22C55E' }}>All trades reviewed</strong>
            {selectedAccount !== 'all' ? ' (this account)' : ''} — great work.
          </span>
        </div>
      ) : null}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Net Cumulative P&L', value: fmtPnl(totalPnl), color: pnlColor(totalPnl), ring: null, primary: true },
          { label: 'Profit Factor', value: pf, color: 'var(--text)', ring: 'pf' },
          { label: 'Win Rate', value: wr + '%', color: 'var(--text)', ring: 'wr' },
          { label: 'Avg Win / Loss', value: null, color: null, ring: 'wl' },
        ].map((k, i) => (
          <div key={i} style={{ ...s.card, position: 'relative', overflow: 'hidden', borderColor: k.primary ? 'var(--accent-border)' : 'var(--border)' }}>
            {k.primary && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'var(--accent)' }} />}
            <div style={{ fontSize: '9px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{k.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <svg width="64" height="64" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border-md)" strokeWidth="6"/>
                <circle cx="32" cy="32" r={r} fill="none"
                  stroke={i === 2 ? (wrNum >= 50 ? '#22C55E' : '#EF4444') : i === 0 ? pnlColor(totalPnl) : i === 1 ? (parseFloat(pf) >= 1.5 ? '#22C55E' : parseFloat(pf) >= 1 ? '#EAB308' : '#EF4444') : '#22C55E'}
                  strokeWidth="6"
                  strokeDasharray={`${
                    i === 0 ? Math.min(Math.abs(totalPnl)/50, 1)*circ :
                    i === 1 ? Math.min(parseFloat(pf)/3, 1)*circ :
                    i === 2 ? (wrNum/100)*circ :
                    parseFloat(avgLoss) > 0 ? Math.min(parseFloat(avgWin)/parseFloat(avgLoss)/3, 1)*circ : 0
                  } ${circ}`}
                  strokeLinecap="round" transform="rotate(-90 32 32)"/>
              </svg>
              <div>
                {i < 3 ? (
                  <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: '500', color: k.color }}>{k.value}</div>
                ) : (
                  <div>
                    <div style={{ fontSize: '16px', fontFamily: 'monospace', fontWeight: '500', color: '#22C55E' }}>+${avgWin}</div>
                    <div style={{ fontSize: '16px', fontFamily: 'monospace', fontWeight: '500', color: '#EF4444' }}>-${avgLoss}</div>
                  </div>
                )}
                {i === 2 && <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginTop: '3px' }}>{wins.length}W · {losses.length}L · {bes.length} B/E</div>}
                {i === 3 && <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginTop: '3px' }}>ratio {ratio}×</div>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)' }}>Showing {filtered.length} trade{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--border-md)' }}>
                {['Date','Symbol','Direction','Session','Contracts','Net P&L','Status','Review','Actual RR','Actions'].map((h, hi) => (
                  <th key={`${h}-${hi}`} style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '400', padding: '10px 14px', textAlign: h === 'Actions' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? filtered.map((t, i) => {
                const pnl = parseFloat(t.net_pnl||0)
                return (
                  <tr
                    key={t.id || i}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => setReviewTrade(t)}
                  >
                    <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '11px 14px', whiteSpace: 'nowrap' }}>{t.date?.slice(0,10)}</td>
                    <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text)', fontWeight: '500', padding: '11px 14px' }}>{t.symbol}</td>
                    <td
                      style={{
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        color:
                          t.direction === 'Long' || t.direction === 'long'
                            ? '#22C55E'
                            : t.direction === 'Short' || t.direction === 'short'
                              ? '#EF4444'
                              : 'var(--text2)',
                        padding: '11px 14px',
                      }}
                    >
                      {t.direction}
                    </td>
                    <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '11px 14px' }}>{t.session}</td>
                    <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '11px 14px' }}>{t.contracts}</td>
                    <td style={{ fontSize: '12px', fontFamily: 'monospace', color: pnlColor(pnl), fontWeight: '500', padding: '11px 14px' }}>{fmtPnl(pnl)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: '10px', fontFamily: 'monospace', padding: '3px 8px', borderRadius: '5px', background: t.status==='Win' ? 'rgba(34,197,94,0.1)' : t.status==='Loss' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', color: t.status==='Win' ? '#22C55E' : t.status==='Loss' ? '#EF4444' : '#EAB308' }}>{t.status || '—'}</span>
                    </td>
                    <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '11px 14px' }} title={isTradeReviewed(t) ? 'Reviewed' : 'Not reviewed'}>
                      {isTradeReviewed(t) ? '✓' : '—'}
                    </td>
                    <td style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text2)', padding: '11px 14px' }}>{t.actual_rr ? t.actual_rr + 'R' : '—'}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <a
                          href={`/replay/${t.id}`}
                          onClick={e => e.stopPropagation()}
                          style={{
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-md)',
                            background: 'var(--bg3)',
                            color: 'var(--text2)',
                            textDecoration: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                        >
                          Replay
                        </a>
                        <button
                          type="button"
                          onClick={() => setEditTrade(t)}
                          style={{
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-md)',
                            background: 'var(--bg3)',
                            color: 'var(--text2)',
                            cursor: 'pointer',
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              }) : (
                <tr><td colSpan="10" style={{ textAlign: 'center', padding: '48px', color: 'var(--text3)', fontFamily: 'monospace', fontSize: '12px' }}>No trades match your filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)', fontFamily: 'monospace', fontSize: '12px' }}>Loading...</div>}

      {editTrade && (
        <EditTradeModal
          trade={editTrade}
          onClose={() => setEditTrade(null)}
          onSaved={() => {
            setEditTrade(null)
            fetchTrades()
          }}
        />
      )}

      {reviewTrade && (
        <TradeReviewModal
          trade={reviewTrade}
          trades={filtered}
          onSelectTrade={setReviewTrade}
          accountName={accounts.find(a => a.id === reviewTrade.account_id)?.name || ''}
          accountType={accounts.find(a => a.id === reviewTrade.account_id)?.type || ''}
          strategyName={strategies.find(s => s.id === reviewTrade.strategy_id)?.name || ''}
          onClose={() => {
            setReviewTrade(null)
            fetchTrades({ silent: true })
          }}
          onMarkReviewed={(payload) => {
            if (payload?.reviewPersisted && payload.tradeId != null) {
              setTrades((prev) =>
                prev.map((t) =>
                  t.id === payload.tradeId ? { ...t, reviewed: true } : t
                )
              )
              setReviewTrade((prev) =>
                prev?.id === payload.tradeId ? { ...prev, reviewed: true } : prev
              )
            }
            fetchTrades({ silent: true })
          }}
          onRequestEdit={() => {
            setEditTrade(reviewTrade)
            setReviewTrade(null)
          }}
          onSaveNotes={async (notes) => {
            await supabase.from('trades').update({ notes: notes?.trim() || null }).eq('id', reviewTrade.id)
            setReviewTrade(prev => (prev ? { ...prev, notes } : prev))
            fetchTrades()
          }}
          onLinkPlaybook={async (strategyId) => {
            await supabase.from('trades').update({ strategy_id: strategyId || null }).eq('id', reviewTrade.id)
            setReviewTrade(prev => (prev ? { ...prev, strategy_id: strategyId || null } : prev))
            fetchTrades()
          }}
          onSaveRuleReview={async (mistakes) => {
            await supabase.from('trades').update({ mistakes }).eq('id', reviewTrade.id)
            setReviewTrade(prev => (prev ? { ...prev, mistakes } : prev))
            fetchTrades()
          }}
          onSaveTradeGrade={async (trade_grade) => {
            await supabase.from('trades').update({ trade_grade: trade_grade ?? null }).eq('id', reviewTrade.id)
            setReviewTrade(prev => (prev ? { ...prev, trade_grade: trade_grade ?? null } : prev))
            fetchTrades()
          }}
          onSaveConfluences={async (confluences) => {
            await supabase.from('trades').update({ confluences }).eq('id', reviewTrade.id)
            setReviewTrade(prev => (prev ? { ...prev, confluences } : prev))
            fetchTrades()
          }}
        />
      )}
    </div>
  )
}

export default function TradeLog() {
  return (
    <Suspense fallback={null}>
      <TradeLogContent />
    </Suspense>
  )
}