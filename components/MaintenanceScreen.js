'use client'

import { useEffect, useState } from 'react'

const DEFAULT_MESSAGE =
  'We are performing scheduled maintenance to improve your experience. We will be back shortly.'

export default function MaintenanceScreen({ message, endsAt }) {
  const [timeLeft, setTimeLeft] = useState(null)
  const [dots, setDots] = useState('.')

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
        <div
          style={{
            width: '56px',
            height: '56px',
            background: '#7C3AED',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <svg width="30" height="30" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M10 17S3 12.5 3 7.5A4.5 4.5 0 0 1 10 4.18 4.5 4.5 0 0 1 17 7.5C17 12.5 10 17 10 17Z"
              fill="white"
            />
          </svg>
        </div>

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
