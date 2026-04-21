'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const DEFAULT_MESSAGE =
  'We are performing scheduled maintenance to improve your experience. We will be back shortly.'

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').trim().toLowerCase()

export default function MaintenanceScreen({ message, endsAt }) {
  const [timeLeft, setTimeLeft] = useState(null)
  const [dots, setDots] = useState('.')
  const [tapCount, setTapCount] = useState(0)
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [tapped, setTapped] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const tapResetRef = useRef(null)
  const flashRef = useRef(null)

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '.' : `${d}.`))
    }, 500)

    return () => clearInterval(dotsInterval)
  }, [])

  useEffect(() => {
    if (!endsAt) return undefined

    function calcTimeLeft() {
      const end = new Date(endsAt).getTime()
      const now = Date.now()
      const diff = end - now

      if (diff <= 0) {
        setTimeLeft(null)
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setTimeLeft({ hours, minutes, seconds })
    }

    calcTimeLeft()
    const timer = setInterval(calcTimeLeft, 1000)
    return () => clearInterval(timer)
  }, [endsAt])

  useEffect(() => {
    return () => {
      if (tapResetRef.current) clearTimeout(tapResetRef.current)
      if (flashRef.current) clearTimeout(flashRef.current)
    }
  }, [])

  function handleLogoClick() {
    setTapped(true)
    if (flashRef.current) clearTimeout(flashRef.current)
    flashRef.current = setTimeout(() => setTapped(false), 200)

    if (tapResetRef.current) clearTimeout(tapResetRef.current)

    setTapCount((c) => {
      const next = c + 1
      if (next >= 5) {
        setShowAdminLogin(true)
        return 0
      }
      tapResetRef.current = setTimeout(() => setTapCount(0), 3000)
      return next
    })
  }

  async function handleAdminLogin(e) {
    e.preventDefault()
    setLoggingIn(true)
    setLoginError('')

    if (!ADMIN_EMAIL) {
      setLoginError('Admin email is not configured.')
      setLoggingIn(false)
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginForm.email.trim(),
      password: loginForm.password,
    })

    if (error) {
      setLoginError('Invalid email or password')
      setLoggingIn(false)
      return
    }

    const userEmail = (data.user?.email || '').trim().toLowerCase()
    if (userEmail !== ADMIN_EMAIL) {
      setLoginError('This account does not have admin access')
      await supabase.auth.signOut()
      setLoggingIn(false)
      return
    }

    const bypassData = {
      email: data.user.email,
      expires: Date.now() + 8 * 60 * 60 * 1000,
    }
    localStorage.setItem('pulsed_admin_bypass', JSON.stringify(bypassData))

    window.location.href = '/'
  }

  const logoBaseStyle = {
    width: '56px',
    height: '56px',
    background: '#7C3AED',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
    transform: tapped ? 'scale(0.9)' : 'scale(1)',
    transition: 'transform 0.1s',
    cursor: 'pointer',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    boxShadow:
      tapCount > 0 ? `0 0 ${tapCount * 6}px rgba(124,58,237,${Math.min(0.15 * tapCount, 0.75)})` : 'none',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0A0A0F',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif',
        padding: '20px',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          maxWidth: '480px',
          width: '100%',
        }}
      >
        <button
          type="button"
          onClick={handleLogoClick}
          aria-label="Pulsed"
          style={{
            ...logoBaseStyle,
            border: 'none',
            padding: 0,
            appearance: 'none',
          }}
        >
          <svg width="30" height="30" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M10 17S3 12.5 3 7.5A4.5 4.5 0 0 1 10 4.18 4.5 4.5 0 0 1 17 7.5C17 12.5 10 17 10 17Z"
              fill="white"
            />
          </svg>
        </button>

        {tapCount > 0 ? (
          <div
            style={{
              display: 'flex',
              gap: '6px',
              justifyContent: 'center',
              marginTop: '12px',
              marginBottom: '-12px',
            }}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: i <= tapCount ? '#7C3AED' : 'rgba(124,58,237,0.2)',
                  transition: 'background 0.15s',
                  transform: i <= tapCount ? 'scale(1.2)' : 'scale(1)',
                }}
              />
            ))}
          </div>
        ) : null}

        <div
          style={{
            fontSize: '13px',
            fontFamily: 'monospace',
            color: '#7C3AED',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginBottom: '32px',
          }}
        >
          Pulsed
        </div>

        <div
          style={{
            position: 'relative',
            width: '80px',
            height: '80px',
            margin: '0 auto 32px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid rgba(124,58,237,0.3)',
              animation: 'pj-maint-ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: '8px',
              borderRadius: '50%',
              border: '2px solid rgba(124,58,237,0.5)',
              animation: 'pj-maint-ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
              animationDelay: '0.3s',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: '16px',
              borderRadius: '50%',
              background: 'rgba(124,58,237,0.2)',
              border: '2px solid #7C3AED',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 2L12 6M12 18L12 22M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M2 12L6 12M18 12L22 12M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93"
                stroke="#7C3AED"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        <h1
          style={{
            fontSize: '24px',
            fontWeight: '600',
            color: '#F0EEF8',
            marginBottom: '12px',
            letterSpacing: '-0.3px',
          }}
        >
          Under Maintenance{dots}
        </h1>

        <p
          style={{
            fontSize: '15px',
            color: '#9896A8',
            lineHeight: '1.7',
            marginBottom: '32px',
          }}
        >
          {message?.trim() ? message : DEFAULT_MESSAGE}
        </p>

        {timeLeft ? (
          <div
            style={{
              background: 'rgba(124,58,237,0.08)',
              border: '1px solid rgba(124,58,237,0.2)',
              borderRadius: '12px',
              padding: '20px 24px',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#55536A',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '12px',
              }}
            >
              Estimated time remaining
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '16px',
              }}
            >
              {[
                { value: timeLeft.hours, label: 'Hours' },
                { value: timeLeft.minutes, label: 'Minutes' },
                { value: timeLeft.seconds, label: 'Seconds' },
              ].map(({ value, label }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '36px',
                      fontFamily: 'monospace',
                      fontWeight: '700',
                      color: '#F0EEF8',
                      lineHeight: 1,
                      minWidth: '60px',
                    }}
                  >
                    {String(value).padStart(2, '0')}
                  </div>
                  <div
                    style={{
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      color: '#55536A',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginTop: '4px',
                    }}
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!timeLeft && !endsAt ? (
          <div
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '24px',
              fontSize: '13px',
              fontFamily: 'monospace',
              color: '#55536A',
            }}
          >
            We&apos;ll be back as soon as possible
          </div>
        ) : null}

        <div
          style={{
            fontSize: '12px',
            color: '#55536A',
            fontFamily: 'monospace',
          }}
        >
          Questions? Contact us at{' '}
          <a href="mailto:support@pulsed.app" style={{ color: '#7C3AED' }}>
            support@pulsed.app
          </a>
        </div>
      </div>

      {showAdminLogin ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="maint-admin-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            backdropFilter: 'blur(8px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAdminLogin(false)
              setLoginError('')
              setLoginForm({ email: '', password: '' })
            }
          }}
        >
          <div
            style={{
              background: '#111118',
              border: '1px solid rgba(124,58,237,0.3)',
              borderRadius: '16px',
              padding: '32px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  background: 'rgba(124,58,237,0.15)',
                  border: '1px solid rgba(124,58,237,0.3)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect x="3" y="11" width="18" height="11" rx="2" stroke="#7C3AED" strokeWidth="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div id="maint-admin-title" style={{ fontSize: '18px', fontWeight: '600', color: '#F0EEF8', marginBottom: '6px' }}>
                Admin Access
              </div>
              <div style={{ fontSize: '13px', color: '#55536A', fontFamily: 'monospace' }}>Sign in to bypass maintenance mode</div>
            </div>

            <form
              id="maint-admin-login-form"
              onSubmit={(e) => void handleAdminLogin(e)}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}
            >
              <div>
                <label
                  style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: '#55536A',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    display: 'block',
                    marginBottom: '6px',
                  }}
                  htmlFor="admin-email"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="admin-email"
                  name="admin-email"
                  autoComplete="email"
                  placeholder="your@email.com"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
                  style={{
                    width: '100%',
                    background: '#18181F',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#F0EEF8',
                    padding: '11px 14px',
                    fontSize: '14px',
                    outline: 'none',
                    fontFamily: 'sans-serif',
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: '#55536A',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    display: 'block',
                    marginBottom: '6px',
                  }}
                  htmlFor="admin-password-modal"
                >
                  Password
                </label>
                <input
                  type="password"
                  id="admin-password-modal"
                  name="admin-password-modal"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                  style={{
                    width: '100%',
                    background: '#18181F',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#F0EEF8',
                    padding: '11px 14px',
                    fontSize: '14px',
                    outline: 'none',
                    fontFamily: 'sans-serif',
                  }}
                />
              </div>
            </form>

            {loginError ? (
              <div
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '7px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  color: '#EF4444',
                  fontFamily: 'monospace',
                  marginBottom: '14px',
                  textAlign: 'center',
                }}
              >
                {loginError}
              </div>
            ) : null}

            <button
              type="submit"
              form="maint-admin-login-form"
              disabled={loggingIn || !loginForm.email || !loginForm.password}
              style={{
                width: '100%',
                background: '#7C3AED',
                color: '#fff',
                border: 'none',
                borderRadius: '9px',
                padding: '12px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: loggingIn || !loginForm.email || !loginForm.password ? 'not-allowed' : 'pointer',
                opacity: loggingIn || !loginForm.email || !loginForm.password ? 0.6 : 1,
                transition: 'opacity 0.15s',
                marginBottom: '12px',
              }}
            >
              {loggingIn ? 'Signing in...' : 'Sign in as Admin'}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowAdminLogin(false)
                setLoginError('')
                setLoginForm({ email: '', password: '' })
              }}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                color: '#55536A',
                fontSize: '13px',
                fontFamily: 'monospace',
                cursor: 'pointer',
                padding: '8px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes pj-maint-ping {
          75%, 100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
