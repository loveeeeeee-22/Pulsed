import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

/** False when the app is using placeholder URL/key — saves and API calls will fail. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// Missing env used to throw at import time (Supabase validates URL/key), which breaks the whole
// app on Vercel if variables are unset. Use placeholders so the UI can load; fix env to restore auth/API.
const resolvedUrl = supabaseUrl || 'https://env-not-configured.supabase.co'
const resolvedKey = supabaseAnonKey || 'sb-placeholder-anon-key-set-next-public-vars'

if (typeof window !== 'undefined' && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn(
    '[Pulsed] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing — set them in Vercel → Settings → Environment Variables.',
  )
}

export const supabase = createClient(resolvedUrl, resolvedKey)