/** Stable sort for journal lists (string compare on date + entry time). */

export function compareTradesChronoAsc(a, b) {
  const da = String(a?.date || '')
  const db = String(b?.date || '')
  if (da < db) return -1
  if (da > db) return 1
  const ta = String(a?.entry_time || '')
  const tb = String(b?.entry_time || '')
  if (ta < tb) return -1
  if (ta > tb) return 1
  return String(a?.id || '').localeCompare(String(b?.id || ''))
}

export function compareTradesChronoDesc(a, b) {
  return compareTradesChronoAsc(b, a)
}
