import { NextResponse } from 'next/server'

function maintenanceEnabled() {
  const v = process.env.MAINTENANCE_MODE
  if (v == null || String(v).trim() === '') return false
  const s = String(v).trim().toLowerCase()
  return s === 'true' || s === '1' || s === 'yes'
}

export function middleware(request) {
  if (!maintenanceEnabled()) {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl

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
  // Avoid CDNs or browsers caching the redirect after you turn maintenance off
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  res.headers.set('Pragma', 'no-cache')
  return res
}

export const config = {
  matcher: [
    /*
     * Skip API, all of /_next (RSC, HMR, chunks — not only static/image), and
     * paths whose last segment looks like a file (public assets with extensions).
     */
    '/((?!api|_next|favicon.ico|icon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
}
