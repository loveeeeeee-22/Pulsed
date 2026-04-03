import { supabase } from '@/lib/supabase'

// Fetch trades that belong to the currently signed-in user.
// We scope trades through `accounts.user_id` (accounts already support multi-user).
// If your DB is missing `accounts.user_id` (legacy), we fall back to returning all trades.
export async function getTradesForUser({ orderAscending = true } = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return []

    const res = await supabase
      .from('trades')
      .select('*, accounts!inner(user_id)')
      .eq('accounts.user_id', uid)
      .order('date', { ascending: orderAscending })

    if (res.error) {
      // Fallback for legacy DBs where accounts.user_id join isn't possible yet.
      const msg = res.error.message || ''
      const code = res.error.code
      const looksLikeMissingUserId =
        code === '42703' ||
        (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('user_id')) ||
        msg.toLowerCase().includes('schema cache')

      if (looksLikeMissingUserId) {
        const legacy = await supabase.from('trades').select('*').order('date', { ascending: orderAscending })
        return legacy.data || []
      }
      throw res.error
    }

    // Strip the joined `accounts` field so existing UI logic (expecting trade rows only) keeps working.
    return (res.data || []).map(({ accounts, ...t }) => t)
  } catch (err) {
    // Supabase sometimes throws network errors (e.g. "Failed to fetch") instead of returning `res.error`.
    // Returning [] prevents unhandled rejections from breaking the UI.
    console.error('getTradesForUser: failed to load trades', err)
    return []
  }
}

