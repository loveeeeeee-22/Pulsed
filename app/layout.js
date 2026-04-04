import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/lib/ThemeContext'
import AppShell from '@/components/AppShell'
import './globals.css'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}