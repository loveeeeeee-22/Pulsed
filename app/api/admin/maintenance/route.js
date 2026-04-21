import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

function verifyPassword(password) {
  const expected =
    process.env.MAINTENANCE_ADMIN_PASSWORD ||
    process.env.NEXT_PUBLIC_ADMIN_PASSWORD ||
    'pulsed-admin'
  return typeof password === 'string' && password === expected
}

/**
 * Updates maintenance row in app_settings (service role — bypasses RLS).
 * Send JSON: { password, is_active, message, ends_at?, started_at? }
 */
export async function PATCH(request) {
  try {
    const body = await request.json()
    const { password, is_active, message, ends_at, started_at } = body

    if (!verifyPassword(password)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
