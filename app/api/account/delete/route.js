import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { getUserFromAuthorization } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

async function removeAvatarFolder(admin, userId) {
  const bucket = 'avatars'
  const { data: files, error } = await admin.storage.from(bucket).list(userId, { limit: 100, offset: 0 })
  if (error) {
    console.warn('removeAvatarFolder list:', error.message)
    return
  }
  if (!files?.length) return
  const paths = files.map((f) => `${userId}/${f.name}`)
  const { error: rmErr } = await admin.storage.from(bucket).remove(paths)
  if (rmErr) console.warn('removeAvatarFolder remove:', rmErr.message)
}

export async function POST(request) {
  try {
    const { user, error: authError } = await getUserFromAuthorization(request)
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: authError || 'Unauthorized' }, { status: 401 })
    }

    const admin = createSupabaseAdmin()
    await removeAvatarFolder(admin, user.id)

    const { error: jeErr } = await admin.from('journal_entries').delete().eq('user_id', user.id)
    if (jeErr) {
      const msg = String(jeErr.message || '').toLowerCase()
      const missingUserIdColumn =
        jeErr.code === '42703' ||
        (msg.includes('user_id') &&
          (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')))
      if (!missingUserIdColumn) {
        console.error('journal_entries delete:', jeErr)
        return NextResponse.json({ ok: false, error: jeErr.message || 'Could not clear journal data' }, { status: 500 })
      }
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) {
      console.error('admin.deleteUser:', delErr)
      return NextResponse.json(
        {
          ok: false,
          error:
            delErr.message ||
            'Could not delete account. Ensure Supabase migrations are applied (trades → accounts CASCADE, journal user_id).',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('account/delete', e)
    return NextResponse.json({ ok: false, error: e?.message || 'Server error' }, { status: 500 })
  }
}
