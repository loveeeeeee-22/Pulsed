'use client'

import { useEffect, useState } from 'react'
import { useMaintenance } from '@/lib/useMaintenance'
import MaintenanceScreen from '@/components/MaintenanceScreen'
import { usePathname } from 'next/navigation'
import { checkAdminBypass, PULSED_ADMIN_BYPASS_KEY } from '@/lib/maintenanceBypass'

/**
 * Supabase-driven maintenance overlay. Skips /admin so you can always open the control panel.
 * Admin bypass: 5-tap logo flow on MaintenanceScreen → localStorage `pulsed_admin_bypass` (8h).
 */
export default function MaintenanceGate({ children }) {
  const { maintenance, loading } = useMaintenance()
  const pathname = usePathname()
  const [bypassed, setBypassed] = useState(false)

  const isAdminPage = typeof pathname === 'string' && pathname.startsWith('/admin')
  const isAuthPage = typeof pathname === 'string' && pathname.startsWith('/auth')

  useEffect(() => {
    setBypassed(checkAdminBypass())
  }, [])

  useEffect(() => {
    function onStorage(e) {
      if (e.key === PULSED_ADMIN_BYPASS_KEY || e.key === null) {
        setBypassed(checkAdminBypass())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  if (loading) {
    return children
  }

  if (maintenance?.is_active && !bypassed && !isAdminPage && !isAuthPage) {
    return <MaintenanceScreen message={maintenance.message} endsAt={maintenance.ends_at} />
  }

  return (
    <>
      {children}
      {bypassed && maintenance?.is_active ? (
        <div
          style={{
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            background: '#7C3AED',
            color: '#fff',
            fontSize: '11px',
            fontFamily: 'monospace',
            padding: '8px 14px',
            borderRadius: '8px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(124,58,237,0.4)',
            maxWidth: 'min(calc(100vw - 32px), 420px)',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#22C55E',
              flexShrink: 0,
            }}
          />
          <span>DEV MODE — maintenance active for users</span>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem(PULSED_ADMIN_BYPASS_KEY)
              } catch {
                /* ignore */
              }
              setBypassed(false)
              window.location.reload()
            }}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: '#fff',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '10px',
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            Exit
          </button>
        </div>
      ) : null}
    </>
  )
}
