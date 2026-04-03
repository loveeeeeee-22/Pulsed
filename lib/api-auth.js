import { createSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Resolve Supabase user from Authorization: Bearer <access_token>.
 */
export async function getUserFromAuthorization(request) {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) {
    return { user: null, error: 'Missing Authorization Bearer token' }
  }
  const admin = createSupabaseAdmin()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) {
    return { user: null, error: error?.message || 'Invalid or expired session' }
  }
  return { user: data.user, error: null }
}
