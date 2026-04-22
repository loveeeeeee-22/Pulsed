'use client'

import { useCallback, useState } from 'react'
import { getTradesForUser } from '@/lib/getTradesForUser'
import { exportTradesCsv } from '@/lib/exportTradesCsv'
import AccountDeletionSection from '@/components/AccountDeletionSection'

export default function DataPrivacySettingsSection() {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  const handleExport = useCallback(async () => {
    setExportError('')
    setExporting(true)
    try {
      const trades = await getTradesForUser({ orderAscending: true })
      const name = `pulsed-trades-${new Date().toISOString().slice(0, 10)}.csv`
      exportTradesCsv(trades, name)
    } catch (e) {
      setExportError(e?.message || 'Could not export trades.')
    } finally {
      setExporting(false)
    }
  }, [])

  return (
    <div style={{ marginTop: '16px', display: 'grid', gap: '28px' }}>
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: '0 0 10px' }}>Export</h3>
        <p style={{ fontSize: '13px', color: 'var(--text3)', lineHeight: 1.5, marginBottom: '12px', maxWidth: '520px' }}>
          Download all of your trades as a CSV file for backup or analysis in spreadsheets.
        </p>
        {exportError ? (
          <div
            style={{
              marginBottom: '10px',
              borderRadius: '8px',
              border: '1px solid rgba(239,68,68,0.45)',
              background: 'rgba(239,68,68,0.08)',
              color: '#fca5a5',
              padding: '8px 10px',
              fontSize: '12px',
              fontFamily: 'monospace',
            }}
          >
            {exportError}
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          style={{
            borderRadius: '10px',
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: '#fff',
            padding: '10px 20px',
            fontSize: '13px',
            fontFamily: 'monospace',
            cursor: exporting ? 'wait' : 'pointer',
            opacity: exporting ? 0.75 : 1,
          }}
        >
          {exporting ? 'Preparing…' : 'Export all trades (CSV)'}
        </button>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Danger zone</h3>
        <AccountDeletionSection />
      </div>
    </div>
  )
}
