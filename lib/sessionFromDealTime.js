/**
 * Minutes since local midnight in America/New_York (used for session buckets).
 * @param {Date} utcDate
 * @returns {number|null}
 */
export function etMinutesFromUtcDate(utcDate) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(utcDate)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}
