import { NextResponse } from 'next/server'

function maintenanceEnabled() {
  const v = process.env.MAINTENANCE_MODE
  if (v == null || String(v).trim() === '') return false
  const s = String(v).trim().toLowerCase()
  return s === 'true' || s === '1' || s === 'yes'
}

/** Public files like /PulsedEA.mq5 — last path segment looks like a static asset */
function isLikelyPublicAsset(pathname) {
  const last = pathname.split('/').pop() || ''
  if (!last.includes('.')) return false
  return /\.[a-zA-Z0-9]{1,20}$/.test(last)
}

export function middleware(request) {
  try {
    const { pathname } = request.nextUrl

    // Never touch Next internals, APIs, or typical static paths (no fragile regex on Edge)
    if (pathname.startsWith('/api') || pathname.startsWith('/_next')) {
      return NextResponse.next()
    }
    if (pathname === '/favicon.ico' || pathname === '/icon.ico' || pathname === '/robots.txt' || pathname === '/sitemap.xml') {
      return NextResponse.next()
    }
    if (isLikelyPublicAsset(pathname)) {
      return NextResponse.next()
    }

    if (!maintenanceEnabled()) {
      return NextResponse.next()
    }

    if (pathname === '/maintenance' || pathname.startsWith('/maintenance/')) {
      return NextResponse.next()
    }

    const bypass = process.env.MAINTENANCE_BYPASS_SECRET
    if (bypass && request.cookies.get('pulsed_maintenance_bypass')?.value === bypass) {
      return NextResponse.next()
    }

    const url = request.nextUrl.clone()
    url.pathname = '/maintenance'
    url.search = ''
    const res = NextResponse.redirect(url)
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    res.headers.set('Pragma', 'no-cache')
    return res
  } catch {
    // If middleware ever throws on Edge, still serve the app
    return NextResponse.next()
  }
}

export const config = {
  matcher: '/:path*',
}
