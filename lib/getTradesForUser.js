import { supabase } from '@/lib/supabase'

/**
 * Fetch trades for the signed-in user, scoped via `accounts!inner(user_id)`.
 * Returns `{ trades, error }` so callers (e.g. analytics debug) can surface Supabase errors.
 */
export async function fetchTradesForCurrentUser({ orderAscending = true } = {}) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return { trades: [], error: null }

    const res = await supabase
      .from('trades')
      .select('*, accounts!inner(user_id)')
      .eq('accounts.user_id', uid)
      .order('date', { ascending: orderAscending })

    if (res.error) {
      const msg = res.error.message || ''
      const code = res.error.code
      const looksLikeMissingUserId =
        code === '42703' ||
        (msg.toLowerCase().includes('column') && msg.toLowerCase().includes('user_id')) ||
        msg.toLowerCase().includes('schema cache')

      if (looksLikeMissingUserId) {
        const legacy = await supabase.from('trades').select('*').order('date', { ascending: orderAscending })
        if (legacy.error) {
          console.error('getTradesForUser: legacy trades fetch failed', legacy.error)
          return { trades: [], error: legacy.error.message || msg }
        }
        return { trades: legacy.data || [], error: null }
      }

      console.error('getTradesForUser: scoped trades fetch failed', res.error)
      return { trades: [], error: res.error.message || 'Failed to load trades' }
    }

    const trades = (res.data || []).map(({ accounts, ...t }) => t)
    return { trades, error: null }
  } catch (err) {
    console.error('getTradesForUser: failed to load trades', err)
    return { trades: [], error: err?.message || String(err) }
  }
}

// Fetch trades that belong to the currently signed-in user.
// We scope trades through `accounts.user_id` (accounts already support multi-user).
// If your DB is missing `accounts.user_id` (legacy), we fall back to returning all trades.
export async function getTradesForUser(opts) {
  const { trades } = await fetchTradesForCurrentUser(opts)
  return trades
}
