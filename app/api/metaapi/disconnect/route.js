import { NextResponse } from 'next/server'
import { getUserFromAuthorization } from '@/lib/api-auth'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { removeAccount } from '@/lib/metaapi'

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
    .select('id, metaapi_account_id')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (cErr || !connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  if (connection.metaapi_account_id) {
    try {
      await removeAccount(connection.metaapi_account_id)
    } catch (e) {
      console.error('MetaApi removeAccount:', e)
    }
  }

  const { error: upErr } = await admin
    .from('broker_connections')
    .update({ is_active: false, sync_status: 'error' })
    .eq('id', connectionId)

  if (upErr) {
    return NextResponse.json({ error: upErr.message || 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
