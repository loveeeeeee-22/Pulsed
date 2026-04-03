import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { getUserFromAuthorization } from '@/lib/api-auth'
import { decryptStoredCredentials } from '@/lib/broker-crypto'
import { TradovateClient } from '@/lib/tradovate'

export const dynamic = 'force-dynamic'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

function cacheKeyParts(userId, symbol, resolution, startTime, endTime) {
  return `${userId}|${symbol}|${resolution}|${startTime}|${endTime}`
}

export async function POST(request) {
  try {
    const { user, error: authError } = await getUserFromAuthorization(request)
    if (!user?.id) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { connectionId, symbol, resolution = '5', startTime, endTime } = body

    if (!connectionId || !symbol || startTime == null || endTime == null) {
      return NextResponse.json(
        { error: 'connectionId, symbol, startTime, and endTime are required' },
        { status: 400 }
      )
    }

    const startMs = Number(startTime)
    const endMs = Number(endTime)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return NextResponse.json({ error: 'startTime and endTime must be numeric epoch ms' }, { status: 400 })
    }

    const admin = createSupabaseAdmin()
    const { data: conn, error: cErr } = await admin
      .from('broker_connections')
      .select('*')
      .eq('id', connectionId)
      .single()

    if (cErr || !conn || conn.user_id !== user.id) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const cacheDate = new Date(startMs).toISOString().slice(0, 10)
    const keyHash = crypto.createHash('sha256').update(cacheKeyParts(user.id, symbol, resolution, startMs, endMs)).digest('hex')

    const { data: cached } = await admin
      .from('historical_cache')
      .select('candles_json, created_at')
      .eq('user_id', user.id)
      .eq('cache_key', keyHash)
      .maybeSingle()

    if (cached?.created_at && Date.now() - new Date(cached.created_at).getTime() < CACHE_TTL_MS) {
      return NextResponse.json({ candles: cached.candles_json || [], cached: true })
    }

    const creds = decryptStoredCredentials(conn.credentials)
    const client = new TradovateClient({ environment: creds.environment === 'demo' ? 'demo' : 'live' })
    await client.authenticate(
      creds.username,
      creds.password,
      creds.deviceId,
      creds.appId || 'Pulsed',
      creds.appVersion || '1.0.0',
      creds.environment === 'demo' ? 'demo' : 'live'
    )

    const candles = await client.getHistoricalBars(String(symbol), String(resolution), startMs, endMs)

    await admin.from('historical_cache').upsert(
      {
        user_id: user.id,
        symbol: String(symbol),
        resolution: String(resolution),
        date: cacheDate,
        cache_key: keyHash,
        candles_json: candles,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'cache_key' }
    )

    return NextResponse.json({ candles, cached: false })
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Historical fetch failed' }, { status: 500 })
  }
}
