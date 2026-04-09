import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** MT5 sends "YYYY-MM-DD HH:MM:SS"; treat as UTC if no offset. */
function parseMt5UtcInstant(timeStr) {
  if (typeof timeStr !== 'string' || !timeStr.trim()) return null
  const trimmed = timeStr.trim()
  const iso = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T')
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
  const d = new Date(hasTz ? iso : `${iso}Z`)
  return Number.isFinite(d.getTime()) ? d : null
}

function extractDateAndTimeFromOpen(openTimeStr) {
  const m = typeof openTimeStr === 'string' && openTimeStr.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/)
  if (!m) return null
  return { date: m[1], entryTime: m[2] }
}

function extractExitTime(closeTimeStr) {
  const m = typeof closeTimeStr === 'string' && closeTimeStr.trim().match(/[ T](\d{2}:\d{2}:\d{2})/)
  return m ? m[1] : null
}

/** Minutes since local midnight in America/New_York for this instant. */
function etMinutesFromUtcDate(utcDate) {
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

/**
 * London 03:00–08:30 ET, New York 09:30–16:00, Asian 18:00–24:00; else Other.
 * Windows are [start, end) in local ET minutes from midnight.
 */
function sessionFromOpenTimeUtc(openTimeStr) {
  const d = parseMt5UtcInstant(openTimeStr)
  if (!d) return 'Other'
  const totalMin = etMinutesFromUtcDate(d)
  if (totalMin == null) return 'Other'
  const londonStart = 3 * 60
  const londonEnd = 8 * 60 + 30
  const nyStart = 9 * 60 + 30
  const nyEnd = 16 * 60
  const asianStart = 18 * 60
  const dayEnd = 24 * 60
  if (totalMin >= londonStart && totalMin < londonEnd) return 'London'
  if (totalMin >= nyStart && totalMin < nyEnd) return 'New York'
  if (totalMin >= asianStart && totalMin < dayEnd) return 'Asian'
  return 'Other'
}

function jsonError(message, status) {
  return NextResponse.json({ status: 'error', message }, { status })
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return jsonError('Invalid JSON body', 400)
  }

  const {
    api_key,
    account_id,
    test_connection: testConnection,
    ticket,
    symbol,
    type,
    volume,
    open_price,
    close_price,
    open_time,
    close_time,
    profit,
    commission,
    swap,
    magic_number: magicNumber,
    comment,
  } = body ?? {}

  const isTest = testConnection === true

  if (typeof api_key !== 'string' || !api_key.trim()) {
    return jsonError('api_key is required', 400)
  }

  let admin
  try {
    admin = createSupabaseAdmin()
  } catch (e) {
    return jsonError(e?.message || 'Server configuration error', 500)
  }

  const { data: keyRow, error: keyErr } = await admin
    .from('user_api_keys')
    .select('user_id, is_active')
    .eq('api_key', api_key.trim())
    .maybeSingle()

  if (keyErr || !keyRow || keyRow.is_active !== true) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const userId = keyRow.user_id

  if (typeof account_id !== 'string' || !UUID_RE.test(account_id.trim())) {
    return jsonError('account_id must be a valid UUID', 400)
  }
  const accountId = account_id.trim()

  const { data: accountRow, error: accountErr } = await admin
    .from('accounts')
    .select('id, user_id')
    .eq('id', accountId)
    .maybeSingle()

  if (accountErr || !accountRow) {
    return jsonError('Account not found', 404)
  }
  if (accountRow.user_id !== userId) {
    return jsonError('Account does not belong to this API key', 403)
  }

  if (isTest) {
    return NextResponse.json({
      status: 'success',
      message: 'Test connection succeeded. No trade was saved.',
      test: true,
    })
  }

  const ticketNum = Number(ticket)
  if (!Number.isFinite(ticketNum) || !Number.isInteger(ticketNum)) {
    return jsonError('ticket must be an integer', 400)
  }

  if (typeof symbol !== 'string' || !symbol.trim()) {
    return jsonError('symbol is required', 400)
  }

  const typeNorm = typeof type === 'string' ? type.trim().toLowerCase() : ''
  if (typeNorm !== 'buy' && typeNorm !== 'sell') {
    return jsonError('type must be "buy" or "sell"', 400)
  }

  const vol = Number(volume)
  const openPx = Number(open_price)
  const closePx = Number(close_price)
  const profitN = Number(profit)
  const commissionN = Number(commission)
  const swapN = Number(swap)

  if (!Number.isFinite(vol) || vol < 0) {
    return jsonError('volume must be a non-negative number', 400)
  }
  if (!Number.isFinite(openPx) || !Number.isFinite(closePx)) {
    return jsonError('open_price and close_price must be numbers', 400)
  }
  if (!Number.isFinite(profitN) || !Number.isFinite(commissionN) || !Number.isFinite(swapN)) {
    return jsonError('profit, commission, and swap must be numbers', 400)
  }

  const parsedOpen = extractDateAndTimeFromOpen(open_time)
  if (!parsedOpen) {
    return jsonError('open_time must be like "YYYY-MM-DD HH:MM:SS"', 400)
  }
  const exitTime = extractExitTime(close_time)
  if (!exitTime) {
    return jsonError('close_time must include a time portion "HH:MM:SS"', 400)
  }
  if (!parseMt5UtcInstant(open_time) || !parseMt5UtcInstant(close_time)) {
    return jsonError('open_time and close_time must be valid datetimes', 400)
  }

  const { data: existing, error: dupErr } = await admin
    .from('trades')
    .select('id')
    .eq('account_id', accountId)
    .eq('mt5_ticket', ticketNum)
    .maybeSingle()

  if (dupErr) {
    return jsonError(dupErr.message || 'Duplicate check failed', 500)
  }
  if (existing?.id) {
    return NextResponse.json({ status: 'duplicate', message: 'Trade already exists' }, { status: 200 })
  }

  const grossPnl = profitN + swapN
  const fees = Math.abs(commissionN)
  const netPnl = profitN + swapN + commissionN

  let status
  if (netPnl > 0) status = 'Win'
  else if (netPnl < 0) status = 'Loss'
  else status = 'Breakeven'

  const direction = typeNorm === 'buy' ? 'Long' : 'Short'
  const session = sessionFromOpenTimeUtc(open_time)

  const noteParts = []
  if (typeof comment === 'string' && comment.trim()) noteParts.push(comment.trim())
  if (magicNumber != null && String(magicNumber).trim() !== '') noteParts.push(`Magic: ${magicNumber}`)
  const notes = noteParts.length ? `${noteParts.join(' · ')} (MT5)` : 'Imported from MT5'

  const insertPayload = {
    account_id: accountId,
    date: parsedOpen.date,
    symbol: symbol.trim(),
    direction,
    contracts: vol,
    points: null,
    gross_pnl: grossPnl,
    fees,
    net_pnl: netPnl,
    entry_price: openPx,
    exit_price: closePx,
    entry_time: parsedOpen.entryTime,
    exit_time: exitTime,
    session,
    status,
    notes,
    strategy_id: null,
    reviewed: false,
    mt5_ticket: ticketNum,
  }

  const { data: inserted, error: insErr } = await admin.from('trades').insert(insertPayload).select('id').single()

  if (insErr) {
    if (insErr.code === '23505') {
      return NextResponse.json({ status: 'duplicate', message: 'Trade already exists' }, { status: 200 })
    }
    return jsonError(insErr.message || 'Failed to save trade', 500)
  }

  return NextResponse.json({
    status: 'success',
    message: 'Trade recorded',
    trade_id: inserted.id,
  })
}
