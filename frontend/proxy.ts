import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const development = process.env.NODE_ENV === 'development'
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    development ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${development ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', policy)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('content-security-policy', policy)
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  response.headers.set('x-content-type-options', 'nosniff')
  response.headers.set('x-frame-options', 'DENY')
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()')
  if (!development) response.headers.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload')
  return response
}

export const config = {
  matcher: [{ source: '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)' }],
}
