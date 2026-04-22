'use client'

export default function NotificationsSettingsSection() {
  return (
    <div style={{ marginTop: '16px' }}>
      <div
        style={{
          border: '1px dashed var(--border-md)',
          borderRadius: '12px',
          background: 'var(--bg3)',
          padding: '24px 20px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', margin: '0 0 8px' }}>Coming soon</p>
        <p style={{ fontSize: '13px', color: 'var(--text3)', lineHeight: 1.5, margin: 0, maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
          Email and in-app notification preferences will be available here in a future update.
        </p>
      </div>
    </div>
  )
}
