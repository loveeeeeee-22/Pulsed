'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Country, City } from 'country-state-city'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { formatAuthSignInError } from '@/lib/formatAuthSignInError'

/** Shown when sign-up targets an email that already has an auth account. */
const EMAIL_ALREADY_REGISTERED_MSG =
  'This email is already registered. Use Log in with this email and your existing password instead of signing up again.'

function isEmailAlreadyRegisteredAuthError(error) {
  if (!error) return false
  const code = String(error.code || '')
  const m = String(error.message || '').toLowerCase()
  if (code === 'user_already_exists' || code === 'email_exists') return true
  return (
    m.includes('user already registered') ||
    m.includes('already registered') ||
    m.includes('email address is already') ||
    m.includes('email is already') ||
    /email.*already.*registered|duplicate.*user/i.test(m)
  )
}

/** When "Confirm email" is on, Supabase may return a fake user with no identities for an existing confirmed account (see GoTrueClient signUp docs). */
function isObfuscatedDuplicateSignUp(data) {
  const user = data?.user
  if (!user) return false
  const ids = user.identities
  return Array.isArray(ids) && ids.length === 0
}

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Signup-only profile fields (stored into user metadata, then copied into `profiles` by DB trigger).
  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [city, setCity] = useState('')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Allow landing page links like `/auth?mode=login` or `/auth?mode=signup`.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const modeParam = params.get('mode')
    if (modeParam === 'login') setMode('login')
    if (modeParam === 'signup') setMode('signup')
    if (params.get('verified') === '1') {
      setMessage({ type: 'success', text: 'Email confirmed. Log in with your email and password.' })
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setMessage({ type: '', text: '' })

    if (!isSupabaseConfigured) {
      setMessage({
        type: 'error',
        text: 'This app is not connected to Supabase. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, restart the dev server, and try again.',
      })
      setLoading(false)
      return
    }

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setMessage({ type: 'error', text: 'Passwords do not match.' })
        setLoading(false)
        return
      }
      if (!username.trim()) {
        setMessage({ type: 'error', text: 'Please choose a username.' })
        setLoading(false)
        return
      }
      if (!firstName.trim() || !lastName.trim()) {
        setMessage({ type: 'error', text: 'Please enter your first and last name.' })
        setLoading(false)
        return
      }

      const redirectTo = `${window.location.origin}/auth/confirm`
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            username: username.trim(),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim() || null,
            country_code: countryCode || null,
            city: city.trim() || null,
          },
        },
      })
      if (error) {
        if (isEmailAlreadyRegisteredAuthError(error)) {
          setMessage({ type: 'error', text: EMAIL_ALREADY_REGISTERED_MSG })
          setMode('login')
        } else {
          setMessage({ type: 'error', text: error.message })
        }
        setLoading(false)
        return
      }
      if (isObfuscatedDuplicateSignUp(signUpData)) {
        setMessage({ type: 'error', text: EMAIL_ALREADY_REGISTERED_MSG })
        setMode('login')
        setLoading(false)
        return
      }
      setMessage({ type: 'success', text: 'Account created. Check your email for verification, then log in.' })
      setMode('login')
      setPassword('')
      setConfirmPassword('')
      setLoading(false)
      return
    }

    const cleanEmail = email.trim()
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })
    if (error) {
      setMessage({ type: 'error', text: formatAuthSignInError(error) })
      setLoading(false)
      return
    }

    const session = signInData?.session ?? (await supabase.auth.getSession()).data.session
    if (!session?.user) {
      setMessage({
        type: 'error',
        text: 'Login succeeded but the session was not ready. Try again, or hard-refresh this page.',
      })
      setLoading(false)
      return
    }

    setLoading(false)
    // Client-side navigation keeps the same Supabase singleton in memory; a full reload can race
    // before the session is persisted to storage, which breaks the dashboard on some browsers.
    router.replace('/')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '420px', border: '1px solid var(--border)', borderRadius: '14px', background: 'var(--card-bg)', padding: '20px' }}>
        {!isSupabaseConfigured ? (
          <div
            style={{
              marginBottom: '14px',
              borderRadius: '8px',
              border: '1px solid rgba(234,179,8,0.5)',
              background: 'rgba(234,179,8,0.12)',
              color: '#fde047',
              padding: '12px 14px',
              fontSize: '12px',
              fontFamily: 'monospace',
              lineHeight: 1.5,
            }}
          >
            Supabase env vars are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local, then restart <code style={{ color: 'var(--text2)' }}>npm run dev</code>.
          </div>
        ) : null}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Pulsed
          </div>
          <h1 style={{ marginTop: '6px', fontSize: '28px' }}>{mode === 'signup' ? 'Sign Up' : 'Log In'}</h1>
          <p style={{ marginTop: '6px', fontSize: '13px', color: 'var(--text3)' }}>
            {mode === 'signup' ? 'Create your account to start journaling trades.' : 'Welcome back. Enter your credentials.'}
          </p>
        </div>

        {message.text && (
          <div
            style={{
              marginBottom: '12px',
              borderRadius: '8px',
              border: message.type === 'error' ? '1px solid rgba(239,68,68,0.45)' : '1px solid rgba(34,197,94,0.45)',
              background: message.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
              color: message.type === 'error' ? '#fca5a5' : '#86efac',
              padding: '10px 12px',
              fontSize: '12px',
              fontFamily: 'monospace',
            }}
          >
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '10px' }}>
          <div>
            <label style={labelStyle} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          {mode === 'signup' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle} htmlFor="given-name">
                    First name
                  </label>
                  <input
                    id="given-name"
                    name="given-name"
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="Love"
                    required
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="family-name">
                    Last name
                  </label>
                  <input
                    id="family-name"
                    name="family-name"
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Trades"
                    required
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle} htmlFor="username">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Shown on your dashboard"
                  required
                  autoComplete="username"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={labelStyle} htmlFor="phone">
                    Phone number
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1 555 123 4567"
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="country">
                    Country
                  </label>
                  <select
                    id="country"
                    name="country"
                    autoComplete="country"
                    value={countryCode}
                    onChange={e => {
                      setCountryCode(e.target.value)
                      setCity('')
                    }}
                    style={{ width: '100%' }}
                  >
                    <option value="">Select country…</option>
                    {Country.getAllCountries()
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(c => (
                        <option key={c.isoCode} value={c.isoCode}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle} htmlFor="city">
                  City
                </label>
                <select
                  id="city"
                  name="city"
                  autoComplete="address-level2"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  style={{ width: '100%' }}
                  disabled={!countryCode}
                >
                  <option value="">{countryCode ? 'Select city…' : 'Select country first…'}</option>
                  {countryCode
                    ? (City.getCitiesOfCountry(countryCode) || [])
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(c => (
                          <option key={`${c.name}-${c.stateCode || ''}`} value={c.name}>
                            {c.name}
                          </option>
                        ))
                    : null}
                </select>
              </div>
            </>
          ) : null}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <label htmlFor="password" style={{ ...labelStyle, marginBottom: 0 }}>
                {mode === 'signup' ? 'Create password' : 'Password'}
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-pressed={showPassword}
                aria-controls="password"
                style={visibilityToggleStyle}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              minLength={6}
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {mode === 'signup' ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <label htmlFor="confirm-password" style={{ ...labelStyle, marginBottom: 0 }}>
                  Confirm password
                </label>
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  aria-pressed={showConfirmPassword}
                  aria-controls="confirm-password"
                  style={visibilityToggleStyle}
                >
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="confirm-password"
                name="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-type your password"
                minLength={6}
                required
                autoComplete="new-password"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{ marginTop: '4px', border: 'none', borderRadius: '8px', background: 'var(--accent)', color: '#fff', fontFamily: 'monospace', fontSize: '13px', padding: '10px 12px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Log In'}
          </button>
        </form>

        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text3)', fontFamily: 'monospace' }}>
          {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => setMode(prev => (prev === 'signup' ? 'login' : 'signup'))}
            style={{ border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'monospace', fontSize: '12px', padding: 0 }}
          >
            {mode === 'signup' ? 'Log in' : 'Sign up'}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '11px',
  fontFamily: 'monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text3)',
}

const visibilityToggleStyle = {
  flexShrink: 0,
  border: 'none',
  background: 'none',
  color: 'var(--accent)',
  fontFamily: 'monospace',
  fontSize: '11px',
  cursor: 'pointer',
  padding: '2px 0',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
}
