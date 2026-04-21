'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useMaintenance() {
  const [maintenance, setMaintenance] = useState(null)
  const [loading, setLoading] = useState(true)

  const checkMaintenance = useCallback(async () => {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 'maintenance')
      .maybeSingle()

    if (error) {
      setMaintenance(null)
    } else if (data) {
      setMaintenance(data)
    } else {
      setMaintenance(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    setLoading(true)
    void checkMaintenance()

    const interval = setInterval(() => {
      void checkMaintenance()
    }, 60000)

    const channel = supabase
      .channel('maintenance-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_settings',
          filter: 'id=eq.maintenance',
        },
        (payload) => {
          if (payload.new) setMaintenance(payload.new)
        },
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [checkMaintenance])

  return { maintenance, loading, recheck: checkMaintenance }
}
