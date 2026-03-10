import { NextRequest, NextResponse } from 'next/server'

/**
 * Clerk Frontend API Proxy
 *
 * iPhoneのLINEアプリ内ブラウザ → Safari遷移時にCookieが消える問題の対策。
 * Clerkの OAuth callback を clerk.realproof.jp（別サブドメイン）ではなく
 * realproof.jp/api/clerk-proxy/ 経由にすることで、同一ドメインでCookieを維持する。
 */

function getClerkFapiHost(): string {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  if (!pk) {
    throw new Error('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set')
  }
  // pk_test_<base64(frontendApi)>$ or pk_live_<base64(frontendApi)>$
  const parts = pk.split('_')
  // parts: ['pk', 'test'|'live', '<base64>$']
  const encoded = parts.slice(2).join('_').replace(/\$$/, '')
  const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
  return decoded
}

async function handler(req: NextRequest) {
  const fapiHost = getClerkFapiHost()

  // Extract the path after /api/clerk-proxy/
  const url = new URL(req.url)
  const clerkPath = url.pathname.replace(/^\/api\/clerk-proxy/, '') || '/'
  const targetUrl = `https://${fapiHost}${clerkPath}${url.search}`

  // Forward headers, adding required proxy headers
  const headers = new Headers(req.headers)
  headers.set('Clerk-Proxy-Url', `${url.origin}/api/clerk-proxy`)
  headers.set('Clerk-Secret-Key', process.env.CLERK_SECRET_KEY || '')
  headers.set(
    'X-Forwarded-For',
    req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1'
  )
  // Remove host header to avoid conflicts
  headers.delete('host')

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  }

  // Forward body for non-GET/HEAD requests
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    fetchOptions.body = req.body
    // @ts-expect-error duplex is needed for streaming body
    fetchOptions.duplex = 'half'
  }

  const response = await fetch(targetUrl, fetchOptions)

  // Build response with original headers
  const responseHeaders = new Headers(response.headers)
  // Remove transfer-encoding as Next.js handles this
  responseHeaders.delete('transfer-encoding')

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
