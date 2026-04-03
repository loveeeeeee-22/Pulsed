import WebSocket from 'ws'

const DEFAULT_LIVE_BASE = 'https://live.tradovateapi.com/v1'
const DEFAULT_DEMO_BASE = 'https://demo.tradovateapi.com/v1'
const DEFAULT_MD_WS = 'wss://md.tradovateapi.com/v1/websocket'

const MONTH_CODES = {
  F: 1,
  G: 2,
  H: 3,
  J: 4,
  K: 5,
  M: 6,
  N: 7,
  Q: 8,
  U: 9,
  V: 10,
  X: 11,
  Z: 12,
}
const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function baseUrlForEnvironment(environment) {
  const e = environment === 'demo' ? 'demo' : 'live'
  if (e === 'demo') {
    return (process.env.TRADOVATE_DEMO_API_BASE || DEFAULT_DEMO_BASE).replace(/\/$/, '')
  }
  return (process.env.TRADOVATE_LIVE_API_BASE || process.env.TRADOVATE_API_BASE_LIVE || DEFAULT_LIVE_BASE).replace(/\/$/, '')
}

/**
 * ET clock parts for session bucketing (Asian / London / New York / Other).
 */
export function sessionFromEntryTimestampMs(ms) {
  const d = new Date(ms)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d)
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  const hm = hour * 60 + minute
  if (hm >= 18 * 60 && hm < 24 * 60) return 'Asian'
  if (hm >= 3 * 60 && hm < 8 * 60 + 30) return 'London'
  if (hm >= 9 * 60 + 30 && hm < 16 * 60) return 'New York'
  return 'Other'
}

function toDateStringUtc(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

function toTimeStringUtc(ms) {
  return new Date(ms).toISOString().slice(11, 19)
}

/**
 * NQU3 → display "NQ (Sep 2023)"
 */
export function normalizeSymbol(tradovateSymbol) {
  const raw = String(tradovateSymbol || '').trim().toUpperCase()
  if (!raw) return ''
  const m = raw.match(/^([A-Z0-9]+)([FGHJKMNQUVXZ])(\d{1,4})$/)
  if (!m) return raw
  const [, root, monthLetter, y] = m
  const monthNum = MONTH_CODES[monthLetter]
  if (!monthNum) return raw
  let year = Number(y)
  if (y.length === 1) year = 2010 + year
  else if (y.length === 2) year = 2000 + year
  const mon = MONTH_ABBR[monthNum] || monthLetter
  return `${root} (${mon} ${year})`
}

function extractRootSymbol(tradovateSymbol) {
  const n = normalizeSymbol(tradovateSymbol)
  const p = n.indexOf(' (')
  return p > 0 ? n.slice(0, p) : String(tradovateSymbol || '').replace(/\d+/g, '').slice(0, 8) || tradovateSymbol
}

export class TradovateClient {
  /**
   * @param {{ environment?: 'live'|'demo' }} [options]
   */
  constructor(options = {}) {
    this.environment = options.environment === 'demo' ? 'demo' : 'live'
    this.baseUrl = baseUrlForEnvironment(this.environment)
    this._accessToken = null
    this._mdAccessToken = null
    this._expiresAtMs = 0
    this._authBody = null
  }

  /**
   * @param {string} username
   * @param {string} password
   * @param {string} deviceId
   * @param {string} appId
   * @param {string} appVersion
   * @param {'live'|'demo'} environment
   * @param {{ cid?: string|number, sec?: string }} [partner] Per-user API key from Tradovate developer portal; falls back to TRADOVATE_API_CID / TRADOVATE_API_SEC.
   */
  async authenticate(username, password, deviceId, appId, appVersion, environment, partner = {}) {
    this.environment = environment === 'demo' ? 'demo' : 'live'
    this.baseUrl = baseUrlForEnvironment(this.environment)
    const envCidRaw = process.env.TRADOVATE_API_CID
    const envSec = process.env.TRADOVATE_API_SEC || ''
    const usePartnerCid =
      partner.cid !== undefined && partner.cid !== null && String(partner.cid).trim() !== ''
    const usePartnerSec =
      partner.sec !== undefined && partner.sec !== null && String(partner.sec) !== ''
    const cidRaw = usePartnerCid ? String(partner.cid).trim() : String(envCidRaw ?? '').trim()
    const cid = cidRaw !== '' ? Number(cidRaw) || 0 : 0
    const sec = usePartnerSec ? String(partner.sec) : envSec

    const body = {
      name: username,
      password,
      appId: appId || 'Pulsed',
      appVersion: appVersion || '1.0.0',
      deviceId: deviceId || undefined,
      cid,
      sec,
    }
    this._authBody = { ...body }

    const url = `${this.baseUrl}/auth/accesstokenrequest`
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new TradovateApiError(`Auth HTTP ${res.status}`, res.status, data)
    }
    if (data.errorText) {
      throw new TradovateApiError(data.errorText || 'Tradovate authentication failed', res.status, data)
    }
    if (!data.accessToken) {
      throw new TradovateApiError('No accessToken in Tradovate response', res.status, data)
    }

    this._accessToken = data.accessToken
    this._mdAccessToken = data.mdAccessToken || data.accessToken
    this._expiresAtMs = parseExpirationMs(data.expirationTime)

    return {
      accessToken: this._accessToken,
      mdAccessToken: this._mdAccessToken,
      expiresAt: new Date(this._expiresAtMs).toISOString(),
      userId: data.userId,
    }
  }

  async ensureValidToken() {
    const now = Date.now()
    const refreshBefore = 5 * 60 * 1000
    if (this._accessToken && this._expiresAtMs - refreshBefore > now) {
      return
    }
    if (this._accessToken && this._expiresAtMs > now) {
      await this._renewAccessToken()
      return
    }
    if (this._authBody) {
      const { name, password, appId, appVersion, deviceId, cid, sec } = this._authBody
      const body = { name, password, appId, appVersion, deviceId, cid, sec }
      const url = `${this.baseUrl}/auth/accesstokenrequest`
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.errorText || !data.accessToken) {
        throw new TradovateApiError(data.errorText || `Re-auth failed (${res.status})`, res.status, data)
      }
      this._accessToken = data.accessToken
      this._mdAccessToken = data.mdAccessToken || data.accessToken
      this._expiresAtMs = parseExpirationMs(data.expirationTime)
      return
    }
    throw new TradovateApiError('Not authenticated', 401, {})
  }

  async _renewAccessToken() {
    const url = `${this.baseUrl}/auth/renewaccesstoken`
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${this._accessToken}`,
      },
      body: '{}',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.errorText || !data.accessToken) {
      this._accessToken = null
      this._expiresAtMs = 0
      throw new TradovateApiError(data.errorText || `Token renewal failed (${res.status})`, res.status, data)
    }
    this._accessToken = data.accessToken
    this._mdAccessToken = data.mdAccessToken || data.accessToken
    this._expiresAtMs = parseExpirationMs(data.expirationTime)
  }

  async _authorizedFetch(path, init = {}) {
    await this.ensureValidToken()
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`
    const headers = {
      Accept: 'application/json',
      ...init.headers,
      Authorization: `Bearer ${this._accessToken}`,
    }
    return fetchWithRetry(url, { ...init, headers })
  }

  /**
   * @returns {Promise<Array<{ id: string|number, name: string, balance: number|null, currency: string, isDemo: boolean }>>}
   */
  async getAccounts() {
    const res = await this._authorizedFetch('/account/list', { method: 'GET' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new TradovateApiError(`account/list failed (${res.status})`, res.status, data)
    }
    const list = Array.isArray(data) ? data : data?.accounts || data?.items || []
    return list.map(a => ({
      id: a.id ?? a.accountId ?? a.masterid ?? a.nickname,
      name: a.name ?? a.nickname ?? `Account ${a.id}`,
      balance: a.netLiq != null ? Number(a.netLiq) : a.balance != null ? Number(a.balance) : null,
      currency: a.currency || 'USD',
      isDemo: Boolean(a.simulated ?? a.isSimulated ?? this.environment === 'demo'),
    }))
  }

  /**
   * Fetch fills/orders and map to trades table shape.
   * Tradovate list endpoints vary; we merge order/list and fill/list when present.
   */
  async getOrders(accountId, startDate, endDate) {
    const startMs = new Date(`${startDate}T00:00:00.000Z`).getTime()
    const endMs = new Date(`${endDate}T23:59:59.999Z`).getTime()

    const buckets = []
    for (const path of ['/order/list', '/fill/list']) {
      try {
        const res = await this._authorizedFetch(path, { method: 'GET' })
        const raw = await res.json().catch(() => null)
        if (res.ok) {
          const arr = Array.isArray(raw) ? raw : raw?.orders || raw?.fills || raw?.items || []
          if (arr.length) buckets.push(...arr)
        }
      } catch {
        /* try next */
      }
    }

    const byKey = new Map()
    for (const row of buckets) {
      const acct = row.accountId ?? row.account ?? row.masterid ?? row.accountID
      if (accountId != null && String(acct) !== String(accountId)) continue

      const ts =
        row.timestamp ??
        row.time ??
        row.fillTime ??
        row.creationTimestamp ??
        row.lastUpdatedTime
      const tms = typeof ts === 'number' ? (ts > 1e12 ? ts : ts * 1000) : new Date(ts).getTime()
      if (!Number.isFinite(tms) || tms < startMs || tms > endMs) continue

      const sym = row.symbol ?? row.contractSymbol ?? row.productSymbol ?? ''
      const qty = Math.abs(Number(row.qty ?? row.quantity ?? row.size ?? row.fillQty ?? 0))
      const price = Number(row.price ?? row.avgPrice ?? row.avgPx ?? row.fillPrice ?? 0)
      const sideRaw = String(row.side ?? row.action ?? row.buySell ?? '').toLowerCase()
      const isLong = sideRaw.includes('buy') || sideRaw === 'b' || row.isBuy === true

      const commission = Math.abs(Number(row.commission ?? row.fee ?? row.fees ?? 0))
      const gross = Number(row.netPnl ?? row.pnl ?? row.profitLoss ?? row.realizedPnl ?? 0)
      const net = gross - commission

      const trade = {
        date: toDateStringUtc(tms),
        symbol: extractRootSymbol(sym),
        direction: isLong ? 'Long' : 'Short',
        contracts: qty || 1,
        entry_price: price,
        exit_price: price,
        gross_pnl: gross,
        fees: commission,
        net_pnl: net,
        status: net > 0 ? 'Win' : net < 0 ? 'Loss' : 'Breakeven',
        entry_time: toTimeStringUtc(tms),
        exit_time: toTimeStringUtc(tms),
        session: sessionFromEntryTimestampMs(tms),
        _dedupeKey: `${toDateStringUtc(tms)}|${extractRootSymbol(sym)}|${toTimeStringUtc(tms)}|${acct ?? ''}`,
      }
      if (!byKey.has(trade._dedupeKey)) byKey.set(trade._dedupeKey, trade)
    }

    return [...byKey.values()].map(({ _dedupeKey, ...t }) => t)
  }

  /**
   * @param {string} symbol Contract or symbol id as Tradovate expects
   * @param {'1'|'5'|'15'|'60'|'1D'} resolution
   * @param {number} startTime ms epoch
   * @param {number} endTime ms epoch
   */
  async getHistoricalBars(symbol, resolution, startTime, endTime) {
    await this.ensureValidToken()
    const mdToken = this._mdAccessToken || this._accessToken
    const unitNumber = resolution === '1D' ? 1 : Number(resolution) || 1
    const unit = resolution === '1D' ? 'Day' : 'Minute'

    const qs = new URLSearchParams({
      symbol: String(symbol),
      unit,
      unitNumber: String(unitNumber),
      startTime: String(startTime),
      endTime: String(endTime),
    })

    const paths = [
      `/md/historicaldata?${qs.toString()}`,
      `/md/getchart?${qs.toString()}`,
    ]

    let lastErr = null
    for (const path of paths) {
      try {
        const res = await this._authorizedFetch(path, {
          method: 'GET',
          headers: { Authorization: `Bearer ${mdToken}` },
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          lastErr = new TradovateApiError(`Historical ${res.status}`, res.status, data)
          continue
        }
        const candles = normalizeHistoricalCandles(data)
        if (candles.length) return candles
      } catch (e) {
        lastErr = e
      }
    }

    if (lastErr) throw lastErr
    return []
  }

  /**
   * Stream quote ticks (Node / long-running workers). Uses market-data WebSocket.
   * @returns {() => void} disconnect
   */
  subscribeToQuotes(symbol, callback) {
    const url = (process.env.TRADOVATE_MD_WS_URL || DEFAULT_MD_WS).replace(/\/$/, '')
    let ws
    let stopped = false
    let attempt = 0

    const connect = () => {
      if (stopped) return
      ws = new WebSocket(url)
      ws.on('open', () => {
        attempt = 0
        const token = this._mdAccessToken || this._accessToken
        if (token) {
          const authPayload = JSON.stringify({
            type: 'authorize',
            accessToken: token,
          })
          try {
            ws.send(authPayload)
          } catch {
            /* ignore */
          }
        }
        const sub = JSON.stringify({ type: 'subscribe', symbol })
        try {
          ws.send(sub)
        } catch {
          /* ignore */
        }
      })
      ws.on('message', (buf, isBinary) => {
        const text = isBinary ? buf.toString() : String(buf)
        try {
          callback(symbol, JSON.parse(text))
        } catch {
          callback(symbol, text)
        }
      })
      ws.on('close', () => {
        if (stopped) return
        const delay = Math.min(60_000, 1000 * 2 ** attempt++)
        setTimeout(connect, delay)
      })
      ws.on('error', () => {
        /* reconnect via close */
      })
    }

    connect()
    return () => {
      stopped = true
      try {
        ws?.close()
      } catch {
        /* ignore */
      }
    }
  }
}

export class TradovateApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'TradovateApiError'
    this.status = status
    this.body = body
  }
}

function parseExpirationMs(expirationTime) {
  if (!expirationTime) return Date.now() + 80 * 60 * 1000
  const t = new Date(expirationTime).getTime()
  return Number.isFinite(t) ? t : Date.now() + 80 * 60 * 1000
}

async function fetchWithRetry(url, options, { maxAttempts = 5 } = {}) {
  let lastError
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45_000)
    try {
      const res = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timer)
      if (res.status === 429 || res.status === 503) {
        const wait = Math.min(32_000, 800 * 2 ** attempt)
        await sleep(wait)
        continue
      }
      return res
    } catch (e) {
      clearTimeout(timer)
      lastError = e
      const wait = Math.min(32_000, 800 * 2 ** attempt)
      await sleep(wait)
    }
  }
  throw lastError || new Error('Network error after retries')
}

function normalizeHistoricalCandles(data) {
  if (!data) return []
  const raw = Array.isArray(data) ? data : data.bars || data.candles || data.data || data.chartData || []
  return raw
    .map(b => {
      const time =
        b.time ??
        b.t ??
        b.timestamp ??
        (typeof b[0] === 'number' ? b[0] : null)
      const tMs = typeof time === 'number' ? (time > 1e12 ? time : time * 1000) : new Date(time).getTime()
      return {
        time: Number.isFinite(tMs) ? tMs : 0,
        open: Number(b.open ?? b.o ?? b[1]),
        high: Number(b.high ?? b.h ?? b[2]),
        low: Number(b.low ?? b.l ?? b[3]),
        close: Number(b.close ?? b.c ?? b[4]),
        volume: Number(b.volume ?? b.v ?? b[5] ?? 0),
      }
    })
    .filter(c => c.time && Number.isFinite(c.open))
}
