'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/ThemeContext'

export default function Sidebar() {
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
    if (!menuOpen) return

    function handleOutsideClick(e) {
      if (e.target.closest('aside')) return
      setMenuOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
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
      width: '56px',
      minHeight: '100vh',
      background: '#141414',
      borderRight: '1px solid rgba(255,255,255,0.07)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '16px 0',
      gap: '4px',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 50,
      overflow: 'visible',
    }}>

      <Link href="/dashboard" prefetch style={{ textDecoration: 'none', lineHeight: 0 }}>
        <div style={{
          width: '32px',
          height: '32px',
          background: accent,
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '20px',
          flexShrink: 0,
          cursor: 'pointer',
          transition: 'background 0.3s',
        }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 15.5S2 11 2 6.5A4.5 4.5 0 0 1 9 4.18 4.5 4.5 0 0 1 16 6.5C16 11 9 15.5 9 15.5Z" fill="white"/>
          </svg>
        </div>
      </Link>

      {links.map(link => {
        const isActive = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch
            title={link.label}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isActive
                ? accent
                : 'rgba(255,255,255,0.3)',
              background: isActive
                ? `${accent}20`
                : 'transparent',
              textDecoration: 'none',
              transition: 'all 0.15s',
            }}
          >
            {link.icon}
          </Link>
        )
      })}

      <div style={{
        marginTop: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        position: 'relative',
      }}>

        {menuOpen && (
          <div style={{
            position: 'absolute',
            bottom: '48px',
            left: '8px',
            width: '200px',
            background: '#1C1C28',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            overflow: 'hidden',
            zIndex: 100,
            boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
            animation: 'slideUpMenu 0.2s ease forwards',
          }}>

            <div style={{
              padding: '12px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <div style={{
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
                flexShrink: 0,
                fontFamily: 'monospace',
              }}>
                {userInitials}
              </div>
              <div style={{
                overflow: 'hidden',
                flex: 1,
              }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
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
                }}>
                  {userEmail}
                </div>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span style={{ fontSize: '13px' }}>
                  {theme === 'dark' ? '🌙' : '☀️'}
                </span>
                <span style={{
                  fontSize: '12px',
                  color: '#9896A8',
                }}>
                  {theme === 'dark'
                    ? 'Dark mode'
                    : 'Light mode'}
                </span>
              </div>

              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleTheme()
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleTheme()
                }}
                style={{
                  width: '34px',
                  height: '19px',
                  borderRadius: '10px',
                  background: theme === 'dark'
                    ? accent
                    : 'rgba(255,255,255,0.15)',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '2px',
                  left: theme === 'dark'
                    ? '17px' : '2px',
                  width: '15px',
                  height: '15px',
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}/>
              </div>
            </div>

            <div style={{
              height: '1px',
              background: 'rgba(255,255,255,0.06)',
              margin: '0 10px',
            }}/>

            <div style={{ padding: '6px' }}>
              <button
                type="button"
                onClick={() => {
                  router.push('/settings')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'none',
                  color: '#9896A8',
                  fontSize: '12px',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background =
                    'rgba(255,255,255,0.06)'
                  e.currentTarget.style.color =
                    '#F0EEF8'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background =
                    'none'
                  e.currentTarget.style.color =
                    '#9896A8'
                }}
              >
                <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
                  <circle cx="7.5" cy="7.5" r="2.2" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M7.5 1v1.5M7.5 11v1.5M1 7.5h1.5M11 7.5h1.5M3 3l1 1M11 11l-1-1M11 3l-1 1M3 11l1-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                Settings
              </button>

              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut()
                  setMenuOpen(false)
                  router.push('/login')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'none',
                  color: '#EF4444',
                  fontSize: '12px',
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
                <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
                  <path d="M6 2H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10 10l3-3-3-3M13 7.5H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Sign out
              </button>
            </div>
          </div>
        )}

        <div
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: menuOpen
              ? 'rgba(255,255,255,0.9)'
              : accent,
            color: menuOpen ? accent : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: '600',
            cursor: 'pointer',
            fontFamily: 'monospace',
            transition: 'all 0.15s',
            userSelect: 'none',
            border: menuOpen
              ? `2px solid ${accent}`
              : '2px solid transparent',
          }}
        >
          {userInitials}
        </div>
      </div>
    </aside>
  )
}
