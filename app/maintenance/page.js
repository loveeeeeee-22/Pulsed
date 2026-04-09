export const metadata = {
  title: 'Maintenance · Pulsed',
  description: 'Pulsed is temporarily unavailable.',
}

export default function MaintenancePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        background: 'var(--page-bg, #0a0a0a)',
        color: 'var(--text, #fafafa)',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          maxWidth: '420px',
          borderRadius: '16px',
          border: '1px solid var(--border, #2a2a2a)',
          background: 'var(--card-bg, #141414)',
          padding: '32px 28px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        <p
          style={{
            fontSize: '11px',
            fontFamily: 'monospace',
            color: 'var(--accent, #7C3AED)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            margin: '0 0 12px',
          }}
        >
          Pulsed
        </p>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 12px', lineHeight: 1.25 }}>
          We&apos;re updating the app
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text2, #a3a3a3)', lineHeight: 1.6, margin: 0 }}>
          Trading journal access is paused for a short time while we ship improvements. Please try again in a little
          while.
        </p>
      </div>
      <p style={{ marginTop: '28px', fontSize: '12px', color: 'var(--text3, #737373)', maxWidth: '360px', lineHeight: 1.5 }}>
        APIs and imports (e.g. MT5) stay online during maintenance. Only the web app is in read-only downtime mode.
      </p>
    </div>
  )
}
