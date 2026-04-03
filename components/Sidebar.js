'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/lib/ThemeContext'

export default function Sidebar({ isExpanded, onToggleExpand }) {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const accent = '#7C3AED'

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
        gap: '8px',
        width: '100%',
      }}>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            width: isExpanded ? '100%' : '36px',
            height: '36px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'none',
            color: 'rgba(255,255,255,0.3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            gap: isExpanded ? '10px' : 0,
            padding: isExpanded ? '0 10px' : 0,
            transition: 'all 0.15s',
          }}
        >
          {theme === 'dark' ? (
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M3 3l1 1M11 11l1 1M11 3l-1 1M3 11l1-1"
                stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M13 8.5A5.5 5.5 0 0 1 6.5 2a5.5 5.5 0 1 0 6.5 6.5Z"
                stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          )}
          {isExpanded && (
            <span style={{ fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </span>
          )}
        </button>

        {/* Settings */}
        <Link
          href="/settings"
          title="Settings"
          style={{
            width: isExpanded ? '100%' : '36px',
            height: '36px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            gap: isExpanded ? '10px' : 0,
            padding: isExpanded ? '0 10px' : 0,
            color: pathname?.startsWith('/settings') ? accent : 'rgba(255,255,255,0.3)',
            background: pathname?.startsWith('/settings') ? `${accent}20` : 'transparent',
            textDecoration: 'none',
            transition: 'all 0.15s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
              stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          {isExpanded && (
            <span style={{ fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>Settings</span>
          )}
        </Link>

        {/* Avatar */}
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
          cursor: 'pointer',
          fontFamily: 'monospace',
          transition: 'background 0.3s',
        }}>
          LO
        </div>
      </div>
    </aside>
  )
}