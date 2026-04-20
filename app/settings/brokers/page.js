'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getAccountsForUser } from '@/lib/getAccountsForUser'

const GREEN = '#22C55E'
const RED = '#EF4444'

const ON_HOLD = '#F59E0B'

const BROKERS = [
  {
    id: 'tradovate',
    name: 'Tradovate',
    color: '#0066CC',
    description:
      'Used by FTMO, E8 Funding, Apex and most major prop firms. New connections are paused until Tradovate API access is available.',
    features: ['Auto Import', 'Replay', 'Balance Sync'],
    comingSoon: false,
    /** Pause connect UI; existing connections still work */
    onHold: true,
  },
  {
    id: 'rithmic',
    name: 'Rithmic',
    color: '#E8400C',
    description: 'Professional futures data feed used by institutional traders',
    features: ['Auto Import', 'Replay', 'Balance Sync'],
    comingSoon: true,
  },
  {
    id: 'interactive_brokers',
    name: 'Interactive Brokers',
    color: '#FF6B00',
    description: 'Multi-asset broker supporting stocks, futures, forex and options',
    features: ['Auto Import', 'Balance Sync'],
    comingSoon: true,
  },
  {
    id: 'mt4_mt5',
    name: 'MT4 / MT5',
    color: '#1A73E8',
    description: 'Connect your MetaTrader account for forex and CFD auto-import',
    features: ['Auto Import'],
    comingSoon: true,
  },
  {
    id: 'binance',
    name: 'Binance',
    color: '#F0B90B',
    description: 'Import your crypto trades automatically from Binance',
    features: ['Auto Import'],
    comingSoon: true,
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    color: '#0052FF',
    description: 'Sync your Coinbase and Coinbase Pro trading history',
    features: ['Auto Import'],
    comingSoon: true,
  },
]

const IMPORT_RANGE_OPTIONS = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '6m', label: 'Last 6 months' },
  { value: '1y', label: 'Last year' },
  { value: 'all', label: 'All time' },
]

const SYNC_FREQ_OPTIONS = [
  { value: '15m', label: 'Every 15 min' },
  { value: '1h', label: 'Every hour' },
  { value: '6h', label: 'Every 6 hours' },
  { value: 'manual', label: 'Manual only' },
]

function formatRelativeTime(iso) {
  if (!iso) return 'Never'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

function BrokerLogo({ name, color }) {
  const initials = name
    .split(/[\s/]+/)
    .map(w => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
  return (
    <div
      style={{
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '13px',
        fontWeight: 800,
        fontFamily: 'monospace',
        flexShrink: 0,
      }}
      aria-hidden
    >
      {initials}
    </div>
  )
}

function FeatureBadge({ label }) {
  return (
    <span
      style={{
        fontSize: '10px',
        fontWeight: 600,
        padding: '4px 8px',
        borderRadius: '6px',
        background: 'var(--bg3)',
        border: '1px solid var(--border-md)',
        color: 'var(--text2)',
        fontFamily: 'monospace',
      }}
    >
      {label}
    </span>
  )
}

function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', marginLeft: '6px' }}>
      <button
        type="button"
        aria-label="More info"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          border: '1px solid var(--border-md)',
          background: 'var(--bg3)',
          color: 'var(--text3)',
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'help',
          lineHeight: 1,
        }}
      >
        i
      </button>
      {open ? (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 'calc(100% + 8px)',
            width: '240px',
            padding: '10px 12px',
            borderRadius: '10px',
            background: 'var(--bg4)',
            border: '1px solid var(--border-md)',
            color: 'var(--text2)',
            fontSize: '11px',
            lineHeight: 1.45,
            fontWeight: 500,
            zIndex: 50,
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          }}
        >
          {text}
        </span>
      ) : null}
    </span>
  )
}

export default function BrokersSettingsPage() {
  const [accent, setAccent] = useState('#7C3AED')
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState(null)

  const [importRange, setImportRange] = useState('90d')
  const [syncFreq, setSyncFreq] = useState('1h')
  const [mapAccount, setMapAccount] = useState('')
  const [sessionCat, setSessionCat] = useState(true)
  const [autoCommissions, setAutoCommissions] = useState(true)

  const [pulsedAccounts, setPulsedAccounts] = useState([])
  const [syncBusy, setSyncBusy] = useState(false)

  const [tvModalOpen, setTvModalOpen] = useState(false)
  const [tvStep, setTvStep] = useState(1)
  const [tvEnv, setTvEnv] = useState('live')
  const [tvUser, setTvUser] = useState('')
  const [tvPass, setTvPass] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [tvAppId, setTvAppId] = useState('Pulsed')
  const [tvAppVer] = useState('1.0.0')
  const [tvApiCid, setTvApiCid] = useState('')
  const [tvApiSec, setTvApiSec] = useState('')
  const [tvBusy, setTvBusy] = useState(false)
  const [tvError, setTvError] = useState(null)
  const [previewTrades, setPreviewTrades] = useState([])
  const [tvPulsedAccountId, setTvPulsedAccountId] = useState('')
  const [tvSuccessMeta, setTvSuccessMeta] = useState(null)

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('accentColor') : null
    const next = raw && /^#[0-9A-Fa-f]{6}$/.test(raw.trim()) ? raw.trim() : '#7C3AED'
    setAccent(next)
    document.documentElement.style.setProperty('--accent', next)
  }, [])

  const loadConnections = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) {
        setConnections([])
        setLoading(false)
        return
      }
      const { data, error } = await supabase
        .from('broker_connections')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      setConnections(data || [])
    } catch (e) {
      setLoadError(e?.message || 'Could not load broker connections.')
      setConnections([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const rows = await getAccountsForUser()
      if (!cancelled) setPulsedAccounts(rows || [])
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!connections.length) return
    setSelectedConnectionId(prev => {
      if (prev && connections.some(c => c.id === prev)) return prev
      const tradovate = connections.find(c => c.broker_name === 'tradovate')
      return (tradovate || connections[0]).id
    })
  }, [connections])

  const connectedByBroker = useMemo(() => {
    const m = {}
    for (const c of connections) {
      if (!m[c.broker_name]) m[c.broker_name] = []
      m[c.broker_name].push(c)
    }
    return m
  }, [connections])

  const connectedCount = connections.length

  const tradovateConnections = connectedByBroker['tradovate'] || []
  const selectedConnection = connections.find(c => c.id === selectedConnectionId) || tradovateConnections[0] || null

  useEffect(() => {
    if (!tvModalOpen) return
    setDeviceId(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-device`)
    setTvStep(1)
    setTvError(null)
    setPreviewTrades([])
    setTvSuccessMeta(null)
    setTvPulsedAccountId('')
    setTvAppId('Pulsed')
    setTvApiCid('')
    setTvApiSec('')
  }, [tvModalOpen])

  useEffect(() => {
    if (!tvModalOpen || !pulsedAccounts.length) return
    setTvPulsedAccountId(prev => {
      if (prev && pulsedAccounts.some(a => a.id === prev)) return prev
      if (mapAccount && pulsedAccounts.some(a => a.id === mapAccount)) return mapAccount
      return pulsedAccounts[0].id
    })
  }, [tvModalOpen, pulsedAccounts, mapAccount])

  async function handleTradovateConnect() {
    setTvError(null)
    setTvBusy(true)
    setPreviewTrades([])
    setTvSuccessMeta(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setTvError('Sign in to connect a broker.')
        setTvBusy(false)
        setTvStep(2)
        return
      }
      if (!tvPulsedAccountId) {
        setTvError('Choose a Pulsed account to import trades into.')
        setTvBusy(false)
        setTvStep(1)
        return
      }

      const res = await fetch('/api/tradovate/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          username: tvUser.trim(),
          password: tvPass,
          deviceId,
          appId: tvAppId.trim() || 'Pulsed',
          appVersion: tvAppVer,
          environment: tvEnv,
          pulsedAccountId: tvPulsedAccountId,
          ...(tvApiCid.trim() ? { apiCid: tvApiCid.trim() } : {}),
          ...(tvApiSec ? { apiSec: tvApiSec } : {}),
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Connection failed (${res.status})`)
      }

      setTvSuccessMeta({
        tradesFound: Number(json.tradesFound) || 0,
        accountName: json.accountName || '',
        connectionId: json.connectionId,
      })

      const n = Number(json.tradesFound) || 0
      if (n > 0) {
        setPreviewTrades([
          { symbol: 'Import', side: 'complete', pnl: `${n} trade${n === 1 ? '' : 's'}`, t: 'saved' },
        ])
      } else {
        setPreviewTrades([
          { symbol: '—', side: 'No new', pnl: '0 trades', t: 'in range' },
        ])
      }

      await loadConnections()
      if (json.connectionId) setSelectedConnectionId(json.connectionId)

      setTimeout(() => {
        setTvModalOpen(false)
        setTvStep(1)
        setTvUser('')
        setTvPass('')
        setTvApiCid('')
        setTvApiSec('')
        setTvAppId('Pulsed')
        setPreviewTrades([])
        setTvSuccessMeta(null)
      }, 2800)
    } catch (e) {
      setTvError(e?.message || 'Could not save connection.')
      setTvStep(2)
    } finally {
      setTvBusy(false)
    }
  }

  async function disconnectBroker(brokerId, row) {
    if (!row?.id) return
    if (!confirm(`Disconnect ${BROKERS.find(b => b.id === brokerId)?.name || brokerId}?`)) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        alert('Sign in required.')
        return
      }
      const res = await fetch('/api/tradovate/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ connectionId: row.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        alert(json.error || 'Disconnect failed')
        return
      }
      await loadConnections()
      setSelectedConnectionId(null)
    } catch (e) {
      alert(e?.message || 'Disconnect failed')
    }
  }

  async function handleSyncNow() {
    if (!selectedConnection?.id) return
    setSyncBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        alert('Sign in required.')
        return
      }
      const res = await fetch('/api/tradovate/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          connectionId: selectedConnection.id,
          dateRange: importRange,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || `Sync failed (${res.status})`)
        return
      }
      const errPart = json.errors?.length ? ` Errors: ${json.errors.join('; ')}` : ''
      alert(`Synced ${json.synced ?? 0}, skipped ${json.skipped ?? 0}.${errPart}`)
      await loadConnections()
    } catch (e) {
      alert(e?.message || 'Sync failed')
    } finally {
      setSyncBusy(false)
    }
  }

  const panel = {
    border: '1px solid var(--border)',
    borderRadius: '12px',
    background: 'var(--card-bg)',
    padding: '16px',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '26px 24px 48px' }}>
        <nav style={{ marginBottom: '18px' }}>
          <Link
            href="/settings"
            style={{
              fontSize: '12px',
              fontFamily: 'monospace',
              color: 'var(--text3)',
              textDecoration: 'none',
            }}
          >
            ← Settings
          </Link>
        </nav>

        <header style={{ marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '18px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px' }}>
            <div>
              <p style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Pulsed
              </p>
              <h1 style={{ marginTop: '6px', fontSize: '30px', fontWeight: 700 }}>Connected Brokers</h1>
              <p style={{ marginTop: '10px', maxWidth: '640px', fontSize: '14px', color: 'var(--text2)', fontWeight: 500, lineHeight: 1.5 }}>
                Connect your broker to automatically import trades and enable chart replay
              </p>
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '999px',
                background: `${GREEN}18`,
                border: `1px solid ${GREEN}44`,
                color: GREEN,
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: 'monospace',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: GREEN }} aria-hidden />
              {connectedCount} connected
            </div>
          </div>
        </header>

        {loadError ? (
          <div
            role="alert"
            style={{
              marginBottom: '18px',
              padding: '12px 14px',
              borderRadius: '10px',
              border: `1px solid ${RED}55`,
              background: `${RED}12`,
              color: '#FCA5A5',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {loadError}{' '}
            <span style={{ color: 'var(--text3)' }}>Run the SQL migration for <code style={{ fontFamily: 'monospace' }}>broker_connections</code> if you have not yet.</span>
          </div>
        ) : null}

        {loading ? (
          <p style={{ color: 'var(--text3)', fontFamily: 'monospace', fontSize: '12px' }}>Loading connections…</p>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
            gap: '14px',
            marginBottom: '28px',
          }}
        >
          {BROKERS.map(b => {
            const rows = connectedByBroker[b.id] || []
            const connected = rows.length > 0
            const primary = rows[0]
            const connectPaused = b.comingSoon || (b.onHold && !connected)
            return (
              <article
                key={b.id}
                style={{
                  ...panel,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  opacity: connectPaused ? 0.92 : 1,
                }}
              >
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <BrokerLogo name={b.name} color={b.color} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{b.name}</h2>
                      {b.comingSoon ? (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'var(--bg3)',
                            border: '1px solid var(--border-md)',
                            color: 'var(--text3)',
                          }}
                        >
                          Coming soon
                        </span>
                      ) : b.onHold && !connected ? (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: `${ON_HOLD}22`,
                            border: `1px solid ${ON_HOLD}55`,
                            color: ON_HOLD,
                          }}
                        >
                          On hold
                        </span>
                      ) : connected ? (
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: `${GREEN}22`,
                            border: `1px solid ${GREEN}55`,
                            color: GREEN,
                          }}
                        >
                          Connected
                        </span>
                      ) : null}
                    </div>
                    <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text2)', lineHeight: 1.45, fontWeight: 500 }}>
                      {b.description}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {b.features.map(f => (
                    <FeatureBadge key={f} label={f} />
                  ))}
                </div>
                <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                  {connectPaused ? (
                    <button
                      type="button"
                      disabled
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg3)',
                        color: 'var(--text3)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'not-allowed',
                      }}
                    >
                      {b.onHold && !b.comingSoon ? 'Connect (on hold)' : 'Connect'}
                    </button>
                  ) : connected ? (
                    <button
                      type="button"
                      onClick={() => disconnectBroker(b.id, primary)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: `1px solid ${RED}55`,
                        background: `${RED}12`,
                        color: '#FCA5A5',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => b.id === 'tradovate' && setTvModalOpen(true)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        background: accent,
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: `0 8px 24px ${accent}44`,
                      }}
                    >
                      Connect
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>

        {tradovateConnections.length > 0 && selectedConnection ? (
          <section style={{ ...panel, marginBottom: '28px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '14px', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Tradovate · connection detail
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', fontWeight: 600 }}>Last sync</div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{formatRelativeTime(selectedConnection.last_sync_at)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: selectedConnection.sync_status === 'error' ? RED : GREEN,
                    boxShadow: `0 0 12px ${selectedConnection.sync_status === 'error' ? RED : GREEN}88`,
                  }}
                  aria-hidden
                />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>
                  {selectedConnection.sync_status === 'syncing' ? 'Syncing…' : selectedConnection.sync_status === 'error' ? 'Error' : 'Healthy'}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', fontWeight: 600 }}>Trades imported</div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{selectedConnection.trades_imported ?? 0}</div>
              </div>
              <div>
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={syncBusy}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    border: `1px solid ${accent}66`,
                    background: `${accent}22`,
                    color: accent,
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: syncBusy ? 'wait' : 'pointer',
                    opacity: syncBusy ? 0.75 : 1,
                  }}
                >
                  {syncBusy ? 'Syncing…' : 'Sync now'}
                </button>
              </div>
            </div>

            {tradovateConnections.length > 1 ? (
              <div style={{ marginTop: '16px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                  Account
                </label>
                <select
                  id="brokers-tv-connection"
                  name="brokers-tv-connection"
                  value={selectedConnectionId || ''}
                  onChange={e => setSelectedConnectionId(e.target.value)}
                  autoComplete="off"
                  style={{ maxWidth: '320px', fontWeight: 500 }}
                >
                  {tradovateConnections.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.account_name || c.account_id || c.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Sync log (last 5)
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
                {(Array.isArray(selectedConnection.sync_events) ? selectedConnection.sync_events : []).slice(0, 5).map((ev, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}
                  >
                    <span style={{ color: ev.ok === false ? RED : 'var(--text2)' }}>{ev.message || 'Event'}</span>
                    <span style={{ color: 'var(--text3)', fontFamily: 'monospace', flexShrink: 0 }}>
                      {ev.at ? new Date(ev.at).toLocaleString() : '—'}
                    </span>
                  </li>
                ))}
                {(!selectedConnection.sync_events || selectedConnection.sync_events.length === 0) && (
                  <li style={{ color: 'var(--text3)', fontSize: '12px' }}>No sync events yet.</li>
                )}
              </ul>
            </div>
          </section>
        ) : null}

        <section style={panel}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>Import settings</h3>
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '18px', fontWeight: 500 }}>
            Controls how Pulsed pulls and normalizes trades after you connect a broker.
          </p>
          <div style={{ display: 'grid', gap: '16px', maxWidth: '520px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                Initial import date range
              </label>
              <select
                id="brokers-import-range"
                name="brokers-import-range"
                value={importRange}
                onChange={e => setImportRange(e.target.value)}
                autoComplete="off"
                style={{ fontWeight: 500 }}
              >
                {IMPORT_RANGE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                Auto-sync frequency
              </label>
              <select
                id="brokers-sync-frequency"
                name="brokers-sync-frequency"
                value={syncFreq}
                onChange={e => setSyncFreq(e.target.value)}
                autoComplete="off"
                style={{ fontWeight: 500 }}
              >
                {SYNC_FREQ_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                Default Pulsed account (pre-selected when connecting Tradovate)
              </label>
              <select
                id="brokers-default-map-account"
                name="brokers-default-map-account"
                value={mapAccount}
                onChange={e => setMapAccount(e.target.value)}
                autoComplete="off"
                style={{ fontWeight: 500 }}
              >
                <option value="">None — choose in connect flow</option>
                {pulsedAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name || 'Unnamed'}{a.type ? ` · ${a.type}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <label htmlFor="brokers-session-categorization" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
              <input
                id="brokers-session-categorization"
                name="brokers-session-categorization"
                type="checkbox"
                checked={sessionCat}
                onChange={e => setSessionCat(e.target.checked)}
                autoComplete="off"
                style={{ accentColor: accent, width: '18px', height: '18px' }}
              />
              Automatically categorize trades by session
            </label>
            <label htmlFor="brokers-auto-commissions" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
              <input
                id="brokers-auto-commissions"
                name="brokers-auto-commissions"
                type="checkbox"
                checked={autoCommissions}
                onChange={e => setAutoCommissions(e.target.checked)}
                autoComplete="off"
                style={{ accentColor: accent, width: '18px', height: '18px' }}
              />
              Auto-calculate commissions from broker data
            </label>
          </div>
        </section>
      </div>

      {tvModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tv-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 300,
            background: 'rgba(0,0,0,0.78)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: 'max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px))',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
          onClick={e => { if (e.target === e.currentTarget && tvStep !== 3) setTvModalOpen(false) }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '440px',
              marginTop: 'clamp(12px, 4dvh, 40px)',
              marginBottom: '24px',
              flexShrink: 0,
              maxHeight: 'min(92dvh, calc(100vh - 32px))',
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
              borderRadius: '16px',
              border: '1px solid var(--border-md)',
              background: 'var(--card-bg)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
              padding: '24px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '18px' }}>
              <div>
                <h2 id="tv-modal-title" style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
                  Connect Tradovate
                </h2>
                <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text3)', fontWeight: 500, lineHeight: 1.45 }}>
                  Secure connection · TLS encrypted
                </p>
              </div>
              {tvStep !== 3 ? (
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setTvModalOpen(false)}
                  style={{
                    border: 'none',
                    background: 'var(--bg3)',
                    color: 'var(--text2)',
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontSize: '18px',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              ) : null}
            </div>

            {tvStep === 1 ? (
              <>
                <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px', fontWeight: 600 }}>Step 1 — Environment</p>
                <div style={{ display: 'grid', gap: '10px' }}>
                  <label htmlFor="tv-env-live" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', borderRadius: '12px', border: tvEnv === 'live' ? `2px solid ${accent}` : '1px solid var(--border)', background: 'var(--bg3)', cursor: 'pointer' }}>
                    <input id="tv-env-live" name="tv-env" type="radio" checked={tvEnv === 'live'} onChange={() => setTvEnv('live')} autoComplete="off" style={{ marginTop: '3px', accentColor: accent }} />
                    <span>
                      <span style={{ fontWeight: 700, display: 'block' }}>Live trading</span>
                      <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 500 }}>Real money account</span>
                    </span>
                  </label>
                  <label htmlFor="tv-env-demo" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px', borderRadius: '12px', border: tvEnv === 'demo' ? `2px solid ${accent}` : '1px solid var(--border)', background: 'var(--bg3)', cursor: 'pointer' }}>
                    <input id="tv-env-demo" name="tv-env" type="radio" checked={tvEnv === 'demo'} onChange={() => setTvEnv('demo')} autoComplete="off" style={{ marginTop: '3px', accentColor: accent }} />
                    <span>
                      <span style={{ fontWeight: 700, display: 'block' }}>Demo / simulation</span>
                      <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 500 }}>Paper trading account</span>
                    </span>
                  </label>
                </div>
                <p style={{ marginTop: '14px', fontSize: '11px', color: 'var(--text3)', lineHeight: 1.45, fontWeight: 500 }}>
                  Most prop firm accounts use <strong style={{ color: 'var(--text2)' }}>Live</strong> environment even during challenges.
                </p>
                <div style={{ marginTop: '16px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                    Import trades into Pulsed account
                  </label>
                  {pulsedAccounts.length ? (
                    <select
                      id="tradovate-pulsed-account"
                      name="tradovate-pulsed-account"
                      value={tvPulsedAccountId}
                      onChange={e => setTvPulsedAccountId(e.target.value)}
                      autoComplete="off"
                      style={{ fontWeight: 500 }}
                    >
                      {pulsedAccounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name || 'Unnamed'}{a.type ? ` · ${a.type}` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p style={{ fontSize: '12px', color: '#FCA5A5', lineHeight: 1.45 }}>
                      Add a trading account under{' '}
                      <Link href="/settings" style={{ color: accent }}>
                        Settings → Accounts
                      </Link>{' '}
                      first.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setTvStep(2)}
                  disabled={!tvPulsedAccountId}
                  style={{
                    marginTop: '18px',
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: accent,
                    color: '#fff',
                    fontWeight: 700,
                    cursor: !tvPulsedAccountId ? 'not-allowed' : 'pointer',
                    opacity: !tvPulsedAccountId ? 0.55 : 1,
                  }}
                >
                  Continue
                </button>
              </>
            ) : null}

            {tvStep === 2 ? (
              <>
                <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px', fontWeight: 600 }}>Step 2 — Credentials</p>
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div>
                    <label htmlFor="tradovate-username" style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Username</label>
                    <input id="tradovate-username" name="username" type="text" value={tvUser} onChange={e => setTvUser(e.target.value)} autoComplete="username" style={{ fontWeight: 500 }} />
                  </div>
                  <div>
                    <label htmlFor="tradovate-password" style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Password</label>
                    <input id="tradovate-password" name="password" type="password" value={tvPass} onChange={e => setTvPass(e.target.value)} autoComplete="current-password" style={{ fontWeight: 500 }} />
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.5, fontWeight: 500, margin: 0 }}>
                    Tradovate’s API usually needs an <strong style={{ color: 'var(--text2)' }}>API key</strong> from their developer portal (same environment as above). If you only use username and password, set{' '}
                    <code style={{ fontSize: '10px' }}>TRADOVATE_API_CID</code> and <code style={{ fontSize: '10px' }}>TRADOVATE_API_SEC</code> on the server instead.
                  </p>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                      API client ID (cid)
                      <InfoTooltip text="Shown when you create an API application in Tradovate. Numeric id paired with the secret below." />
                    </label>
                    <input
                      id="tradovate-api-cid"
                      name="tradovate-api-cid"
                      type="text"
                      inputMode="numeric"
                      value={tvApiCid}
                      onChange={e => setTvApiCid(e.target.value)}
                      placeholder="e.g. 12345"
                      autoComplete="off"
                      style={{ fontWeight: 500 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                      API secret
                      <InfoTooltip text="The secret string from the same API key. Stored encrypted like your password." />
                    </label>
                    <input
                      id="tradovate-api-secret"
                      name="tradovate-api-secret"
                      type="password"
                      value={tvApiSec}
                      onChange={e => setTvApiSec(e.target.value)}
                      placeholder="From Tradovate API key"
                      autoComplete="new-password"
                      style={{ fontWeight: 500 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                      Device ID
                      <InfoTooltip text="A unique id Tradovate uses to recognize this app installation. Regenerated each time you open this dialog." />
                    </label>
                    <input id="tradovate-device-id" name="tradovate-device-id" type="text" readOnly value={deviceId} autoComplete="off" style={{ opacity: 0.85, fontWeight: 500, fontFamily: 'monospace', fontSize: '11px' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                      App ID
                      <InfoTooltip text="Must match the application name from your Tradovate API key (not necessarily “Pulsed”)." />
                    </label>
                    <input id="tradovate-app-id" name="tradovate-app-id" type="text" value={tvAppId} onChange={e => setTvAppId(e.target.value)} placeholder="Pulsed" autoComplete="off" style={{ fontWeight: 500 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>App version</label>
                    <input id="tradovate-app-version" name="tradovate-app-version" type="text" readOnly value={tvAppVer} autoComplete="off" style={{ fontWeight: 500 }} />
                  </div>
                </div>
                <p style={{ marginTop: '14px', fontSize: '11px', color: 'var(--text3)', lineHeight: 1.5, fontWeight: 500 }}>
                  Credentials are sent over TLS to Pulsed, encrypted with AES-256-GCM on the server, and stored encrypted in Supabase. Tokens are not returned to the browser.
                </p>
                {tvError ? <p style={{ marginTop: '10px', fontSize: '12px', color: '#FCA5A5' }}>{tvError}</p> : null}
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                  <button
                    type="button"
                    onClick={() => setTvStep(1)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg3)',
                      color: 'var(--text2)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={tvBusy || !tvUser.trim() || !tvPass}
                    onClick={async () => {
                      setTvStep(3)
                      await handleTradovateConnect()
                    }}
                    style={{
                      flex: 2,
                      padding: '12px',
                      borderRadius: '10px',
                      border: 'none',
                      background: accent,
                      color: '#fff',
                      fontWeight: 700,
                      cursor: tvBusy || !tvUser.trim() || !tvPass ? 'not-allowed' : 'pointer',
                      opacity: tvBusy || !tvUser.trim() || !tvPass ? 0.6 : 1,
                    }}
                  >
                    Connect
                  </button>
                </div>
              </>
            ) : null}

            {tvStep === 3 ? (
              <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                {tvBusy && previewTrades.length === 0 ? (
                  <>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        margin: '0 auto 16px',
                        borderRadius: '50%',
                        border: '3px solid var(--border-md)',
                        borderTopColor: accent,
                        animation: 'brokers-spin 0.85s linear infinite',
                      }}
                      aria-hidden
                    />
                    <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text2)' }}>Connecting…</p>
                    <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text3)', fontWeight: 500 }}>
                      Securing your session
                    </p>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        width: '56px',
                        height: '56px',
                        margin: '0 auto 16px',
                        borderRadius: '50%',
                        background: `${GREEN}22`,
                        border: `2px solid ${GREEN}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '28px',
                      }}
                      aria-hidden
                    >
                      ✓
                    </div>
                    <p style={{ fontSize: '16px', fontWeight: 700, color: GREEN }}>Connected</p>
                    <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text2)', fontWeight: 500 }}>
                      {tvSuccessMeta?.accountName ? (
                        <>
                          <span style={{ color: 'var(--text)' }}>{tvSuccessMeta.accountName}</span>
                          {' · '}
                          {tvSuccessMeta.tradesFound > 0
                            ? `${tvSuccessMeta.tradesFound} new trade${tvSuccessMeta.tradesFound === 1 ? '' : 's'} imported`
                            : 'No new trades in the initial window'}
                        </>
                      ) : (
                        'Importing your trades…'
                      )}
                    </p>
                    <div style={{ marginTop: '18px', textAlign: 'left' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px', fontWeight: 600 }}>Preview</div>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '6px' }}>
                        {previewTrades.map((t, i) => (
                          <li
                            key={i}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              background: 'var(--bg3)',
                              border: '1px solid var(--border)',
                              fontSize: '12px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontWeight: 500,
                            }}
                          >
                            <span>
                              {t.symbol} · {t.side}
                            </span>
                            <span
                              style={{
                                color:
                                  String(t.pnl).startsWith('+')
                                    ? GREEN
                                    : String(t.pnl).startsWith('-')
                                      ? RED
                                      : 'var(--text2)',
                              }}
                            >
                              {t.pnl}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes brokers-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
