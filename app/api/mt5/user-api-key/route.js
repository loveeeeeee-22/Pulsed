import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { getUserFromAuthorization } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

function newApiKeyHex() {
  return randomBytes(24).toString('hex')
}

/**
 * POST { action: 'create' | 'regenerate' }
 * Authorization: Bearer <supabase_access_token>
 */
export async function POST(request) {
  const { user, error: authError } = await getUserFromAuthorization(request)
  if (!user?.id) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const action = body?.action
  if (action !== 'create' && action !== 'regenerate') {
    return NextResponse.json({ error: 'action must be "create" or "regenerate"' }, { status: 400 })
  }

  let admin
  try {
    admin = createSupabaseAdmin()
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Server configuration error' }, { status: 500 })
  }

  const userId = user.id

  if (action === 'create') {
    const { data: existing, error: exErr } = await admin
      .from('user_api_keys')
      .select('api_key')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (exErr) {
      return NextResponse.json({ error: exErr.message }, { status: 500 })
    }
    if (existing?.api_key) {
      return NextResponse.json({ api_key: existing.api_key, created: false })
    }

    const apiKey = newApiKeyHex()
    const { data: inserted, error: insErr } = await admin
      .from('user_api_keys')
      .insert({ user_id: userId, api_key: apiKey, is_active: true })
      .select('api_key')
      .single()

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
    return NextResponse.json({ api_key: inserted.api_key, created: true })
  }

  // regenerate
  await admin.from('user_api_keys').update({ is_active: false }).eq('user_id', userId)

  const apiKey = newApiKeyHex()
  const { data: inserted, error: insErr } = await admin
    .from('user_api_keys')
    .insert({ user_id: userId, api_key: apiKey, is_active: true })
    .select('api_key')
    .single()

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }
  return NextResponse.json({ api_key: inserted.api_key, created: true })
}
