import { supabase } from '@/lib/supabase'

/** Loads accounts for the current user. Falls back to all accounts if `user_id` column is missing (legacy DB). */
export async function getAccountsForUser() {
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return []

  const res = await supabase.from('accounts').select('*').eq('user_id', uid).order('name', { ascending: true })
  if (res.error && (res.error.message?.includes('user_id') || res.error.message?.includes('schema cache'))) {
    const legacy = await supabase.from('accounts').select('*').order('name', { ascending: true })
    return legacy.data || []
  }
  return res.data || []
}
