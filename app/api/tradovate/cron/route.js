import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { runTradovateSync } from '@/lib/tradovate-sync'

export const dynamic = 'force-dynamic'

/**
 * Internal cron target: Authorization: Bearer TRADOVATE_CRON_SECRET
 * Called by Supabase Edge Function or external scheduler.
 */
export async function POST(request) {
  const secret = process.env.TRADOVATE_CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'TRADOVATE_CRON_SECRET not configured' }, { status: 500 })
  }

  const auth = request.headers.get('authorization') || ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from('broker_connections')
    .select('id')
    .eq('is_active', true)
    .eq('broker_name', 'tradovate')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results = []
  for (const row of rows || []) {
    try {
      const out = await runTradovateSync(admin, {
        connectionId: row.id,
        dateRange: '24h',
        requestingUserId: null,
      })
      results.push({ connectionId: row.id, ...out })
    } catch (e) {
      results.push({ connectionId: row.id, error: e?.message || 'sync failed' })
    }
  }

  return NextResponse.json({ ok: true, results })
}
