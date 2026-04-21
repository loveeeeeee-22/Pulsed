import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/lib/ThemeContext'
import AppShell from '@/components/AppShell'
import MaintenanceGate from '@/components/MaintenanceGate'
import './globals.css'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <MaintenanceGate>
            <AppShell>{children}</AppShell>
          </MaintenanceGate>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}