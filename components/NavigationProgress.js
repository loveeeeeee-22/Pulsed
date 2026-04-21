'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Thin top bar during pathname changes — improves perceived speed on slow data/JS.
 */
export default function NavigationProgress() {
  const pathname = usePathname()
  const [widthPct, setWidthPct] = useState(0)
  const skipFirst = useRef(true)
  const timersRef = useRef([])

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false
      return
    }

    timersRef.current.forEach(clearTimeout)
    timersRef.current = []

    setWidthPct(10)
    timersRef.current.push(
      setTimeout(() => setWidthPct(72), 35),
      setTimeout(() => setWidthPct(100), 200),
      setTimeout(() => setWidthPct(0), 360),
    )

    return () => {
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
    }
  }, [pathname])

  if (widthPct === 0) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        zIndex: 10000,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${widthPct}%`,
          background: 'linear-gradient(90deg, var(--accent, #7C3AED), #c4b5fd)',
          transition:
            widthPct === 100 ? 'width 0.14s ease-out' : 'width 0.18s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          boxShadow: '0 0 12px rgba(124,58,237,0.35)',
        }}
      />
    </div>
  )
}
