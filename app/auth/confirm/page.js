'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Email verification redirect target. Supabase may establish a session from the URL;
 * we sign out immediately so the user must log in with email + password.
 */
export default function AuthConfirmPage() {
  useEffect(() => {
    let cancelled = false

    async function run() {
      await new Promise((r) => setTimeout(r, 150))
      await supabase.auth.signOut()
      if (!cancelled) {
        window.location.replace('/auth?mode=login&verified=1')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--page-bg)',
        color: 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'monospace',
        fontSize: '13px',
      }}
    >
      Confirming your email…
    </div>
  )
}
