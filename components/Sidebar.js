'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/ThemeContext'

export default function Sidebar({ isExpanded, onToggleExpand }) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const accent = '#7C3AED'

  const [menuOpen, setMenuOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [userInitials, setUserInitials] = useState('LO')

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserEmail(user.email ?? '')
        const email = user.email
        if (email) {
          const parts = email
            .split('@')[0]
            .split(/[._-]/)
          const initials = parts.length > 1
            ? (parts[0][0] + parts[1][0])
              .toUpperCase()
            : email.slice(0, 2).toUpperCase()
          setUserInitials(initials)
        }
      }
    }
    getUser()
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (e.target.closest('.profile-menu-panel')) return
      if (e.target.closest('.avatar-btn')) return
      setMenuOpen(false)
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const links = [
    {
      href: '/',
      label: 'Dashboard',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1.5" y="1.5" width="5" height="5" rx="1.2" fill="currentColor" />
          <rect x="9.5" y="1.5" width="5" height="5" rx="1.2" fill="currentColor" opacity="0.6" />
          <rect x="1.5" y="9.5" width="5" height="5" rx="1.2" fill="currentColor" opacity="0.6" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1.2" fill="currentColor" opacity="0.3" />
        </svg>
      )
    },
    {
      href: '/journal',
      label: 'Daily Journal',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      href: '/trade-log',
      label: 'Trade Log',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      href: '/analytics',
      label: 'Analytics',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M1 13l4-5 3 2.5L12 5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      href: '/playbook',
      label: 'Playbook',
      icon: (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2.5" y="2" width="11" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M5 6h6M5 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      )
    },
  ]

  return (
    <aside style={{
      width: isExpanded ? '210px' : '56px',
      minHeight: '100vh',
      background: '#141414',
      borderRight: '1px solid rgba(255,255,255,0.07)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: isExpanded ? 'stretch' : 'center',
      padding: '16px 8px',
      gap: '4px',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 50,
      transition: 'width 0.2s ease',
    }}>

      {/* Heart logo + brand */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '20px',
        marginLeft: isExpanded ? '4px' : 0,
        width: isExpanded ? '100%' : 'auto',
      }}>
        <button
          onClick={onToggleExpand}
          title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          style={{
            border: 'none',
            cursor: 'pointer',
            width: '32px',
            height: '32px',
            background: accent,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.3s',
          }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 15.5S2 11 2 6.5A4.5 4.5 0 0 1 9 4.18 4.5 4.5 0 0 1 16 6.5C16 11 9 15.5 9 15.5Z" fill="white"/>
          </svg>
        </button>
        {isExpanded && (
          <span
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontSize: '16px',
              fontWeight: 700,
              letterSpacing: '0.01em',
              color: accent,
              userSelect: 'none',
            }}
          >
            Pulsed
          </span>
        )}
      </div>

      {/* Nav links */}
      {links.map(link => {
        const isActive = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch
            title={link.label}
            style={{
              width: isExpanded ? '100%' : '36px',
              height: '36px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isExpanded ? 'flex-start' : 'center',
              gap: isExpanded ? '10px' : 0,
              padding: isExpanded ? '0 10px' : 0,
              color: isActive ? accent : 'rgba(255,255,255,0.3)',
              background: isActive ? `${accent}20` : 'transparent',
              textDecoration: 'none',
              transition: 'all 0.15s',
            }}
          >
            {link.icon}
            {isExpanded && (
              <span style={{ fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                {link.label}
              </span>
            )}
          </Link>
        )
      })}

      {/* Bottom section */}
      <div style={{
        marginTop: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: isExpanded ? 'stretch' : 'center',
        gap: '10px',
        width: '100%',
      }}>

        {menuOpen && (
          <div
            className="profile-menu-panel"
            style={{
              position: 'fixed',
              left: isExpanded ? '210px' : '56px',
              bottom: 0,
              width: '220px',
              background: '#1A1A24',
              border: '1px solid rgba(255,255,255,0.1)',
              borderLeft: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '0 12px 0 0',
              zIndex: 49,
              boxShadow: '6px -4px 24px rgba(0,0,0,0.5)',
              overflow: 'hidden',
              animation: 'slideUp 0.2s ease forwards',
              padding: '8px',
            }}
          >
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                zIndex: 1,
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(255,255,255,0.08)',
                color: '#55536A',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              ×
            </button>

            <div style={{
              padding: '12px 36px 12px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              marginBottom: '4px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '8px',
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#fff',
                  flexShrink: 0,
                }}>
                  {userInitials}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#F0EEF8',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    My Account
                  </div>
                  <div style={{
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    color: '#55536A',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '140px',
                  }}>
                    {userEmail}
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: '7px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span style={{ fontSize: '14px' }}>
                  {theme === 'dark' ? '🌙' : '☀️'}
                </span>
                <span style={{
                  fontSize: '13px',
                  color: '#9896A8',
                }}>
                  {theme === 'dark'
                    ? 'Dark mode'
                    : 'Light mode'}
                </span>
              </div>

              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleTheme()
                }}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                style={{
                  width: '36px',
                  height: '20px',
                  borderRadius: '10px',
                  border: 'none',
                  padding: 0,
                  background: theme === 'dark'
                    ? accent : 'rgba(255,255,255,0.15)',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute',
                  top: '2px',
                  left: theme === 'dark'
                    ? '18px' : '2px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}/>
              </button>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              padding: '4px',
            }}>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => {
                  router.push('/settings')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 10px',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'none',
                  color: '#9896A8',
                  fontSize: '13px',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background =
                    'rgba(255,255,255,0.05)'
                  e.currentTarget.style.color = '#F0EEF8'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background =
                    'none'
                  e.currentTarget.style.color = '#9896A8'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M7.5 1v1.5M7.5 11v1.5M1 7.5h1.5M11 7.5h1.5M3 3l1 1M11 11l-1-1M11 3l-1 1M3 11l1-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                Settings
              </button>

              <div style={{
                height: '1px',
                background: 'rgba(255,255,255,0.06)',
                margin: '4px 0',
              }}/>

              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={async () => {
                  await supabase.auth.signOut()
                  setMenuOpen(false)
                  router.push('/auth')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 10px',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'none',
                  color: '#EF4444',
                  fontSize: '13px',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background =
                    'rgba(239,68,68,0.08)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background =
                    'none'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M6 2H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10 10l3-3-3-3M13 7.5H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Sign out
              </button>
            </div>
          </div>
        )}

        <div
          className="avatar-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: '600',
            color: '#fff',
            cursor: 'pointer',
            fontFamily: 'monospace',
            border: menuOpen
              ? '2px solid rgba(255,255,255,0.4)'
              : '2px solid transparent',
            transition: 'border 0.15s',
            userSelect: 'none',
          }}
        >
          {userInitials}
        </div>
      </div>
    </aside>
  )
}
