import { TradovateClient } from '@/lib/tradovate'
import { decryptStoredCredentials } from '@/lib/broker-crypto'

export function resolveDateRangeLabel(dateRange) {
  const end = new Date()
  const start = new Date(end)
  const dr = typeof dateRange === 'string' ? dateRange : '30d'
  switch (dr) {
    case '24h':
      start.setUTCDate(start.getUTCDate() - 1)
      break
    case '30d':
      start.setUTCDate(start.getUTCDate() - 30)
      break
    case '90d':
      start.setUTCDate(start.getUTCDate() - 90)
      break
    case '6m':
      start.setUTCMonth(start.getUTCMonth() - 6)
      break
    case '1y':
      start.setUTCFullYear(start.getUTCFullYear() - 1)
      break
    case 'all':
      start.setUTCFullYear(start.getUTCFullYear() - 10)
      break
    default:
      start.setUTCDate(start.getUTCDate() - 30)
  }
  return {
    startStr: start.toISOString().slice(0, 10),
    endStr: end.toISOString().slice(0, 10),
  }
}

async function appendBrokerSyncEvent(admin, connectionId, message, ok) {
  const { data: row } = await admin.from('broker_connections').select('sync_events').eq('id', connectionId).single()
  const prev = Array.isArray(row?.sync_events) ? row.sync_events : []
  const next = [{ at: new Date().toISOString(), message, ok }, ...prev].slice(0, 5)
  await admin.from('broker_connections').update({ sync_events: next }).eq('id', connectionId)
}

export async function logSyncLog(admin, { connectionId, userId, eventType, message }) {
  await admin.from('sync_logs').insert({
    connection_id: connectionId,
    user_id: userId,
    event_type: eventType,
    message,
  })
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{ connectionId: string, dateRange?: string, requestingUserId?: string|null }} opts
 * @returns {Promise<{ synced: number, skipped: number, errors: string[] }>}
 */
export async function runTradovateSync(supabaseAdmin, { connectionId, dateRange = '30d', requestingUserId = null }) {
  const admin = supabaseAdmin
  const errors = []
  let synced = 0
  let skipped = 0

  const { data: conn, error: connErr } = await admin
    .from('broker_connections')
    .select('*')
    .eq('id', connectionId)
    .single()

  if (connErr || !conn) {
    throw new Error('Connection not found')
  }
  if (requestingUserId && conn.user_id !== requestingUserId) {
    throw new Error('Forbidden')
  }
  if (conn.broker_name !== 'tradovate') {
    throw new Error('Sync is only implemented for Tradovate')
  }
  if (!conn.is_active) {
    throw new Error('Connection is inactive')
  }

  const userId = conn.user_id
  const pulsedAccountId = conn.pulsed_account_id
  if (!pulsedAccountId) {
    throw new Error('Connection missing pulsed_account_id mapping')
  }

  await admin.from('broker_connections').update({ sync_status: 'syncing' }).eq('id', connectionId)
  await logSyncLog(admin, { connectionId, userId, eventType: 'sync_start', message: `Range ${dateRange}` })

  let creds
  try {
    creds = decryptStoredCredentials(conn.credentials)
  } catch (e) {
    const msg = e?.message || 'Decrypt failed'
    await admin.from('broker_connections').update({ sync_status: 'error' }).eq('id', connectionId)
    await logSyncLog(admin, { connectionId, userId, eventType: 'error', message: msg })
    await appendBrokerSyncEvent(admin, connectionId, msg, false)
    throw e
  }

  const client = new TradovateClient({ environment: creds.environment === 'demo' ? 'demo' : 'live' })

  try {
    const partner = {}
    if (creds.apiCid !== undefined && creds.apiCid !== null && String(creds.apiCid).trim() !== '') {
      partner.cid = String(creds.apiCid).trim()
    }
    if (creds.apiSec !== undefined && creds.apiSec !== null && String(creds.apiSec) !== '') {
      partner.sec = String(creds.apiSec)
    }
    await client.authenticate(
      creds.username,
      creds.password,
      creds.deviceId,
      creds.appId || 'Pulsed',
      creds.appVersion || '1.0.0',
      creds.environment === 'demo' ? 'demo' : 'live',
      partner
    )
  } catch (e) {
    const msg = e?.message || 'Tradovate authentication failed'
    errors.push(msg)
    await admin.from('broker_connections').update({ sync_status: 'error' }).eq('id', connectionId)
    await logSyncLog(admin, { connectionId, userId, eventType: 'error', message: msg })
    await appendBrokerSyncEvent(admin, connectionId, msg, false)
    return { synced: 0, skipped: 0, errors }
  }

  const { startStr, endStr } = resolveDateRangeLabel(dateRange)
  let orders = []
  try {
    orders = await client.getOrders(conn.account_id, startStr, endStr)
  } catch (e) {
    const msg = e?.message || 'getOrders failed'
    errors.push(msg)
    await admin.from('broker_connections').update({ sync_status: 'error' }).eq('id', connectionId)
    await logSyncLog(admin, { connectionId, userId, eventType: 'error', message: msg })
    await appendBrokerSyncEvent(admin, connectionId, msg, false)
    return { synced: 0, skipped: 0, errors }
  }

  for (const t of orders) {
    const { data: dup } = await admin
      .from('trades')
      .select('id')
      .eq('account_id', pulsedAccountId)
      .eq('date', t.date)
      .eq('symbol', t.symbol)
      .eq('entry_time', t.entry_time)
      .limit(1)

    if (dup?.length) {
      skipped += 1
      continue
    }

    const net = Number(t.gross_pnl) - Number(t.fees || 0)
    const insertPayload = {
      account_id: pulsedAccountId,
      date: t.date,
      symbol: t.symbol,
      direction: t.direction,
      contracts: t.contracts,
      points: null,
      gross_pnl: t.gross_pnl,
      fees: t.fees,
      net_pnl: net,
      entry_price: t.entry_price,
      exit_price: t.exit_price,
      entry_time: t.entry_time,
      exit_time: t.exit_time,
      session: t.session,
      status: t.status,
      notes: 'Imported from Tradovate',
      strategy_id: null,
      reviewed: false,
    }

    const { error: insErr } = await admin.from('trades').insert(insertPayload)
    if (insErr) {
      errors.push(insErr.message)
      continue
    }
    synced += 1
  }

  await admin
    .from('broker_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      sync_status: errors.length && !synced ? 'error' : 'healthy',
      trades_imported: (conn.trades_imported || 0) + synced,
    })
    .eq('id', connectionId)

  const summary = `Synced ${synced} trades, skipped ${skipped}${errors.length ? `, ${errors.length} errors` : ''}`
  await logSyncLog(admin, { connectionId, userId, eventType: 'sync_complete', message: summary })
  await appendBrokerSyncEvent(admin, connectionId, summary, errors.length === 0)

  return { synced, skipped, errors }
}
