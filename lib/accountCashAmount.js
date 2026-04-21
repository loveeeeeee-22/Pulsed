/** Signed effect on equity: income positive, withdrawals (`expense`) negative. */
export function signedCashDelta(row) {
  if (!row) return 0
  const n = Number(row.amount)
  if (!Number.isFinite(n)) return 0
  return row.kind === 'expense' ? -n : n
}
