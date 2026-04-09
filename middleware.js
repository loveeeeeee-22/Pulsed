import { NextResponse } from 'next/server'

function maintenanceEnabled() {
  const v = process.env.MAINTENANCE_MODE
  return v === 'true' || v === '1' || v === 'yes'
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
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    /*
     * Page navigations only: skip API routes, Next internals, and static files
     * (filenames with a dot) so MT5 / Tradovate / assets keep working.
     */
    '/((?!api|_next/static|_next/image|favicon.ico|icon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
}
