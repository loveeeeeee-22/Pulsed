import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { encryptCredentialsPayload } from '@/lib/broker-crypto'
import { getUserFromAuthorization } from '@/lib/api-auth'
import { TradovateClient } from '@/lib/tradovate'
import { runTradovateSync } from '@/lib/tradovate-sync'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { user, error: authError } = await getUserFromAuthorization(request)
    if (!user?.id) {
      return NextResponse.json({ success: false, error: authError || 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const {
      username,
      password,
      deviceId,
      appId,
      appVersion,
      environment = 'live',
      pulsedAccountId,
      apiCid,
      apiSec,
    } = body

    if (!username || !password || !pulsedAccountId) {
      return NextResponse.json(
        { success: false, error: 'username, password, and pulsedAccountId are required' },
        { status: 400 }
      )
    }

    const admin = createSupabaseAdmin()

    const { data: acct, error: acctErr } = await admin
      .from('accounts')
      .select('id, user_id')
      .eq('id', pulsedAccountId)
      .single()

    if (acctErr || !acct || acct.user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Invalid Pulsed account' }, { status: 400 })
    }

    const env = environment === 'demo' ? 'demo' : 'live'
    const client = new TradovateClient({ environment: env })

    const partner = {}
    if (apiCid !== undefined && apiCid !== null && String(apiCid).trim() !== '') {
      partner.cid = String(apiCid).trim()
    }
    if (apiSec !== undefined && apiSec !== null && String(apiSec) !== '') {
      partner.sec = String(apiSec)
    }

    try {
      await client.authenticate(
        String(username).trim(),
        String(password),
        String(deviceId || ''),
        String(appId || 'Pulsed'),
        String(appVersion || '1.0.0'),
        env,
        partner
      )
    } catch (e) {
      const msg = e?.message || 'Tradovate authentication failed'
      return NextResponse.json({ success: false, error: msg }, { status: 401 })
    }

    let accounts
    try {
      accounts = await client.getAccounts()
    } catch {
      accounts = []
    }

    const primary = accounts[0]
    const accountName = primary?.name || String(username).trim()
    const tradovateAccountId = primary?.id != null ? String(primary.id) : String(username).trim()

    const encrypted = encryptCredentialsPayload({
      username: String(username).trim(),
      password: String(password),
      deviceId: String(deviceId || ''),
      appId: String(appId || 'Pulsed'),
      appVersion: String(appVersion || '1.0.0'),
      environment: env,
      ...(partner.cid !== undefined ? { apiCid: partner.cid } : {}),
      ...(partner.sec !== undefined ? { apiSec: partner.sec } : {}),
    })

    const { data: inserted, error: insErr } = await admin
      .from('broker_connections')
      .insert({
        user_id: user.id,
        broker_name: 'tradovate',
        environment: env,
        credentials: { encrypted },
        account_id: tradovateAccountId,
        account_name: accountName,
        pulsed_account_id: pulsedAccountId,
        last_sync_at: new Date().toISOString(),
        sync_status: 'healthy',
        trades_imported: 0,
        is_active: true,
        sync_events: [{ at: new Date().toISOString(), message: 'Connected via Pulsed API', ok: true }],
      })
      .select('id')
      .single()

    if (insErr) {
      return NextResponse.json({ success: false, error: insErr.message }, { status: 500 })
    }

    let tradesFound = 0
    try {
      const sync = await runTradovateSync(admin, {
        connectionId: inserted.id,
        dateRange: '30d',
        requestingUserId: user.id,
      })
      tradesFound = sync.synced
    } catch {
      /* initial import optional failure — connection still saved */
    }

    return NextResponse.json({
      success: true,
      accountName,
      tradesFound,
      connectionId: inserted.id,
    })
  } catch (e) {
    const msg = e?.message || 'Server error'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
