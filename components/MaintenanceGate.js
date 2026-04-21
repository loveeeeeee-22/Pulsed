'use client'

import { useMaintenance } from '@/lib/useMaintenance'
import MaintenanceScreen from '@/components/MaintenanceScreen'
import { usePathname } from 'next/navigation'

/**
 * Supabase-driven maintenance overlay. Skips /admin so you can always disable maintenance.
 * Polls every 60s + realtime UPDATE on app_settings (see useMaintenance).
 */
export default function MaintenanceGate({ children }) {
  const { maintenance, loading } = useMaintenance()
  const pathname = usePathname()

  const isAdminPage = typeof pathname === 'string' && pathname.startsWith('/admin')

  if (loading) {
    return children
  }

  if (maintenance?.is_active && !isAdminPage) {
    return <MaintenanceScreen message={maintenance.message} endsAt={maintenance.ends_at} />
  }

  return children
}
