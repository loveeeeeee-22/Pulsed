'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function SubscriptionSettingsSection() {
  const [sessionUser, setSessionUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!cancelled) {
        setSessionUser(session?.user ?? null)
        setLoading(false)
      }
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionUser(session?.user ?? null)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '16px' }}>Loading…</p>
  }

  if (!sessionUser) {
    return (
      <p style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '16px' }}>
        Sign in to see your subscription.{' '}
        <Link href="/auth" style={{ color: 'var(--accent)' }}>
          Go to sign in
        </Link>
      </p>
    )
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <p style={{ fontSize: '15px', color: 'var(--text)', marginBottom: '16px' }}>Subscribed to free version</p>
      <Link
        href="/subscription"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '10px',
          border: '1px solid var(--accent)',
          background: 'var(--accent)',
          color: '#fff',
          padding: '10px 20px',
          fontSize: '13px',
          fontFamily: 'monospace',
          textDecoration: 'none',
        }}
      >
        Manage subscription
      </Link>
    </div>
  )
}
