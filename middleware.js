import { NextResponse } from 'next/server'

function maintenanceEnabled() {
  const v = process.env.MAINTENANCE_MODE
  if (v == null || String(v).trim() === '') return false
  const s = String(v).trim().toLowerCase()
  return s === 'true' || s === '1' || s === 'yes'
}

/** /downloads/PulsedEA.mq5 etc. — matcher still runs for these */
function isLikelyPublicAsset(pathname) {
  const last = pathname.split('/').pop() || ''
  if (!last.includes('.')) return false
  return /\.[a-zA-Z0-9]{1,20}$/.test(last)
}

export function middleware(request) {
  try {
    const { pathname } = request.nextUrl

    if (isLikelyPublicAsset(pathname)) {
      return NextResponse.next()
    }

    if (!maintenanceEnabled()) {
      return NextResponse.next()
    }

    if (pathname === '/maintenance' || pathname.startsWith('/maintenance/')) {
      return NextResponse.next()
    }

    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
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
    return NextResponse.next()
  }
}

/**
 * Do not run middleware on /api, any /_next/*, or /favicon.ico — avoids Edge touching JS chunks
 * (redirecting those requests was breaking the app). See Next.js middleware matcher docs.
 */
export const config = {
  matcher: ['/', '/((?!api|_next|favicon.ico).*)'],
}
