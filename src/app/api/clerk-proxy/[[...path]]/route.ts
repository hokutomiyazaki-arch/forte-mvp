// src/app/api/clerk-proxy/[[...path]]/route.ts
// Clerk Frontend API Proxy
// 目的: iPhoneでLINEアプリ→SafariのCookie引き継ぎ問題を解決する
// 仕組み: Clerk APIへのリクエストをrealproof.jp同一ドメイン経由にすることで
//         iOSのITPによるCookie削除を回避する
import { NextRequest, NextResponse } from 'next/server'

const CLERK_FAPI_HOST = 'clerk.realproof.jp'

async function handler(req: NextRequest) {
  const url = new URL(req.url)
  const clerkPath = url.pathname.replace(/^\/api\/clerk-proxy/, '') || '/'
  const targetUrl = `https://${CLERK_FAPI_HOST}${clerkPath}${url.search}`

  const headers = new Headers(req.headers)
  headers.set('Clerk-Proxy-Url', `${url.origin}/api/clerk-proxy`)
  headers.set('Clerk-Secret-Key', process.env.CLERK_SECRET_KEY || '')
  headers.set(
    'X-Forwarded-For',
    req.headers.get('x-forwarded-for') ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
  // hostを削除しないとClerkが混乱する
  headers.delete('host')
  // content-encodingを削除しないとERR_CONTENT_DECODING_FAILEDになる
  headers.delete('accept-encoding')

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    fetchOptions.body = req.body
    // @ts-expect-error duplex is needed for streaming body
    fetchOptions.duplex = 'half'
  }

  const response = await fetch(targetUrl, fetchOptions)

  const responseHeaders = new Headers(response.headers)
  responseHeaders.delete('transfer-encoding')
  responseHeaders.delete('content-encoding')

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
