'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import AuthSessionRecovery from '@/components/AuthSessionRecovery'

export default function AppShell({ children }) {
  const pathname = usePathname()
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false)
  const sidebarWidth = isSidebarExpanded ? 210 : 56
  const hideSidebar =
    pathname === '/landing' ||
    (typeof pathname === 'string' && pathname.startsWith('/auth')) ||
    (typeof pathname === 'string' && pathname.startsWith('/maintenance'))

  useEffect(() => {
    if (pathname === '/subscription' || (pathname && pathname.startsWith('/settings'))) {
      setIsSidebarExpanded(true)
    }
  }, [pathname])

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <AuthSessionRecovery />
      {!hideSidebar && (
        <Sidebar
          isExpanded={isSidebarExpanded}
          onToggleExpand={() => setIsSidebarExpanded(prev => !prev)}
        />
      )}
      <main
        style={{
          marginLeft: hideSidebar ? 0 : `${sidebarWidth}px`,
          flex: 1,
          minHeight: '100vh',
          background: 'var(--page-bg)',
          color: 'var(--text)',
          transition: 'margin-left 0.2s ease',
        }}
      >
        {children}
      </main>
    </div>
  )
}
