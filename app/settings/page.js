'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ProfileSettingsSection from '@/components/ProfileSettingsSection'
import SecuritySettingsSection from '@/components/SecuritySettingsSection'
import SubscriptionSettingsSection from '@/components/SubscriptionSettingsSection'
import AccountsSettingsSection from '@/components/AccountsSettingsSection'
import GlobalSettingsSection from '@/components/GlobalSettingsSection'

function SettingsItemIcon({ itemKey, active }) {
  const color = active ? 'var(--accent)' : 'var(--text3)'
  const size = 18
  const icons = {
    profile: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="8" r="4" stroke={color} strokeWidth="1.5" />
        <path d="M6 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    security: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 3 5 6v5c0 5 3.5 8.5 7 9 3.5-.5 7-4 7-9V6l-7-3Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    subscription: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="6" width="18" height="14" rx="2" stroke={color} strokeWidth="1.5" />
        <path d="M3 10h18" stroke={color} strokeWidth="1.5" />
        <path d="M7 14h4M7 17h2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    accounts: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" stroke={color} strokeWidth="1.5" />
        <path d="M7 9h4M7 13h10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="17" cy="15" r="1" fill={color} />
      </svg>
    ),
    'trade-settings': (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 14h4l2-4 4 8 2-4h4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="8" cy="14" r="1.5" fill={color} />
        <circle cx="12" cy="10" r="1.5" fill={color} />
        <circle cx="16" cy="18" r="1.5" fill={color} />
      </svg>
    ),
    'global-settings': (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" />
        <path d="M3 12h18M12 3a15 15 0 0 0 0 18M12 3a15 15 0 0 1 0 18" stroke={color} strokeWidth="1.5" />
        <path d="M4.5 7h15M4.5 17h15" stroke={color} strokeWidth="1.5" opacity="0.5" />
      </svg>
    ),
    brokers: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M8 12h8M12 8v8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <rect x="4" y="4" width="16" height="16" rx="3" stroke={color} strokeWidth="1.5" />
        <path d="M16 16l4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  }
  return icons[itemKey] || icons.profile
}

export default function SettingsPage() {
  const pathname = usePathname()
  const [selectedItem, setSelectedItem] = useState('profile')
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState(null)

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', '#7C3AED')
  }, [])

  const groups = [
    {
      title: 'User',
      items: [
        { key: 'profile', label: 'Profile' },
        { key: 'security', label: 'Security' },
        { key: 'subscription', label: 'Subscription' },
      ],
    },
    {
      title: 'General',
      items: [
        { key: 'accounts', label: 'Accounts' },
        { key: 'brokers', label: 'Brokers', href: '/settings/brokers' },
        { key: 'trade-settings', label: 'Trade Settings' },
        { key: 'global-settings', label: 'Global Settings' },
      ],
    },
  ]

  const selectedLabel =
    groups.flatMap(group => group.items).find(item => item.key === selectedItem)?.label || 'Profile'
  const sectionTitle = selectedItem === 'security' ? 'Change your password' : selectedLabel

  async function handleLogout() {
    setLogoutError(null)
    setLoggingOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      router.push('/auth')
    } catch (e) {
      setLogoutError(e?.message || 'Could not log out.')
      setLoggingOut(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '26px 24px 48px' }}>
        <header style={{ marginBottom: '18px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <p style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Trading journal
          </p>
          <h1 style={{ marginTop: '6px', fontSize: '30px', fontWeight: 700 }}>Settings</h1>
          <p style={{ marginTop: '8px', maxWidth: '700px', fontSize: '13px', color: 'var(--text3)' }}>
            Choose a section from the left. We will fill each section with controls next.
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '14px' }}>
          <aside style={{ ...panelStyle, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: '1 1 auto' }}>
              {groups.map(group => (
                <div key={group.title} style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                    {group.title}
                  </div>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    {group.items.map(item => {
                      const isRoute = Boolean(item.href)
                      const active = isRoute
                        ? pathname === item.href
                        : selectedItem === item.key && pathname === '/settings'
                      const commonStyle = {
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        textAlign: 'left',
                        borderRadius: '8px',
                        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                        background: active ? 'var(--accent-subtle)' : 'var(--bg3)',
                        color: active ? 'var(--accent)' : 'var(--text2)',
                        padding: '10px 12px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                        textDecoration: 'none',
                        boxSizing: 'border-box',
                      }
                      return isRoute ? (
                        <Link key={item.key} href={item.href} style={commonStyle}>
                          <span style={{ display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
                            <SettingsItemIcon itemKey={item.key} active={active} />
                          </span>
                          <span>{item.label}</span>
                        </Link>
                      ) : (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setSelectedItem(item.key)}
                          style={commonStyle}
                        >
                          <span style={{ display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
                            <SettingsItemIcon itemKey={item.key} active={active} />
                          </span>
                          <span>{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Logout at bottom of left sidebar */}
            <div style={{ paddingTop: '14px', marginTop: '14px', borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                style={{
                  width: '100%',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg3)',
                  color: 'var(--text2)',
                  padding: '10px 12px',
                  cursor: loggingOut ? 'wait' : 'pointer',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  opacity: loggingOut ? 0.7 : 1,
                }}
              >
                {loggingOut ? 'Logging out…' : 'Logout'}
              </button>
              {logoutError ? (
                <div style={{ marginTop: '10px', fontSize: '11px', fontFamily: 'monospace', color: '#EF4444' }}>
                  {logoutError}
                </div>
              ) : null}
            </div>
          </aside>

          <section style={panelStyle}>
            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Selected Section
            </div>
            <h2 style={{ marginTop: '8px', fontSize: '24px', color: 'var(--text)' }}>{sectionTitle}</h2>
            {selectedItem === 'profile' ? (
              <div style={{ marginTop: '16px' }}>
                <ProfileSettingsSection />
              </div>
            ) : selectedItem === 'security' ? (
              <SecuritySettingsSection />
            ) : selectedItem === 'subscription' ? (
              <SubscriptionSettingsSection />
            ) : selectedItem === 'accounts' ? (
              <AccountsSettingsSection />
            ) : selectedItem === 'global-settings' ? (
              <GlobalSettingsSection />
            ) : (
              <div style={{ marginTop: '12px', border: '1px dashed var(--border-md)', borderRadius: '10px', background: 'var(--bg3)', padding: '16px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text2)' }}>
                  Placeholder for <span style={{ color: 'var(--accent)' }}>{selectedLabel}</span> settings.
                </p>
                <p style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text3)', fontFamily: 'monospace' }}>
                  Tell me what fields/actions you want here and I will add them.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

const panelStyle = {
  border: '1px solid var(--border)',
  borderRadius: '12px',
  background: 'var(--card-bg)',
  padding: '16px',
}
