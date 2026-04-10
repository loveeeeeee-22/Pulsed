// Instrument specs used for replay P&L normalization.
// Values represent USD value per tick for one contract.
const FUTURES_SPECS = {
  ES: { tickSize: 0.25, tickValue: 12.5 },
  MES: { tickSize: 0.25, tickValue: 1.25 },
  NQ: { tickSize: 0.25, tickValue: 5 },
  MNQ: { tickSize: 0.25, tickValue: 0.5 },
  YM: { tickSize: 1, tickValue: 5 },
  MYM: { tickSize: 1, tickValue: 0.5 },
  RTY: { tickSize: 0.1, tickValue: 5 },
  M2K: { tickSize: 0.1, tickValue: 0.5 },
  CL: { tickSize: 0.01, tickValue: 10 },
  MCL: { tickSize: 0.01, tickValue: 1 },
  GC: { tickSize: 0.1, tickValue: 10 },
  MGC: { tickSize: 0.1, tickValue: 1 },
  SI: { tickSize: 0.005, tickValue: 25 },
  SIL: { tickSize: 0.005, tickValue: 2.5 },
}

const SPOT_SPECS = {
  // Approximate retail CFD/FX: $ P&L ≈ ticks × tickValue × contracts (tune per broker if needed).
  XAUUSD: { tickSize: 0.01, tickValue: 1 },
  XAGUSD: { tickSize: 0.01, tickValue: 1 },
  BTCUSD: { tickSize: 1, tickValue: 1 },
  ETHUSD: { tickSize: 0.01, tickValue: 1 },
}

function normalizeSymbol(symbol) {
  const raw = String(symbol || '').trim().toUpperCase()
  if (!raw) return ''
  const letters = raw.replace(/[^A-Z]/g, '')
  const alnum = raw.replace(/[^A-Z0-9]/g, '')

  for (const key of Object.keys(SPOT_SPECS)) {
    if (letters === key || letters.startsWith(key)) return key
    if (alnum === key || alnum.startsWith(key)) return key
  }

  const futRoots = Object.keys(FUTURES_SPECS).sort((a, b) => b.length - a.length)
  for (const r of futRoots) {
    if (letters.startsWith(r)) return r
  }

  const root4 = letters.slice(0, 4)
  if (FUTURES_SPECS[root4]) return root4

  return root4 || letters.slice(0, 6) || 'GENERIC'
}

export function getInstrumentSpec({ symbol, accountType }) {
  const normalized = normalizeSymbol(symbol)
  const spot = SPOT_SPECS[normalized]
  if (spot) return { ...spot, symbolKey: normalized, mode: 'spot' }

  const futures = FUTURES_SPECS[normalized]
  if (futures) return { ...futures, symbolKey: normalized, mode: 'futures' }

  const mode = String(accountType || '').toLowerCase() === 'forex' ? 'forex' : 'spot'
  return { tickSize: 1, tickValue: 1, symbolKey: normalized || 'GENERIC', mode }
}

export function calculateReplayPnl({ entryPrice, currentPrice, contracts, direction, spec }) {
  const entry = Number(entryPrice || 0)
  const current = Number(currentPrice || 0)
  const qty = Number(contracts || 1) || 1
  const dir = String(direction || '').toLowerCase()

  const delta = dir === 'short' ? entry - current : current - entry
  const tickSize = Number(spec?.tickSize || 1)
  const tickValue = Number(spec?.tickValue || 1)
  const ticksMoved = tickSize > 0 ? delta / tickSize : delta
  return ticksMoved * tickValue * qty
}

