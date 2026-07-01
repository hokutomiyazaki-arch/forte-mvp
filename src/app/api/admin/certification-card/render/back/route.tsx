/**
 * 認定カード — 裏(back) PNG レンダリング
 *
 * GET /api/admin/certification-card/render/back?d={base64(JSON:CardRenderInput)}
 * → 2035×1300 RGB PNG（透過なし）
 *
 * QR（qrcode パッケージ）と項目別メダルはこのルート内で解決して埋め込む。
 */
import { ImageResponse } from 'next/og'
import {
  buildBackElement,
  buildQrDataUri,
  type CardRenderInput,
  type CardAssets,
} from '@/lib/certification-card-render'
import { MEDAL_PATHS, type CertifiableTier } from '@/lib/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 既存OGルートと同じ import.meta.url 相対パターン（ルートファイル基準・7階層上）
function loadFontData(): Promise<ArrayBuffer> {
  return fetch(
    new URL('../../../../../../../public/fonts/NotoSansJP-subset.ttf', import.meta.url)
  ).then((r) => r.arrayBuffer())
}

function isAdmin(request: Request): boolean {
  const cookie = request.headers.get('cookie') || ''
  return /(?:^|;\s*)rp_admin_auth=authenticated(?:;|$)/.test(cookie)
}

function decodePayload(d: string): CardRenderInput {
  const json = Buffer.from(d, 'base64').toString('utf-8')
  return JSON.parse(json) as CardRenderInput
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64')
}

async function fetchMedalDataUri(origin: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}${path}`, { cache: 'no-store' })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return `data:image/png;base64,${arrayBufferToBase64(buf)}`
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(request.url)
  const d = url.searchParams.get('d')
  if (!d) return new Response('missing payload', { status: 400 })

  let input: CardRenderInput
  try {
    input = decodePayload(d)
  } catch {
    return new Response('invalid payload', { status: 400 })
  }

  const origin = url.origin

  // 表示中の項目に必要なティアのメダルだけ取得
  const neededTiers = new Set<CertifiableTier>()
  for (const it of input.items) {
    if (it.tier === 'SPECIALIST' || it.tier === 'MASTER' || it.tier === 'LEGEND') {
      neededTiers.add(it.tier)
    }
  }

  const [fontData, qrDataUri, backgroundDataUri, medalEntries] = await Promise.all([
    loadFontData(),
    buildQrDataUri(input.cardUid),
    fetchMedalDataUri(origin, '/card-assets/back-bg.png'),
    Promise.all(
      Array.from(neededTiers).map(async (tier) => {
        const uri = await fetchMedalDataUri(origin, MEDAL_PATHS[tier].og)
        return [tier, uri] as const
      })
    ),
  ])

  const medalDataUris: Partial<Record<CertifiableTier, string | null>> = {}
  for (const [tier, uri] of medalEntries) medalDataUris[tier] = uri

  const assets: CardAssets = { fontData, qrDataUri, medalDataUris, backgroundDataUri }
  const { element, options } = buildBackElement(input, assets)
  return new ImageResponse(element, options)
}
