'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getAccountsForUser } from '@/lib/getAccountsForUser'

const GREEN = '#22C55E'
const RED = '#EF4444'
const AMBER = '#F59E0B'
const MT5_ACCOUNT_LS = 'pulsed_mt5_account_id'

function formatRelativeMinutesAgo(isoMs) {
  if (!Number.isFinite(isoMs)) return null
  const diff = Date.now() - isoMs
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.floor(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

function parseTradeInstantUtc(dateStr, timeStr) {
  if (!dateStr || !timeStr) return NaN
  const d = new Date(`${dateStr}T${timeStr}Z`)
  return d.getTime()
}

function displayDirection(d) {
  if (!d) return '—'
  const s = String(d)
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function serverBaseUrl() {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL) {
    return String(process.env.NEXT_PUBLIC_APP_URL).replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') return window.location.origin
  return 'https://pulsed-ochre.vercel.app'
}

export default function Mt5SettingsPage() {
  const [accent, setAccent] = useState('#7C3AED')
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [apiKey, setApiKey] = useState(null)
  const [keyLoading, setKeyLoading] = useState(true)
  const [keyActionBusy, setKeyActionBusy] = useState(false)
  const [copyState, setCopyState] = useState('idle')
  const [mt5Count, setMt5Count] = useState(0)
  const [lastReceivedMs, setLastReceivedMs] = useState(null)
  const [recentMt5, setRecentMt5] = useState([])
  const [statsError, setStatsError] = useState(null)
  const [testBusy, setTestBusy] = useState(false)
  const [testMsg, setTestMsg] = useState(null)

  useEffect(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('accentColor') : null
    const next = raw && /^#[0-9A-Fa-f]{6}$/.test(raw.trim()) ? raw.trim() : '#7C3AED'
    setAccent(next)
    document.documentElement.style.setProperty('--accent', next)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const rows = await getAccountsForUser()
      if (cancelled) return
      setAccounts(rows || [])
      const stored = typeof window !== 'undefined' ? localStorage.getItem(MT5_ACCOUNT_LS) : null
      const ids = new Set((rows || []).map((a) => a.id))
      if (stored && ids.has(stored)) {
        setSelectedAccountId(stored)
      } else if (rows?.length === 1) {
        setSelectedAccountId(rows[0].id)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const persistAccount = useCallback((id) => {
    setSelectedAccountId(id)
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem(MT5_ACCOUNT_LS, id)
      else localStorage.removeItem(MT5_ACCOUNT_LS)
    }
  }, [])

  const loadApiKey = useCallback(async () => {
    setKeyLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) {
        setApiKey(null)
        return
      }
      const { data, error } = await supabase
        .from('user_api_keys')
        .select('api_key')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      setApiKey(data?.api_key ?? null)
    } catch {
      setApiKey(null)
    } finally {
      setKeyLoading(false)
    }
  }, [])

  const loadMt5Stats = useCallback(async () => {
    setStatsError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) {
        setMt5Count(0)
        setLastReceivedMs(null)
        setRecentMt5([])
        return
      }

      const acctRows = await getAccountsForUser()
      const ids = (acctRows || []).map((a) => a.id)
      if (!ids.length) {
        setMt5Count(0)
        setLastReceivedMs(null)
        setRecentMt5([])
        return
      }

      const { count, error: cErr } = await supabase
        .from('trades')
        .select('*', { count: 'exact', head: true })
        .in('account_id', ids)
        .not('mt5_ticket', 'is', null)

      if (cErr) throw cErr
      setMt5Count(count ?? 0)

      const { data: latest, error: lErr } = await supabase
        .from('trades')
        .select('date, entry_time')
        .in('account_id', ids)
        .not('mt5_ticket', 'is', null)
        .order('date', { ascending: false })
        .order('entry_time', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lErr) throw lErr
      if (latest?.date && latest?.entry_time) {
        setLastReceivedMs(parseTradeInstantUtc(latest.date, latest.entry_time))
      } else {
        setLastReceivedMs(null)
      }

      const { data: recent, error: rErr } = await supabase
        .from('trades')
        .select('id, date, entry_time, symbol, direction, net_pnl, account_id')
        .in('account_id', ids)
        .not('mt5_ticket', 'is', null)
        .order('date', { ascending: false })
        .order('entry_time', { ascending: false })
        .limit(10)

      if (rErr) throw rErr
      setRecentMt5(recent || [])
    } catch (e) {
      setStatsError(e?.message || 'Could not load MT5 trade stats.')
      setMt5Count(0)
      setLastReceivedMs(null)
      setRecentMt5([])
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([loadApiKey(), loadMt5Stats()])
    setLoading(false)
  }, [loadApiKey, loadMt5Stats])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  const connected = mt5Count > 0
  const lastSyncLabel = formatRelativeMinutesAgo(lastReceivedMs)

  const serverUrl = serverBaseUrl()

  async function callUserApiKeyAction(action) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('You must be signed in.')
    }
    const res = await fetch('/api/mt5/user-api-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`)
    return json
  }

  async function handleGenerateKey() {
    setKeyActionBusy(true)
    try {
      const json = await callUserApiKeyAction('create')
      if (json.api_key) setApiKey(json.api_key)
    } catch (e) {
      alert(e?.message || 'Could not generate API key.')
    } finally {
      setKeyActionBusy(false)
    }
  }

  async function handleRegenerateKey() {
    if (
      !window.confirm(
        'Regenerate your API key? Your current key will stop working immediately. Update the Expert Advisor inputs with the new key.',
      )
    ) {
      return
    }
    setKeyActionBusy(true)
    try {
      const json = await callUserApiKeyAction('regenerate')
      if (json.api_key) setApiKey(json.api_key)
    } catch (e) {
      alert(e?.message || 'Could not regenerate API key.')
    } finally {
      setKeyActionBusy(false)
    }
  }

  async function handleCopyKey() {
    if (!apiKey) return
    try {
      await navigator.clipboard.writeText(apiKey)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch {
      setCopyState('failed')
      setTimeout(() => setCopyState('idle'), 2500)
    }
  }

  async function handleTestConnection() {
    setTestMsg(null)
    if (!apiKey?.trim()) {
      setTestMsg({ type: 'error', text: 'Generate an API key first.' })
      return
    }
    if (!selectedAccountId) {
      setTestMsg({ type: 'error', text: 'Select a Pulsed account to map MT5 trades into.' })
      return
    }
    setTestBusy(true)
    try {
      const res = await fetch('/api/mt5/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_connection: true,
          api_key: apiKey.trim(),
          account_id: selectedAccountId,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 401) {
        setTestMsg({ type: 'error', text: json.error || 'Invalid API key' })
        return
      }
      if (!res.ok) {
        setTestMsg({
          type: 'error',
          text: json.message || json.error || `Request failed (${res.status})`,
        })
        return
      }
      if (json.status === 'success' && json.test) {
        setTestMsg({ type: 'ok', text: json.message || 'Connection verified.' })
      } else {
        setTestMsg({ type: 'ok', text: json.message || 'OK' })
      }
    } catch (e) {
      setTestMsg({ type: 'error', text: e?.message || 'Network error' })
    } finally {
      setTestBusy(false)
    }
  }

  const panel = {
    border: '1px solid var(--border)',
    borderRadius: '12px',
    background: 'var(--card-bg)',
    padding: '18px',
  }

  const sectionTitle = {
    fontSize: '11px',
    fontFamily: 'monospace',
    color: 'var(--text3)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '10px',
  }

  const btnPrimary = {
    borderRadius: '8px',
    border: `1px solid ${accent}`,
    background: `${accent}22`,
    color: accent,
    padding: '8px 14px',
    fontSize: '12px',
    fontFamily: 'monospace',
    fontWeight: 600,
    cursor: 'pointer',
  }

  const btnGhost = {
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--bg3)',
    color: 'var(--text2)',
    padding: '8px 14px',
    fontSize: '12px',
    fontFamily: 'monospace',
    fontWeight: 600,
    cursor: 'pointer',
  }

  const codeBox = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '12px',
    lineHeight: 1.5,
    padding: '12px 14px',
    borderRadius: '10px',
    background: 'var(--bg3)',
    border: '1px solid var(--border-md)',
    color: 'var(--text)',
    wordBreak: 'break-all',
  }

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '26px 24px 48px' }}>
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

        <header style={{ marginBottom: '28px', borderBottom: '1px solid var(--border)', paddingBottom: '18px' }}>
          <p
            style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              color: 'var(--text3)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Pulsed
          </p>
          <h1 style={{ marginTop: '6px', fontSize: '28px', fontWeight: 700 }}>MT5 Connect</h1>
          <p style={{ marginTop: '10px', maxWidth: '640px', fontSize: '14px', color: 'var(--text2)', lineHeight: 1.55 }}>
            Connect MetaTrader 5 to Pulsed with a private API key. Closed trades are sent from the Expert Advisor on your
            machine to your journal.
          </p>
        </header>

        {statsError ? (
          <div
            role="alert"
            style={{
              marginBottom: '16px',
              padding: '12px 14px',
              borderRadius: '10px',
              border: `1px solid ${RED}55`,
              background: `${RED}12`,
              color: '#FCA5A5',
              fontSize: '13px',
            }}
          >
            {statsError}{' '}
            <span style={{ color: 'var(--text3)' }}>
              Apply the <code style={{ fontFamily: 'monospace' }}>user_api_keys</code> and{' '}
              <code style={{ fontFamily: 'monospace' }}>mt5_ticket</code> migration if you have not yet.
            </span>
          </div>
        ) : null}

        {/* Section 1 — Status */}
        <section style={{ ...panel, marginBottom: '16px' }}>
          <div style={sectionTitle}>Connection status</div>
          {loading ? (
            <p style={{ color: 'var(--text3)', fontFamily: 'monospace', fontSize: '12px' }}>Loading…</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: connected ? GREEN : 'var(--text3)',
                    flexShrink: 0,
                    boxShadow: connected ? `0 0 12px ${GREEN}88` : 'none',
                  }}
                  aria-hidden
                />
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: connected ? GREEN : 'var(--text2)' }}>
                    {connected ? 'Connected' : 'Not connected'}
                  </div>
                  {!connected ? (
                    <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px', maxWidth: '420px' }}>
                      No MT5 trades have been recorded yet. After the EA sends a closed trade, status updates here.
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
                      Last trade received{' '}
                      <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{lastSyncLabel || '—'}</span>
                    </div>
                  )}
                </div>
              </div>
              <div
                style={{
                  marginLeft: 'auto',
                  textAlign: 'right',
                  minWidth: '140px',
                }}
              >
                <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase' }}>
                  Auto-imported
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                  {mt5Count}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>total MT5 trades</div>
              </div>
            </div>
          )}
        </section>

        {/* Section 2 — API key */}
        <section style={{ ...panel, marginBottom: '16px' }}>
          <div style={sectionTitle}>Your API key</div>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px', lineHeight: 1.5 }}>
            Treat this like a password. Anyone with the key can post trades into your mapped account.
          </p>

          {keyLoading ? (
            <p style={{ color: 'var(--text3)', fontFamily: 'monospace', fontSize: '12px' }}>Loading key…</p>
          ) : apiKey ? (
            <>
              <label htmlFor="api-key" style={{ display: 'block', fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginBottom: '6px' }}>
                Secret key
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'stretch' }}>
                <input
                  id="api-key"
                  name="api-key"
                  type="text"
                  readOnly
                  autoComplete="off"
                  value={apiKey}
                  style={{
                    flex: '1 1 240px',
                    minWidth: 0,
                    ...codeBox,
                    outline: 'none',
                    letterSpacing: '0.02em',
                  }}
                />
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={handleCopyKey} disabled={keyActionBusy} style={btnGhost}>
                    {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
                  </button>
                  <button type="button" onClick={handleRegenerateKey} disabled={keyActionBusy} style={{ ...btnGhost, borderColor: `${AMBER}66`, color: AMBER }}>
                    {keyActionBusy ? 'Working…' : 'Regenerate'}
                  </button>
                </div>
              </div>
              <p style={{ marginTop: '12px', fontSize: '11px', color: AMBER, fontFamily: 'monospace' }}>
                Regenerating invalidates the previous key. Update MT5 EA inputs or imports will fail.
              </p>
            </>
          ) : (
            <div>
              <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '12px' }}>
                No active key yet. Generate one to use in the Expert Advisor.
              </p>
              <button type="button" onClick={handleGenerateKey} disabled={keyActionBusy} style={btnPrimary}>
                {keyActionBusy ? 'Generating…' : 'Generate API key'}
              </button>
            </div>
          )}
        </section>

        {/* Section 3 — Account mapping */}
        <section style={{ ...panel, marginBottom: '16px' }}>
          <div style={sectionTitle}>Account mapping</div>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '12px', lineHeight: 1.5 }}>
            Choose which Pulsed journal account receives MT5 closes. Copy the account ID into the EA.
          </p>
          {accounts.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text3)' }}>
              No accounts yet.{' '}
              <Link href="/settings" style={{ color: accent }}>
                Add an account in Settings
              </Link>
              .
            </p>
          ) : (
            <>
              <select
                id="mt5-account-mapping"
                name="mt5-account-mapping"
                value={selectedAccountId}
                onChange={(e) => persistAccount(e.target.value)}
                autoComplete="off"
                style={{
                  width: '100%',
                  maxWidth: '420px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg3)',
                  color: 'var(--text)',
                  padding: '10px 12px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  marginBottom: '14px',
                }}
              >
                <option value="">Select account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || 'Unnamed'} ({a.type || 'account'})
                  </option>
                ))}
              </select>
              <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', marginBottom: '6px' }}>
                Account ID (for EA)
              </div>
              <pre style={{ ...codeBox, margin: 0 }}>{selectedAccountId || '— select an account —'}</pre>
              {selectedAccount ? (
                <p style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text3)' }}>
                  Mapping to <span style={{ color: 'var(--text2)' }}>{selectedAccount.name || 'Unnamed'}</span>
                </p>
              ) : null}
            </>
          )}
        </section>

        {/* Section 4 — Setup */}
        <section style={{ ...panel, marginBottom: '16px' }}>
          <div style={sectionTitle}>Setup</div>
          <ol style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '20px', color: 'var(--text2)', fontSize: '13px', lineHeight: 1.55 }}>
            <li>
              <strong style={{ color: 'var(--text)' }}>Download the Expert Advisor</strong>
              <p style={{ margin: '8px 0 10px' }}>
                This script runs inside MT5 and sends your closed trades to Pulsed.
              </p>
              <a
                href="/downloads/PulsedEA.mq5"
                download="PulsedEA.mq5"
                style={{ ...btnPrimary, display: 'inline-block', textDecoration: 'none' }}
              >
                Download PulsedEA.mq5
              </a>
            </li>
            <li>
              <strong style={{ color: 'var(--text)' }}>Install in MT5</strong>
              <ol style={{ margin: '10px 0 0', paddingLeft: '18px', display: 'grid', gap: '6px' }}>
                <li>Open MT5</li>
                <li>Click File → Open Data Folder</li>
                <li>Navigate to MQL5 → Experts</li>
                <li>Copy PulsedEA.mq5 into that folder</li>
                <li>Restart MT5 or press F5 to refresh</li>
                <li>In the Navigator panel find PulsedEA under Expert Advisors</li>
              </ol>
            </li>
            <li>
              <strong style={{ color: 'var(--text)' }}>Configure the EA</strong>
              <ol style={{ margin: '10px 0 0', paddingLeft: '18px', display: 'grid', gap: '6px' }}>
                <li>Drag PulsedEA onto any chart</li>
                <li>
                  In the settings enter:
                  <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'monospace', marginBottom: '4px' }}>API Key</div>
                      <pre style={{ ...codeBox, margin: 0 }}>{apiKey || '— generate a key above —'}</pre>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'monospace', marginBottom: '4px' }}>Account ID</div>
                      <pre style={{ ...codeBox, margin: 0 }}>{selectedAccountId || '— select an account above —'}</pre>
                    </div>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'monospace', marginBottom: '4px' }}>Server URL</div>
                      <pre style={{ ...codeBox, margin: 0 }}>{serverUrl}</pre>
                    </div>
                  </div>
                </li>
                <li>Enable &quot;Allow WebRequest&quot; in MT5 (Tools → Options → Expert Advisors) and add your server URL to the allowed list</li>
                <li>Click OK</li>
              </ol>
            </li>
            <li>
              <strong style={{ color: 'var(--text)' }}>Enable Auto Trading</strong>
              <p style={{ margin: '8px 0 0' }}>
                Turn on the Auto Trading button in MT5 (green). The EA will send each closed trade to Pulsed automatically.
              </p>
            </li>
          </ol>
        </section>

        {/* Section 5 — Test */}
        <section style={{ ...panel, marginBottom: '16px' }}>
          <div style={sectionTitle}>Test connection</div>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '12px', lineHeight: 1.5 }}>
            Sends a signed test request to the same endpoint as the EA. Nothing is written to your trade log.
          </p>
          <button type="button" onClick={handleTestConnection} disabled={testBusy} style={btnPrimary}>
            {testBusy ? 'Sending…' : 'Send test trade'}
          </button>
          {testMsg ? (
            <div
              role="status"
              style={{
                marginTop: '12px',
                padding: '10px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                border: `1px solid ${testMsg.type === 'ok' ? `${GREEN}55` : `${RED}55`}`,
                background: testMsg.type === 'ok' ? `${GREEN}14` : `${RED}12`,
                color: testMsg.type === 'ok' ? '#86EFAC' : '#FCA5A5',
              }}
            >
              {testMsg.text}
            </div>
          ) : null}
        </section>

        {/* Section 6 — History */}
        <section style={{ ...panel, marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={sectionTitle}>Sync history</div>
            <Link href="/trade-log" style={{ fontSize: '12px', fontFamily: 'monospace', color: accent }}>
              Open trade log →
            </Link>
          </div>
          {recentMt5.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '8px' }}>No MT5-imported trades yet.</p>
          ) : (
            <div style={{ marginTop: '8px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'monospace' }}>
                <thead>
                  <tr style={{ color: 'var(--text3)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Date</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Time</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Symbol</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Dir</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>P&amp;L</th>
                    <th style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }} />
                  </tr>
                </thead>
                <tbody>
                  {recentMt5.map((t) => {
                    const pnl = Number(t.net_pnl || 0)
                    return (
                      <tr key={t.id} style={{ color: 'var(--text2)' }}>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-md)' }}>{t.date || '—'}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-md)' }}>{t.entry_time || '—'}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-md)' }}>{t.symbol || '—'}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-md)' }}>{displayDirection(t.direction)}</td>
                        <td
                          style={{
                            padding: '8px 6px',
                            borderBottom: '1px solid var(--border-md)',
                            textAlign: 'right',
                            color: pnl >= 0 ? GREEN : RED,
                            fontWeight: 600,
                          }}
                        >
                          {pnl >= 0 ? '+' : ''}
                          {pnl.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border-md)' }}>
                          <Link href="/trade-log" style={{ color: accent, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            View in trade log
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
