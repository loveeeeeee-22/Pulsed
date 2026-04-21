'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'pulsed-admin'

export default function MaintenanceAdmin() {
  const [authed, setAuthed] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [form, setForm] = useState({
    is_active: false,
    message:
      'We are performing scheduled maintenance to improve your experience. We will be back shortly.',
    ends_at: '',
  })

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('*').eq('id', 'maintenance').maybeSingle()

    if (data) {
      setForm({
        is_active: Boolean(data.is_active),
        message: data.message || '',
        ends_at: data.ends_at ? new Date(data.ends_at).toISOString().slice(0, 16) : '',
      })
    }
  }, [])

  useEffect(() => {
    if (authed) void fetchSettings()
  }, [authed, fetchSettings])

  function tryLogin(pwd) {
    if (pwd === ADMIN_PASSWORD) {
      setAdminPassword(pwd)
      setAuthed(true)
      setSaveError('')
    } else {
      window.alert('Wrong password')
    }
  }

  async function saveSettings() {
    setSaving(true)
    setSaveError('')
    setSaved(false)

    const endsAtIso = form.ends_at ? new Date(form.ends_at).toISOString() : null
    const payload = {
      password: adminPassword,
      is_active: form.is_active,
      message: form.message,
      ends_at: endsAtIso,
      started_at: form.is_active ? new Date().toISOString() : null,
    }

    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setSaveError(json.error || res.statusText || 'Save failed')
        setSaving(false)
        return
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      await fetchSettings()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!authed) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0A0A0F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            background: '#111118',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '12px',
            padding: '32px',
            width: '320px',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              fontFamily: 'monospace',
              color: '#7C3AED',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            Admin Access
          </div>
          <div
            style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#F0EEF8',
              marginBottom: '24px',
            }}
          >
            Maintenance Control
          </div>
          <input
            type="password"
            name="admin-password"
            autoComplete="current-password"
            placeholder="Enter admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') tryLogin(password)
            }}
            style={{
              width: '100%',
              background: '#18181F',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#F0EEF8',
              padding: '10px 14px',
              fontSize: '14px',
              outline: 'none',
              marginBottom: '12px',
              fontFamily: 'monospace',
            }}
          />
          <button
            type="button"
            onClick={() => tryLogin(password)}
            style={{
              width: '100%',
              background: '#7C3AED',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Enter
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0A0A0F',
        color: '#F0EEF8',
        fontFamily: 'sans-serif',
        padding: '40px 24px',
      }}
    >
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>
        <div style={{ marginBottom: '32px' }}>
          <div
            style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              color: '#7C3AED',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '6px',
            }}
          >
            Admin Panel
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '600' }}>Maintenance Mode</h1>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: form.is_active ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
            border: `1px solid ${form.is_active ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
            borderRadius: '10px',
            padding: '14px 18px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: form.is_active ? '#EF4444' : '#22C55E',
              flexShrink: 0,
              boxShadow: form.is_active ? '0 0 8px #EF4444' : '0 0 8px #22C55E',
            }}
          />
          <div>
            <div
              style={{
                fontSize: '14px',
                fontWeight: '500',
                color: form.is_active ? '#EF4444' : '#22C55E',
              }}
            >
              {form.is_active ? 'Maintenance Mode ACTIVE' : 'App is LIVE'}
            </div>
            <div
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#55536A',
                marginTop: '2px',
              }}
            >
              {form.is_active ? 'Users see the maintenance screen' : 'Users can access the app normally'}
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#111118',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>Enable Maintenance Mode</div>
              <div style={{ fontSize: '12px', color: '#55536A', fontFamily: 'monospace' }}>
                All users will see maintenance screen when ON
              </div>
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
              aria-pressed={form.is_active}
              style={{
                width: '48px',
                height: '26px',
                borderRadius: '13px',
                border: 'none',
                background: form.is_active ? '#EF4444' : '#18181F',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
                outline: form.is_active ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '3px',
                  left: form.is_active ? '25px' : '3px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s',
                }}
              />
            </button>
          </div>
        </div>

        <div
          style={{
            background: '#111118',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '16px',
          }}
        >
          <label
            style={{
              fontSize: '12px',
              fontFamily: 'monospace',
              color: '#55536A',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              display: 'block',
              marginBottom: '10px',
            }}
            htmlFor="maint-message"
          >
            Maintenance Message
          </label>
          <textarea
            id="maint-message"
            name="maint-message"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            rows={3}
            style={{
              width: '100%',
              background: '#18181F',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#F0EEF8',
              padding: '10px 14px',
              fontSize: '14px',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'sans-serif',
              lineHeight: '1.6',
            }}
          />
          <div style={{ fontSize: '11px', color: '#55536A', marginTop: '6px', fontFamily: 'monospace' }}>
            This message appears on the maintenance screen
          </div>
        </div>

        <div
          style={{
            background: '#111118',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <label
            style={{
              fontSize: '12px',
              fontFamily: 'monospace',
              color: '#55536A',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              display: 'block',
              marginBottom: '10px',
            }}
            htmlFor="maint-ends"
          >
            Estimated End Time (optional)
          </label>
          <input
            id="maint-ends"
            name="maint-ends"
            type="datetime-local"
            value={form.ends_at}
            onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
            style={{
              width: '100%',
              background: '#18181F',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#F0EEF8',
              padding: '10px 14px',
              fontSize: '14px',
              outline: 'none',
              fontFamily: 'monospace',
            }}
          />
          <div style={{ fontSize: '11px', color: '#55536A', marginTop: '6px', fontFamily: 'monospace' }}>
            If set, users see a countdown timer. Leave blank for no timer.
          </div>
          {form.ends_at ? (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, ends_at: '' }))}
              style={{
                marginTop: '8px',
                background: 'none',
                border: 'none',
                color: '#EF4444',
                fontSize: '12px',
                fontFamily: 'monospace',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              × Clear end time
            </button>
          ) : null}
        </div>

        {saveError ? (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(239,68,68,0.45)',
              background: 'rgba(239,68,68,0.08)',
              color: '#fca5a5',
              fontSize: '12px',
              fontFamily: 'monospace',
            }}
          >
            {saveError}
          </div>
        ) : null}

        <button
          type="button"
          onClick={saveSettings}
          disabled={saving}
          style={{
            width: '100%',
            background: saved ? '#22C55E' : '#7C3AED',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '14px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
            transition: 'all 0.2s',
          }}
        >
          {saving ? 'Saving...' : null}
          {saved ? '✓ Saved — Changes are live' : null}
          {!saving && !saved ? 'Save & Apply' : null}
        </button>

        <div
          style={{
            textAlign: 'center',
            marginTop: '16px',
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#55536A',
          }}
        >
          Admin panel at <span style={{ color: '#7C3AED' }}>/admin/maintenance</span> — bookmark this page
        </div>
      </div>
    </div>
  )
}
