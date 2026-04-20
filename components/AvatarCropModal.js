'use client'

import { useCallback, useState } from 'react'
import Cropper from 'react-easy-crop'
import { getCroppedImg } from '@/lib/cropImage'

export default function AvatarCropModal({ imageSrc, onClose, onComplete }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [busy, setBusy] = useState(false)

  const onCropComplete = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  const onCropAreaChange = useCallback((_area, areaPixels) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  async function apply() {
    if (!croppedAreaPixels) return
    setBusy(true)
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels)
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      onComplete(file)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop profile photo"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          background: 'var(--card-bg)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Crop
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
            Drag to reposition, zoom to fit your face in the circle.
          </div>
        </div>
        <div style={{ position: 'relative', width: '100%', height: 'min(62vh, 360px)', background: '#111' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            onCropAreaChange={onCropAreaChange}
          />
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label htmlFor="avatar-crop-zoom" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: 'var(--text2)' }}>
            <span style={{ fontFamily: 'monospace', color: 'var(--text3)', whiteSpace: 'nowrap' }}>Zoom</span>
            <input
              id="avatar-crop-zoom"
              name="avatar-crop-zoom"
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              autoComplete="off"
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text2)',
              padding: '8px 14px',
              fontSize: '12px',
              fontFamily: 'monospace',
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={busy || !croppedAreaPixels}
            style={{
              borderRadius: '8px',
              border: '1px solid var(--accent)',
              background: 'var(--accent)',
              color: '#fff',
              padding: '8px 14px',
              fontSize: '12px',
              fontFamily: 'monospace',
              cursor: busy || !croppedAreaPixels ? 'wait' : 'pointer',
              opacity: !croppedAreaPixels ? 0.6 : 1,
            }}
          >
            {busy ? '…' : 'Use photo'}
          </button>
        </div>
      </div>
    </div>
  )
}
