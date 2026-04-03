'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--bg3)',
  color: 'var(--text)',
  padding: '10px 12px',
  fontSize: '13px',
  fontFamily: 'monospace',
}

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontFamily: 'monospace',
  color: 'var(--text3)',
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

export default function GlobalSettingsSection() {
  const [sessionUser, setSessionUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  // Used only to resolve the "Auto" currency option.
  const [countryCode, setCountryCode] = useState('')
  const [currencyCode, setCurrencyCode] = useState('__auto__')
  const [timeZone, setTimeZone] = useState('')

  const supportedCurrencies = useMemo(() => {
    // Use what the runtime supports; this is the closest thing to "every currency possible".
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
        return Intl.supportedValuesOf('currency').slice().sort((a, b) => a.localeCompare(b))
      }
    } catch {
      // ignore
    }
    // Fallback: a reasonable set if `supportedValuesOf` isn't available.
    return [
      'USD','EUR','GBP','JPY','CAD','AUD','NZD','CHF','CNY','HKD','SGD','SEK','NOK','DKK','PLN','CZK','HUF',
      'ILS','INR','BRL','MXN','ZAR','TRY','SAR','AED','KRW','TWD','THB','MYR','IDR','PHP','VND','NGN',
      'KES','UGX','TZS','GHS','MAD','DZD','EGP','MAD','RON','BGN','HRK','RUB','UAH','KZT','UZS','AZN',
    ]
  }, [])

  const currencyDisplayNames = useMemo(() => {
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
        return new Intl.DisplayNames(['en'], { type: 'currency' })
      }
    } catch {
      // ignore
    }
    return null
  }, [])

  function resolveCurrencyFromCountry(cc) {
    const c = String(cc || '').toUpperCase()
    if (!c) return 'USD'

    // Common mapping for the most likely profile countries.
    // If a country isn't found, we fall back to USD.
    const map = {
      US: 'USD',
      CA: 'CAD',
      MX: 'MXN',
      GB: 'GBP',
      IE: 'EUR',
      FR: 'EUR',
      DE: 'EUR',
      ES: 'EUR',
      PT: 'EUR',
      IT: 'EUR',
      NL: 'EUR',
      BE: 'EUR',
      LU: 'EUR',
      AT: 'EUR',
      FI: 'EUR',
      GR: 'EUR',
      EE: 'EUR',
      LV: 'EUR',
      LT: 'EUR',
      MT: 'EUR',
      CY: 'EUR',
      SK: 'EUR',
      SI: 'EUR',
      CZ: 'CZK',
      PL: 'PLN',
      HU: 'HUF',
      RO: 'RON',
      BG: 'BGN',
      SE: 'SEK',
      NO: 'NOK',
      DK: 'DKK',
      IS: 'ISK',
      CH: 'CHF',
      LI: 'CHF',
      AE: 'AED',
      SA: 'SAR',
      IL: 'ILS',
      TR: 'TRY',
      RU: 'RUB',
      UA: 'UAH',
      KZ: 'KZT',
      UZ: 'UZS',
      AZ: 'AZN',
      IN: 'INR',
      PK: 'PKR',
      BD: 'BDT',
      LK: 'LKR',
      CN: 'CNY',
      HK: 'HKD',
      SG: 'SGD',
      MY: 'MYR',
      ID: 'IDR',
      TH: 'THB',
      VN: 'VND',
      PH: 'PHP',
      KR: 'KRW',
      JP: 'JPY',
      KR2: 'KRW',
      TW: 'TWD',
      AU: 'AUD',
      NZ: 'NZD',
      ZA: 'ZAR',
      NG: 'NGN',
      GH: 'GHS',
      EG: 'EGP',
      MA: 'MAD',
      DZ: 'DZD',
      SD: 'SDG',
      KE: 'KES',
      UG: 'UGX',
      TZ: 'TZS',
      BR: 'BRL',
      CL: 'CLP',
      CO: 'COP',
      PE: 'PEN',
      AR: 'ARS',
      COL2: 'COP',
    }
    return map[c] || 'USD'
  }

  const timeZones = useMemo(() => {
    // Intl.supportedValuesOf is widely supported in modern browsers.
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      try {
        const tzs = Intl.supportedValuesOf('timeZone')
        return tzs.slice().sort((a, b) => a.localeCompare(b))
      } catch {
        // ignore
      }
    }
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Asia/Tokyo',
      'Asia/Singapore',
      'Australia/Sydney',
    ]
  }, [])

  const timeZoneOptions = useMemo(() => {
    function getUTCOffsetMinutes(tz) {
      const d = new Date()
      try {
        const dtf = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
        const parts = dtf.formatToParts(d)
        const get = type => Number(parts.find(p => p.type === type)?.value || 0)
        const year = get('year')
        const month = get('month')
        const day = get('day')
        const hour = get('hour')
        const minute = get('minute')
        const second = get('second')
        const asUTC = Date.UTC(year, month - 1, day, hour, minute, second)
        return Math.round((asUTC - d.getTime()) / 60000)
      } catch {
        return 0
      }
    }

    function cityFromTimeZone(tz) {
      const parts = String(tz).split('/')
      const last = parts[parts.length - 1] || tz
      return last.replace(/_/g, ' ')
    }

    function formatOffset(offsetMinutes) {
      const sign = offsetMinutes >= 0 ? '+' : '-'
      const abs = Math.abs(offsetMinutes)
      const hh = String(Math.floor(abs / 60)).padStart(2, '0')
      const mm = String(abs % 60).padStart(2, '0')
      return `UTC ${sign}${hh}:${mm}`
    }

    const options = timeZones.map(tz => {
      const offset = getUTCOffsetMinutes(tz)
      return {
        value: tz,
        label: `${cityFromTimeZone(tz)} (${formatOffset(offset)})`,
      }
    })

    // Sort by city name, then full label.
    options.sort((a, b) => a.label.localeCompare(b.label))
    return options
  }, [timeZones])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      setSessionUser(session?.user ?? null)
      setAuthLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSessionUser(session?.user ?? null)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!sessionUser?.id) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('country_code,time_zone,currency_code')
        .eq('id', sessionUser.id)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        setMessage({
          type: 'warn',
          text:
            error.message?.includes('time_zone') || error.message?.includes('currency_code') || error.code === '42703'
              ? 'Missing columns in `profiles`. Run supabase/migrations/20260404000000_profiles_add_time_zone.sql and 20260405000000_profiles_add_currency_code.sql then refresh.'
              : `Could not load global settings: ${error.message}`,
        })
        return
      }

      const cc = data?.country_code || ''
      setCountryCode(cc)
      setTimeZone(data?.time_zone || '')
      setCurrencyCode(data?.currency_code ? data.currency_code : '__auto__')
    })()

    return () => {
      cancelled = true
    }
  }, [sessionUser?.id])

  async function handleSave(e) {
    e.preventDefault()
    if (!sessionUser?.id) return
    setSaving(true)
    setMessage({ type: '', text: '' })

    const row = {
      id: sessionUser.id,
      time_zone: timeZone || null,
      currency_code: currencyCode === '__auto__' ? null : currencyCode || null,
    }

    const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'id' })
    if (error) {
      setMessage({ type: 'error', text: error.message || 'Could not save global settings.' })
      setSaving(false)
      return
    }

    setMessage({ type: 'ok', text: 'Global settings saved.' })
    setSaving(false)
  }

  if (authLoading) {
    return <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '16px' }}>Loading…</p>
  }

  if (!sessionUser) {
    return (
      <p style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '16px' }}>
        Sign in to update your global settings.{' '}
        <a href="/auth" style={{ color: 'var(--accent)' }}>
          Go to sign in
        </a>
      </p>
    )
  }

  return (
    <form onSubmit={handleSave} style={{ display: 'grid', gap: '16px', marginTop: '16px' }}>
      {message.text && (
        <div
          style={{
            borderRadius: '8px',
            border:
              message.type === 'error'
                ? '1px solid rgba(239,68,68,0.45)'
                : message.type === 'warn'
                  ? '1px solid rgba(234,179,8,0.45)'
                  : '1px solid rgba(34,197,94,0.45)',
            background:
              message.type === 'error'
                ? 'rgba(239,68,68,0.08)'
                : message.type === 'warn'
                  ? 'rgba(234,179,8,0.08)'
                  : 'rgba(34,197,94,0.08)',
            color: message.type === 'error' ? '#fca5a5' : message.type === 'warn' ? '#fde047' : '#86efac',
            padding: '10px 12px',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
        <div>
          <label style={labelStyle}>Currency</label>
          <select style={{ ...inputStyle, cursor: 'pointer' }} value={currencyCode} onChange={e => setCurrencyCode(e.target.value)}>
            <option value="__auto__">
              Auto (from profile: {countryCode ? `${countryCode} -> ${resolveCurrencyFromCountry(countryCode)}` : 'USD'})
            </option>
            {supportedCurrencies.map(code => {
              const display = currencyDisplayNames?.of?.(code) || code
              return (
                <option key={code} value={code}>
                  {code} - {display}
                </option>
              )
            })}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Time zone</label>
          <select style={{ ...inputStyle, cursor: 'pointer' }} value={timeZone} onChange={e => setTimeZone(e.target.value)}>
            <option value="">Select time zone…</option>
            {timeZoneOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px' }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            borderRadius: '10px',
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: '#fff',
            padding: '10px 20px',
            fontSize: '13px',
            fontFamily: 'monospace',
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save global settings'}
        </button>
      </div>
    </form>
  )
}

