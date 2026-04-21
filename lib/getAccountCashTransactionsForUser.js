import { supabase } from '@/lib/supabase'

/** Loads all cash transactions for the signed-in user (income / expense). */
export async function getAccountCashTransactionsForUser() {
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return []

  const res = await supabase
    .from('account_cash_transactions')
    .select('*')
    .eq('user_id', uid)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (res.error) {
    if (res.error.message?.includes('relation') && res.error.message?.includes('does not exist')) {
      return []
    }
    return []
  }
  return res.data || []
}
