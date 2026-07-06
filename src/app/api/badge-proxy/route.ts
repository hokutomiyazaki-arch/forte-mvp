import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/badge-proxy?url=<supabase badge image url>
 *
 * 団体シェアカード用: バッジ画像（Supabase Storage 上の透過PNG）を同一オリジンで中継する。
 * Supabase Storage は画像レスポンスに Access-Control-Allow-Origin を付けないため、
 * ブラウザ側（fetch/canvas）では透過を取得・変換できず、html2canvas で白背景に潰れていた。
 * サーバー（同一オリジン）経由にすると、ブラウザから見てメダル（/medals/*.png）と同条件の
 * 同一オリジン画像になり、html2canvas で透過が保持される。
 *
 * ★SSRF対策: 任意URLの中継を禁止。Supabase プロジェクトのホスト かつ
 *   バッジバケットの public オブジェクトパスのみ許可する。
 */

// 許可するホスト（NEXT_PUBLIC_SUPABASE_URL のホスト）
function allowedHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  if (!raw) return null
  try {
    return new URL(raw).host
  } catch {
    return null
  }
}

// 同一 Supabase プロジェクトの public 配下・許可バケットのみ中継する（SSRFガード）。
// badge-images: バッジ画像 + 団体ロゴ(org-logos/) / avatars: プロ本人の顔写真
const ALLOWED_PATH_PREFIXES = [
  '/storage/v1/object/public/badge-images/',
  '/storage/v1/object/public/avatars/',
]

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const target = searchParams.get('url')
    if (!target) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 })
    }

    let parsed: URL
    try {
      parsed = new URL(target)
    } catch {
      return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
    }

    // SSRF検証: https のみ / Supabase ホスト / 許可バケットの public パスのみ
    const host = allowedHost()
    if (
      parsed.protocol !== 'https:' ||
      !host ||
      parsed.host !== host ||
      !ALLOWED_PATH_PREFIXES.some(p => parsed.pathname.startsWith(p))
    ) {
      return NextResponse.json({ error: 'Forbidden url' }, { status: 403 })
    }

    const upstream = await fetch(parsed.toString(), { cache: 'no-store' })
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Upstream fetch failed' }, { status: 502 })
    }

    const buf = await upstream.arrayBuffer()
    const contentType = upstream.headers.get('content-type') || 'image/png'

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // 同一オリジンで返すだけなので CORS ヘッダは不要。ブラウザ側で数分キャッシュ可。
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (error: any) {
    console.error('[badge-proxy] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
