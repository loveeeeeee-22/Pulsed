export const dynamic = 'force-dynamic'

function toISODate(d) {
  return d.toISOString().slice(0, 10)
}

function parseDateTime(dateStr, timeStr, fallbackHour = 9, fallbackMinute = 30) {
  if (!dateStr) return null
  const hasTime = typeof timeStr === 'string' && timeStr.includes(':')
  const [hh, mm] = hasTime ? timeStr.split(':').map(v => Number(v || 0)) : [fallbackHour, fallbackMinute]
  const d = new Date(`${dateStr}T00:00:00`)
  d.setHours(Number.isFinite(hh) ? hh : fallbackHour, Number.isFinite(mm) ? mm : fallbackMinute, 0, 0)
  return d
}

function normalizePolygonBars(results = []) {
  return results.map(row => ({
    time: new Date(row.t).toISOString(),
    open: Number(row.o),
    high: Number(row.h),
    low: Number(row.l),
    close: Number(row.c),
    volume: Number(row.v || 0),
  }))
}

function normalizeTwelveData(values = []) {
  return [...values].reverse().map(row => ({
    time: new Date(row.datetime).toISOString(),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume || 0),
  }))
}

function buildSymbolCandidates(rawSymbol) {
  const raw = String(rawSymbol || '').trim().toUpperCase()
  if (!raw) return []

  const base = raw.replace(/[^A-Z0-9]/g, '')
  const compact = base.slice(0, 6)
  const digits = raw.replace(/[^0-9]/g, '')

  // Parse futures contract notation like MGCM6 / MGCM26 / MGCM2026
  // Month codes: F G H J K M N Q U V X Z
  const m = raw.match(/^([A-Z]{2,4})([FGHJKMNQUVXZ])(\d{1,4})$/)
  let futuresCandidates = []
  if (m) {
    const root = m[1]
    const month = m[2]
    const yearRaw = m[3]
    const year =
      yearRaw.length === 4 ? yearRaw :
        yearRaw.length === 2 ? `20${yearRaw}` :
          `202${yearRaw}` // single-digit year shorthand used in many retail platforms
    futuresCandidates = [
      `${root}${month}${yearRaw}`,
      `${root}${month}${year}`,
      `${root}${month}`,
      root,
    ]
  }

  const aliases = {
    MGC: ['XAU/USD', 'XAUUSD', 'GOLD', 'GC'],
    GC: ['XAU/USD', 'XAUUSD', 'GOLD'],
    SI: ['XAG/USD', 'XAGUSD', 'SILVER'],
    SIL: ['XAG/USD', 'XAGUSD', 'SILVER'],
    CL: ['USOIL', 'WTIUSD', 'XTI/USD'],
    MCL: ['USOIL', 'WTIUSD', 'XTI/USD'],
    ES: ['SPX', 'US500', 'SPY'],
    MES: ['SPX', 'US500', 'SPY'],
    NQ: ['NDX', 'NASDAQ', 'QQQ'],
    MNQ: ['NDX', 'NASDAQ', 'QQQ'],
    YM: ['DJI', 'US30', 'DIA'],
    MYM: ['DJI', 'US30', 'DIA'],
    US30: ['DJI', 'YM', 'DIA'],
    WS30: ['DJI', 'YM', 'DIA'],
    DOW: ['DJI', 'DIA'],
    US500: ['SPX', 'ES', 'SPY'],
    SPX500: ['SPX', 'ES', 'SPY'],
    NAS100: ['NDX', 'NQ', 'NASDAQ', 'QQQ'],
    US100: ['NDX', 'NQ', 'NASDAQ', 'QQQ'],
    GER40: ['DAX', 'DE40', 'EWG'],
    UK100: ['FTSE', 'UKX', 'EWU'],
    M2K: ['RUT', 'US2000', 'IWM'],
  }

  let suffixStripped = []
  if (base.length >= 6) {
    const pair = base.slice(0, 6)
    if (['XAUUSD', 'XAGUSD', 'BTCUSD', 'ETHUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD'].includes(pair)) {
      suffixStripped = [`${pair.slice(0, 3)}/${pair.slice(3, 6)}`, pair]
    }
  }

  const fromAlias = aliases[compact] || []
  return [...new Set([raw, ...futuresCandidates, base, compact, ...fromAlias, ...suffixStripped].filter(Boolean))]
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const symbol = String(searchParams.get('symbol') || '').trim()
    const date = String(searchParams.get('date') || '').trim()
    const entryTime = String(searchParams.get('entry_time') || '').trim()
    const exitTime = String(searchParams.get('exit_time') || '').trim()
    const timeframe = String(searchParams.get('timeframe') || '1min').trim()
    const count = Math.min(Math.max(Number(searchParams.get('count') || 300), 30), 1200)

    if (!symbol) {
      return Response.json({ error: 'Missing symbol.' }, { status: 400 })
    }

    const provider = (process.env.MARKET_DATA_PROVIDER || '').toLowerCase()
    const fromDate = parseDateTime(date, entryTime, 9, 30) || new Date(Date.now() - 24 * 60 * 60 * 1000)
    const toDate = parseDateTime(date, exitTime, 16, 0) || new Date(Date.now())
    toDate.setMinutes(toDate.getMinutes() + 60)
    fromDate.setMinutes(fromDate.getMinutes() - 180)

    if (provider === 'polygon' && process.env.POLYGON_API_KEY) {
      const multiplier = timeframe.startsWith('5') ? 5 : timeframe.startsWith('15') ? 15 : 1
      const from = toISODate(fromDate)
      const to = toISODate(toDate)
      const url = new URL(`https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${multiplier}/minute/${from}/${to}`)
      url.searchParams.set('adjusted', 'true')
      url.searchParams.set('sort', 'asc')
      url.searchParams.set('limit', String(count))
      url.searchParams.set('apiKey', process.env.POLYGON_API_KEY)
      const res = await fetch(url.toString(), { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || data?.status === 'ERROR') {
        return Response.json({ provider: 'polygon', error: data?.error || data?.message || 'Polygon request failed.' }, { status: 502 })
      }
      return Response.json({ provider: 'polygon', candles: normalizePolygonBars(data?.results || []) })
    }

    if ((provider === 'twelvedata' || !provider) && process.env.TWELVEDATA_API_KEY) {
      const candidates = buildSymbolCandidates(symbol)
      let lastError = ''

      for (const candidate of candidates) {
        const url = new URL('https://api.twelvedata.com/time_series')
        url.searchParams.set('symbol', candidate)
        url.searchParams.set('interval', timeframe)
        url.searchParams.set('start_date', fromDate.toISOString())
        url.searchParams.set('end_date', toDate.toISOString())
        url.searchParams.set('outputsize', String(Math.min(count, 800)))
        url.searchParams.set('apikey', process.env.TWELVEDATA_API_KEY)
        const res = await fetch(url.toString(), { cache: 'no-store' })
        const data = await res.json()

        const isError = !res.ok || data?.status === 'error'
        if (isError) {
          lastError = data?.message || 'TwelveData request failed.'
          continue
        }

        const candles = normalizeTwelveData(data?.values || [])
        if (candles.length > 0) {
          return Response.json({ provider: 'twelvedata', source_symbol: candidate, candles })
        }
      }

      return Response.json({
        provider: 'twelvedata',
        error: `No supported market symbol found for "${symbol}" (${candidates.join(', ')}). ${lastError}`.trim(),
      }, { status: 502 })
    }

    if ((provider === 'tiingo' || !provider) && process.env.TIINGO_API_KEY) {
      const candidates = buildSymbolCandidates(symbol)
      let lastError = ''

      for (const candidate of candidates) {
        const c = candidate.toLowerCase()
        const url = new URL(`https://api.tiingo.com/tiingo/fx/${c}/prices`)
        url.searchParams.set('resampleFreq', timeframe)
        url.searchParams.set('startDate', fromDate.toISOString())
        url.searchParams.set('endDate', toDate.toISOString())
        url.searchParams.set('token', process.env.TIINGO_API_KEY)
        const res = await fetch(url.toString(), { cache: 'no-store' })

        if (!res.ok) {
          try {
            const errData = await res.json()
            lastError = errData?.detail || 'Tiingo request failed.'
          } catch (e) {
            lastError = 'Tiingo request failed.'
          }
          continue
        }

        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          const candles = normalizeTiingo(data)
          return Response.json({ provider: 'tiingo', source_symbol: candidate, candles })
        }
      }

      return Response.json({
        provider: 'tiingo',
        error: `No supported market symbol found for "${symbol}" (${candidates.join(', ')}). ${lastError}`.trim(),
      }, { status: 502 })
    }

    return Response.json({
      provider: 'none',
      candles: [],
      error: 'No market data provider configured. Set MARKET_DATA_PROVIDER and provider API key env vars.',
    })
  } catch (error) {
    return Response.json({ error: error?.message || 'Unexpected market data error.' }, { status: 500 })
  }
}

