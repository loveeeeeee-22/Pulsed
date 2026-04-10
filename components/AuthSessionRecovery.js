'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

function isStaleRefreshMessage(msg) {
  const s = String(msg ?? '').toLowerCase()
  return s.includes('invalid refresh token') || s.includes('refresh token not found')
}

/**
 * Clears corrupt local auth when Supabase token refresh fails (common after storage
 * quirks, env URL changes, or revoked sessions). Without this, the UI can spam * AuthApiError while localStorage still holds a broken session.
 */
export default function AuthSessionRecovery() {
  const clearing = useRef(false)

  useEffect(() => {
    const clearAndRedirect = async () => {
      if (clearing.current) return
      clearing.current = true
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {
        // ignore
      }
      const path = typeof window !== 'undefined' ? window.location.pathname : ''
      if (path && !path.startsWith('/auth')) {
        window.location.href = '/auth'
      }
    }

    const onRejection = (event) => {
      const r = event.reason
      const msg =
        typeof r === 'object' && r !== null && 'message' in r ? String(r.message) : String(r ?? '')
      if (!isStaleRefreshMessage(msg)) return
      event.preventDefault()
      void clearAndRedirect()
    }

    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [])

  return null
}
