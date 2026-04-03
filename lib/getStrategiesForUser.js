import { supabase } from '@/lib/supabase'

/** True when DB has not applied `strategies.user_id` yet (PostgREST / Postgres wording varies). */
export function isStrategiesUserIdMissingError(error) {
  if (!error) return false
  const code = String(error.code ?? '')
  const msg = String(error.message ?? '').toLowerCase()
  if (code === '42703') return true
  if (!msg.includes('user_id')) return false
  return (
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find')
  )
}

/**
 * Playbooks scoped to the signed-in user (`strategies.user_id`).
 * If the column is missing (migration not run), falls back to listing all strategies
 * and logs a warning — run `supabase/migrations/20260413120000_strategies_user_id_rls.sql`.
 */
export async function getStrategiesForUser({
  select = 'id, name, rules',
  order = { column: 'name', ascending: true },
} = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) return []

    const scoped = await supabase
      .from('strategies')
      .select(select)
      .eq('user_id', uid)
      .order(order.column, { ascending: order.ascending })

    if (!scoped.error) return scoped.data || []

    if (isStrategiesUserIdMissingError(scoped.error)) {
      console.warn(
        '[Pulsed] strategies.user_id is missing. Apply migration 20260413120000_strategies_user_id_rls.sql in Supabase. Using legacy unscoped playbook list until then.'
      )
      const legacy = await supabase
        .from('strategies')
        .select(select)
        .order(order.column, { ascending: order.ascending })
      if (legacy.error) {
        console.error('getStrategiesForUser:', legacy.error.message)
        return []
      }
      return legacy.data || []
    }

    console.error('getStrategiesForUser:', scoped.error.message)
    return []
  } catch (e) {
    console.error('getStrategiesForUser:', e)
    return []
  }
}
