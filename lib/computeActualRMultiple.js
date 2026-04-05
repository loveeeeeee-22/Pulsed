/**
 * Realized R-multiple: net P&L ÷ dollar risk (1R = `trade_risk` in account currency).
 * Returns null when risk is missing or zero, or net P&L cannot be determined.
 */
export function computeActualRMultiple(netPnl, tradeRiskDollars) {
  const risk = Number(tradeRiskDollars)
  if (!Number.isFinite(risk) || risk === 0) return null
  if (netPnl == null || !Number.isFinite(Number(netPnl))) return null
  return Number(netPnl) / risk
}
