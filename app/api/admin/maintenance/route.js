import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

function getAdminEmailExpected() {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase()
}

async function verifyBearerIsAdmin(request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    return { ok: false, error: 'Unauthorized' }
  }

  const adminEmail = getAdminEmailExpected()
  if (!adminEmail) {
    return { ok: false, error: 'Server misconfigured: set NEXT_PUBLIC_ADMIN_EMAIL' }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    return { ok: false, error: 'Missing Supabase URL or anon key' }
  }

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user?.email) {
    return { ok: false, error: 'Unauthorized' }
  }

  if (user.email.trim().toLowerCase() !== adminEmail) {
    return { ok: false, error: 'Forbidden' }
  }

  return { ok: true }
}

/**
 * Updates maintenance row in app_settings (service role — bypasses RLS).
 * Auth: Authorization: Bearer <Supabase access_token> for NEXT_PUBLIC_ADMIN_EMAIL user.
 */
export async function PATCH(request) {
  try {
    const auth = await verifyBearerIsAdmin(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.error === 'Forbidden' ? 403 : 401 })
    }

    const body = await request.json()
    const { is_active, message, ends_at, started_at } = body

    const admin = createSupabaseAdmin()

    const payload = {
      is_active: Boolean(is_active),
      message: message ?? null,
      ends_at: ends_at ? new Date(ends_at).toISOString() : null,
      started_at: started_at ?? null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await admin.from('app_settings').update(payload).eq('id', 'maintenance').select().single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const res = NextResponse.json({ data })
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    return res
  } catch (e) {
    const messageText = e instanceof Error ? e.message : 'Server error'
    if (messageText.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return NextResponse.json(
        { error: 'Server missing SUPABASE_SERVICE_ROLE_KEY — set it to save maintenance settings.' },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: messageText }, { status: 500 })
  }
}
