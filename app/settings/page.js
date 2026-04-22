'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ProfileSettingsSection from '@/components/ProfileSettingsSection'
import GlobalSettingsSection from '@/components/GlobalSettingsSection'
import SecuritySettingsSection from '@/components/SecuritySettingsSection'
import SubscriptionSettingsSection from '@/components/SubscriptionSettingsSection'
import AccountsSettingsSection from '@/components/AccountsSettingsSection'
import AppearanceSettingsSection from '@/components/AppearanceSettingsSection'
import NotificationsSettingsSection from '@/components/NotificationsSettingsSection'
import DataPrivacySettingsSection from '@/components/DataPrivacySettingsSection'
import BrokerSyncModal from '@/components/BrokerSyncModal'

const NAV_ORDER = [
  { key: 'profile', label: 'Profile' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'security', label: 'Security' },
  { key: 'subscription', label: 'Subscription' },
  { key: 'data', label: 'Data & Privacy' },
]

const VALID_KEYS = new Set(NAV_ORDER.map(i => i.key))

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
    appearance: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="12" r="4" stroke={color} strokeWidth="1.5" />
        <path d="M4.2 4.2l2.7 2.7M19.1 4.2l-2.6 2.6M4.1 19.1l2.6-2.6M19.1 19.1l-2.6-2.6" stroke={color} strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
    notifications: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9.5 19a2.5 2.5 0 0 0 4 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    data: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 6h16v12H4V6Z" stroke={color} strokeWidth="1.5" />
        <path d="M8 10h8M8 14h4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8 4V2M16 4V2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  }
  return icons[itemKey] || icons.profile
}

function sectionHeading(key) {
  return NAV_ORDER.find(n => n.key === key)?.label || 'Settings'
}

export default function SettingsPage() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const sectionParam = searchParams.get('section')
  const [selectedItem, setSelectedItem] = useState(
    sectionParam && VALID_KEYS.has(sectionParam) ? sectionParam : 'profile',
  )
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState(null)
  const [showBrokerModal, setShowBrokerModal] = useState(false)

  useEffect(() => {
    const lsAccent = typeof window !== 'undefined' ? window.localStorage.getItem('accentColor') : null
    document.documentElement.style.setProperty('--accent', lsAccent || '#7C3AED')
  }, [])

  useEffect(() => {
    const fromUrl = searchParams.get('section')
    if (fromUrl && VALID_KEYS.has(fromUrl)) {
      setSelectedItem(fromUrl)
    } else {
      setSelectedItem('profile')
    }
  }, [searchParams])

  const setSection = useCallback(
    (key) => {
      if (!VALID_KEYS.has(key)) return
      setSelectedItem(key)
      router.replace(`/settings?section=${key}`, { scroll: false })
    },
    [router]
  )

  const sectionTitle = sectionHeading(selectedItem)

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
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '26px 24px 48px' }}>
        <header style={{ marginBottom: '22px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          <p style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Pulsed
          </p>
          <h1 style={{ marginTop: '6px', fontSize: '30px', fontWeight: 700 }}>Settings</h1>
          <p style={{ marginTop: '8px', maxWidth: '640px', fontSize: '13px', color: 'var(--text3)' }}>
            Manage your profile, journal accounts, and preferences.
          </p>
          <div style={{ marginTop: '14px' }}>
            <button
              type="button"
              onClick={() => setShowBrokerModal(true)}
              style={{
                borderRadius: '10px',
                border: '1px solid var(--accent)',
                background: 'var(--accent-subtle)',
                color: 'var(--accent)',
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Connect broker
            </button>
          </div>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 240px) 1fr',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          <aside style={{ ...panelStyle, display: 'flex', flexDirection: 'column', position: 'sticky', top: '16px' }}>
            <nav style={{ display: 'grid', gap: '6px' }} aria-label="Settings sections">
              {NAV_ORDER.map(item => {
                const active = pathname === '/settings' && selectedItem === item.key
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
                return (
                  <button key={item.key} type="button" onClick={() => setSection(item.key)} style={commonStyle}>
                    <span style={{ display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'center' }}>
                      <SettingsItemIcon itemKey={item.key} active={active} />
                    </span>
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </nav>

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
                {loggingOut ? 'Logging out…' : 'Log out'}
              </button>
              {logoutError ? (
                <div style={{ marginTop: '10px', fontSize: '11px', fontFamily: 'monospace', color: '#EF4444' }}>{logoutError}</div>
              ) : null}
            </div>
          </aside>

          <section style={mainPanelStyle}>
            <h2 style={{ marginTop: 0, fontSize: '22px', color: 'var(--text)' }}>{sectionTitle}</h2>

            {selectedItem === 'profile' ? (
              <div style={{ marginTop: '12px' }}>
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '14px' }}>Display name, email, avatar, timezone, and currency.</p>
                <ProfileSettingsSection />
                <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>Timezone & currency</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
                    Used for journal dates, reports, and how amounts are displayed.
                  </p>
                  <GlobalSettingsSection />
                </div>
              </div>
            ) : selectedItem === 'accounts' ? (
              <div style={{ marginTop: '12px' }}>
                <AccountsSettingsSection onOpenBrokerSync={() => setShowBrokerModal(true)} />
              </div>
            ) : selectedItem === 'appearance' ? (
              <AppearanceSettingsSection />
            ) : selectedItem === 'notifications' ? (
              <NotificationsSettingsSection />
            ) : selectedItem === 'security' ? (
              <div style={{ marginTop: '12px' }}>
                <SecuritySettingsSection />
              </div>
            ) : selectedItem === 'subscription' ? (
              <div style={{ marginTop: '12px' }}>
                <SubscriptionSettingsSection />
              </div>
            ) : selectedItem === 'data' ? (
              <DataPrivacySettingsSection />
            ) : null}
          </section>
        </div>
      </div>

      <BrokerSyncModal
        isOpen={showBrokerModal}
        onClose={() => setShowBrokerModal(false)}
        onSuccess={() => setShowBrokerModal(false)}
      />
    </div>
  )
}

const panelStyle = {
  border: '1px solid var(--border)',
  borderRadius: '12px',
  background: 'var(--card-bg)',
  padding: '16px',
}

const mainPanelStyle = {
  ...panelStyle,
  minHeight: 'min(72vh, 560px)',
  overflow: 'auto',
}
