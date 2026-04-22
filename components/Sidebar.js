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

  const [showUserMenu, setShowUserMenu] = useState(false)
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
      if (!e.target.closest('.user-menu-wrap')) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

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

        <div className="user-menu-wrap" style={{ position: 'relative' }}>

          {showUserMenu && (
            <div style={{
              position: 'fixed',
              bottom: '60px',
              left: '64px',
              background: '#1A1A24',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              padding: '6px',
              zIndex: 200,
              minWidth: '220px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>

              <div style={{
                padding: '10px 12px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                marginBottom: '4px',
              }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#F0EEF8',
                  marginBottom: '2px',
                }}>
                  My Account
                </div>
                <div style={{
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: '#55536A',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {userEmail}
                </div>
              </div>

              {[
                {
                  label: 'Profile & Settings',
                  icon: '⚙',
                  action: () => {
                    router.push('/settings')
                    setShowUserMenu(false)
                  }
                },
                {
                  label: theme === 'dark'
                    ? 'Switch to Light Mode'
                    : 'Switch to Dark Mode',
                  icon: theme === 'dark' ? '☀' : '🌙',
                  action: () => {
                    toggleTheme()
                    setShowUserMenu(false)
                  }
                },
              ].map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={item.action}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '9px 12px',
                    borderRadius: '7px',
                    border: 'none',
                    background: 'none',
                    color: '#9896A8',
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    e.currentTarget.style.color = '#F0EEF8'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'none'
                    e.currentTarget.style.color = '#9896A8'
                  }}
                >
                  <span style={{ fontSize: '14px' }}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              ))}

              <div style={{
                height: '1px',
                background: 'rgba(255,255,255,0.07)',
                margin: '4px 0',
              }} />

              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut()
                  router.push('/auth')
                  setShowUserMenu(false)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'none',
                  color: '#EF4444',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'none'
                }}
              >
                <span style={{ fontSize: '14px' }}>→</span>
                Sign out
              </button>
            </div>
          )}

          <div
            onClick={() => setShowUserMenu(!showUserMenu)}
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
              border: showUserMenu
                ? '2px solid rgba(255,255,255,0.3)'
                : '2px solid transparent',
              transition: 'border 0.15s',
            }}
          >
            {userInitials}
          </div>
        </div>
      </div>
    </aside>
  )
}
