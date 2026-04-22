import { isTradeReviewed } from '@/lib/tradeReviewStatus'

/**
 * @param {object[]} trades
 * @param {string} [filename]
 */
export function exportTradesCsv(trades, filename = 'pulsed-trades-export.csv') {
  const headers = ['date', 'symbol', 'direction', 'status', 'net_pnl', 'contracts', 'account_id', 'strategy_id', 'reviewed']
  const rows = [headers.join(',')]
  for (const t of trades) {
    const r = headers.map((h) => {
      let v = t[h]
      if (h === 'reviewed') v = isTradeReviewed(t) ? 'yes' : 'no'
      if (v == null) v = ''
      const s = String(v).replace(/"/g, '""')
      return `"${s}"`
    })
    rows.push(r.join(','))
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
