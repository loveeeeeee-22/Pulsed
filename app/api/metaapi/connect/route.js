import { NextResponse } from 'next/server'
import { getUserFromAuthorization } from '@/lib/api-auth'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { connectAccount, getTradeHistory } from '@/lib/metaapi'
import { mapMetaApiDealToPulsedTrade } from '@/lib/mapMetaApiDealToPulsedTrade'

export const dynamic = 'force-dynamic'

const DAYS = {
  '30d': 30,
  '90d': 90,
  '6m': 180,
  all: 730,
}

async function importTrades({ metaApiAccountId, connectionId, userId, pulsedAccountId, historyRange }) {
  const admin = createSupabaseAdmin()
  const days = DAYS[historyRange] || 90
  const start = new Date()
  start.setDate(start.getDate() - days)
  const end = new Date()

  let history
  try {
    history = await getTradeHistory(metaApiAccountId, start.toISOString(), end.toISOString())
  } catch (e) {
    console.error('MetaApi getTradeHistory error:', e)
    await admin
      .from('broker_connections')
      .update({ sync_status: 'error' })
      .eq('id', connectionId)
    return
  }

  if (!history?.length) {
    await admin
      .from('broker_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: 'healthy',
      })
      .eq('id', connectionId)
    return
  }

  const closed = history.filter(
    (d) => d?.entryType === 'DEAL_ENTRY_OUT' || d?.entryType === 'DEAL_ENTRY_INOUT'
  )
  const trades = closed
    .map((d) => mapMetaApiDealToPulsedTrade(d, pulsedAccountId))
    .filter(Boolean)

  if (trades.length === 0) {
    await admin
      .from('broker_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: 'healthy',
      })
      .eq('id', connectionId)
    return
  }

  for (let i = 0; i < trades.length; i += 50) {
    const batch = trades.slice(i, i + 50)
    const { error } = await admin.from('trades').upsert(batch, {
      onConflict: 'account_id,mt5_ticket',
      ignoreDuplicates: true,
    })
    if (error) {
      console.error('Trades batch upsert error:', error)
    }
  }

  await admin
    .from('broker_connections')
    .update({
      trades_imported: trades.length,
      last_sync_at: new Date().toISOString(),
      sync_status: 'healthy',
    })
    .eq('id', connectionId)

  console.log(`MetaApi import: ${trades.length} trades for connection ${connectionId} user ${userId}`)
}

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

  const { login, password, server, platform, environment, historyRange, pulsedAccountId } = body || {}

  if (!login || !password || !server || !platform) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (platform !== 'mt4' && platform !== 'mt5') {
    return NextResponse.json({ error: 'platform must be mt4 or mt5' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const userId = user.id
  const env = environment === 'demo' ? 'demo' : 'live'

  let accountRowId = typeof pulsedAccountId === 'string' ? pulsedAccountId : null
  if (accountRowId) {
    const { data: a, error: aErr } = await admin
      .from('accounts')
      .select('id')
      .eq('id', accountRowId)
      .eq('user_id', userId)
      .maybeSingle()
    if (aErr || !a?.id) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }
  } else {
    const { data: first, error: fErr } = await admin
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (fErr || !first?.id) {
      return NextResponse.json(
        { error: 'Create a trading account in Pulsed before connecting a broker.' },
        { status: 400 }
      )
    }
    accountRowId = first.id
  }

  let meta
  try {
    meta = await connectAccount({
      login: String(login).trim(),
      password: String(password),
      server: String(server).trim(),
      platform,
      accountName: `${platform.toUpperCase()} ${String(login).trim()} (${env})`,
    })
  } catch (err) {
    console.error('MetaApi connect error:', err)
    const msg = err?.message || String(err)
    if (/invalid|unauthor|wrong password|auth/i.test(msg)) {
      return NextResponse.json(
        { error: 'Invalid login credentials. Check server, account number, and investor password.' },
        { status: 401 }
      )
    }
    if (/timeout|timed out|Timed out/i.test(msg)) {
      return NextResponse.json(
        { error: 'Connection timed out. Check your MT server name and network, then try again.' },
        { status: 408 }
      )
    }
    if (/provisioning profile/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 500 })
    }
    return NextResponse.json({ error: msg || 'Connection failed' }, { status: 500 })
  }

  const credentials = {
    server: String(server).trim(),
    login: String(login).trim(),
    import_history: historyRange || '90d',
  }

  const { data: row, error: insErr } = await admin
    .from('broker_connections')
    .insert({
      user_id: userId,
      broker_name: platform,
      environment: env,
      account_id: String(login).trim(),
      account_name: `${platform.toUpperCase()} ${String(login).trim()}`,
      metaapi_account_id: meta.accountId,
      pulsed_account_id: accountRowId,
      sync_status: 'syncing',
      credentials,
      is_active: true,
      last_sync_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insErr || !row?.id) {
    console.error('broker_connections insert error:', insErr)
    return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 })
  }

  importTrades({
    metaApiAccountId: meta.accountId,
    connectionId: row.id,
    userId,
    pulsedAccountId: accountRowId,
    historyRange: historyRange || '90d',
  }).catch((e) => console.error('importTrades:', e))

  return NextResponse.json({
    success: true,
    connectionId: row.id,
    metaApiAccountId: meta.accountId,
    message: 'Connected successfully. Importing trade history...',
  })
}
