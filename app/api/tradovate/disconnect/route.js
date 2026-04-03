import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { getUserFromAuthorization } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { user, error: authError } = await getUserFromAuthorization(request)
    if (!user?.id) {
      return NextResponse.json({ success: false, error: authError || 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { connectionId } = body
    if (!connectionId) {
      return NextResponse.json({ success: false, error: 'connectionId is required' }, { status: 400 })
    }

    const admin = createSupabaseAdmin()
    const { data: conn, error: fetchErr } = await admin
      .from('broker_connections')
      .select('id, user_id')
      .eq('id', connectionId)
      .single()

    if (fetchErr || !conn || conn.user_id !== user.id) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }

    const { error: upErr } = await admin.from('broker_connections').update({ is_active: false }).eq('id', connectionId)

    if (upErr) {
      return NextResponse.json({ success: false, error: upErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: e?.message || 'Disconnect failed' }, { status: 500 })
  }
}
