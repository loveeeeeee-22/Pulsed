/** Client-only: admin maintenance bypass stored in localStorage (see MaintenanceGate). */
export const PULSED_ADMIN_BYPASS_KEY = 'pulsed_admin_bypass'

export function checkAdminBypass() {
  if (typeof window === 'undefined') return false
  try {
    const stored = window.localStorage.getItem(PULSED_ADMIN_BYPASS_KEY)
    if (!stored) return false

    const { expires } = JSON.parse(stored)
    if (typeof expires !== 'number') {
      window.localStorage.removeItem(PULSED_ADMIN_BYPASS_KEY)
      return false
    }

    if (Date.now() < expires) {
      return true
    }

    window.localStorage.removeItem(PULSED_ADMIN_BYPASS_KEY)
    return false
  } catch {
    return false
  }
}
