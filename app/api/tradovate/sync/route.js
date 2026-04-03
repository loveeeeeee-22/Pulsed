import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { getUserFromAuthorization } from '@/lib/api-auth'
import { runTradovateSync } from '@/lib/tradovate-sync'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { user, error: authError } = await getUserFromAuthorization(request)
    if (!user?.id) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { connectionId, dateRange = '30d' } = body
    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 })
    }

    const admin = createSupabaseAdmin()
    const result = await runTradovateSync(admin, {
      connectionId,
      dateRange,
      requestingUserId: user.id,
    })

    return NextResponse.json({
      synced: result.synced,
      skipped: result.skipped,
      errors: result.errors,
    })
  } catch (e) {
    const status = e?.message === 'Forbidden' ? 403 : e?.message === 'Connection not found' ? 404 : 500
    return NextResponse.json({ error: e?.message || 'Sync failed', synced: 0, skipped: 0, errors: [e?.message] }, { status })
  }
}
