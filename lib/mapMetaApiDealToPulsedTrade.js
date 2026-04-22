import { etMinutesFromUtcDate } from '@/lib/sessionFromDealTime'

/**
 * Map a single MetaApi history deal to a Pulsed trades row.
 * @param {any} deal
 * @param {string} accountId  Pulsed `accounts.id`
 * @returns {object|null}
 */
export function mapMetaApiDealToPulsedTrade(deal, accountId) {
  if (!deal?.symbol || !deal.time) return null

  const isLong = deal.type === 'DEAL_TYPE_BUY'
  const profit = parseFloat(deal.profit || 0)
  const commission = parseFloat(deal.commission || 0)
  const swap = parseFloat(deal.swap || 0)
  const netPnl = profit + commission + swap
  const price = parseFloat(deal.price != null ? deal.price : 0)

  const dealDate = deal.time instanceof Date ? deal.time : new Date(deal.time)
  if (!Number.isFinite(dealDate.getTime())) return null

  const dateStr = dealDate.toISOString().slice(0, 10)
  const timeStr = dealDate.toTimeString().slice(0, 8)

  const totalMin = etMinutesFromUtcDate(dealDate)
  let session = 'Other'
  if (totalMin == null) session = 'Other'
  else {
    const londonStart = 3 * 60
    const londonEnd = 8 * 60 + 30
    const nyStart = 9 * 60 + 30
    const nyEnd = 16 * 60
    const asianStart = 18 * 60
    const dayEnd = 24 * 60
    if (totalMin >= londonStart && totalMin < londonEnd) session = 'London'
    else if (totalMin >= nyStart && totalMin < nyEnd) session = 'New York'
    else if (totalMin >= asianStart && totalMin < dayEnd) session = 'Asian'
  }

  const ticketNum = Number(deal.id)
  if (!Number.isSafeInteger(ticketNum) || ticketNum < 0) return null

  const grossPnl = profit + swap
  const fees = Math.abs(commission)

  let status
  if (netPnl > 0) status = 'Win'
  else if (netPnl < 0) status = 'Loss'
  else status = 'Breakeven'

  return {
    account_id: accountId,
    date: dateStr,
    symbol: deal.symbol,
    direction: isLong ? 'Long' : 'Short',
    contracts: parseFloat(deal.volume || 0),
    points: null,
    entry_price: price,
    exit_price: price,
    gross_pnl: grossPnl,
    fees,
    net_pnl: netPnl,
    status,
    entry_time: timeStr,
    exit_time: timeStr,
    session,
    notes: 'Imported from MetaApi',
    strategy_id: null,
    reviewed: false,
    mt5_ticket: ticketNum,
  }
}
