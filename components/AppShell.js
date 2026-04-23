'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import AuthSessionRecovery from '@/components/AuthSessionRecovery'
import NavigationProgress from '@/components/NavigationProgress'

export default function AppShell({ children }) {
  const pathname = usePathname()
  const hideSidebar =
    pathname === '/landing' ||
    (typeof pathname === 'string' && pathname.startsWith('/auth')) ||
    (typeof pathname === 'string' && pathname.startsWith('/maintenance')) ||
    (typeof pathname === 'string' && pathname.startsWith('/admin'))

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <NavigationProgress />
      <AuthSessionRecovery />
      {!hideSidebar && <Sidebar />}
      <main
        style={{
          marginLeft: hideSidebar ? 0 : '56px',
          flex: 1,
          minHeight: '100vh',
          background: 'var(--page-bg)',
          color: 'var(--text)',
        }}
      >
        {children}
      </main>
    </div>
  )
}
