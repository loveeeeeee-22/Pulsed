import { NextResponse } from 'next/server'
import { getUserFromAuthorization } from '@/lib/api-auth'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { getTradeHistory } from '@/lib/metaapi'
import { mapMetaApiDealToPulsedTrade } from '@/lib/mapMetaApiDealToPulsedTrade'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { user, error: authError } = await getUserFromAuthorization(request)
  if (authError || !user?.id) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { connectionId } = body || {}
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId is required' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: connection, error: cErr } = await admin
    .from('broker_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (cErr || !connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  const metaId = connection.metaapi_account_id
  if (!metaId) {
    return NextResponse.json({ error: 'This connection has no MetaApi account id' }, { status: 400 })
  }

  const startDate = connection.last_sync_at
    ? new Date(connection.last_sync_at)
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  let history
  try {
    history = await getTradeHistory(metaId, startDate.toISOString(), new Date().toISOString())
  } catch (e) {
    console.error('MetaApi sync getTradeHistory:', e)
    return NextResponse.json({ error: e?.message || 'Sync failed' }, { status: 500 })
  }

  const closed = (history || []).filter(
    (d) => d?.entryType === 'DEAL_ENTRY_OUT' || d?.entryType === 'DEAL_ENTRY_INOUT'
  )

  const pulsedAccountId = connection.pulsed_account_id
  if (!pulsedAccountId) {
    return NextResponse.json({ error: 'Connection has no Pulsed account' }, { status: 400 })
  }

  const trades = closed.map((d) => mapMetaApiDealToPulsedTrade(d, pulsedAccountId)).filter(Boolean)
  let imported = 0
  if (trades.length > 0) {
    const { error: upErr } = await admin.from('trades').upsert(trades, {
      onConflict: 'account_id,mt5_ticket',
      ignoreDuplicates: true,
    })
    if (!upErr) imported = trades.length
  }

  const prev = connection.trades_imported || 0
  await admin
    .from('broker_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      sync_status: 'healthy',
      trades_imported: prev + imported,
    })
    .eq('id', connectionId)

  return NextResponse.json({
    success: true,
    imported,
    message: `Synced ${imported} new trade rows`,
  })
}
