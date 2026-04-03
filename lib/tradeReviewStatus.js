/**
 * Single source of truth for “has this trade been reviewed?”
 * Primary column: `reviewed` (boolean). Falls back to legacy column names if present.
 */
export function isTradeReviewed(trade) {
  if (!trade || typeof trade !== 'object') return false
  if (typeof trade.reviewed === 'boolean') return trade.reviewed === true
  if (trade.is_reviewed === true) return true
  if (trade.review_complete === true) return true
  if (trade.needs_review === false) return true
  // Missing or non-boolean `reviewed` (e.g. column absent from row): treat as not reviewed.
  return false
}

export function countTradesNeedingReview(trades) {
  if (!Array.isArray(trades)) return 0
  return trades.filter(t => !isTradeReviewed(t)).length
}
