/**
 * 認定カード — 表(front) PNG レンダリング
 *
 * GET /api/admin/certification-card/render/front?d={base64(JSON:CardRenderInput)}
 * → 2035×1300 RGB PNG（透過なし）
 *
 * d ペイロードは管理UIの編集後の最終表示値。DBは引かず自己完結（プレビュー=生成が一致）。
 */
import { ImageResponse } from 'next/og'
import {
  buildFrontElement,
  type CardRenderInput,
} from '@/lib/certification-card-render'

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

  const fontData = await loadFontData()
  const { element, options } = buildFrontElement(input, { fontData })
  return new ImageResponse(element, options)
}
