/**
 * 認定賞状 — PNG レンダリング（1カテゴリ=1枚）
 *
 * GET /api/admin/certification-card/render/certificate?d={base64(JSON:CertificateRenderInput)}
 * → 2000×1414 PNG。背景はティア別 cert-bg-{tier}.png。
 */
import { ImageResponse } from 'next/og'
import {
  buildCertificateElement,
  certBgPath,
  type CertificateRenderInput,
} from '@/lib/certificate-render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 既存OGルートと同じ import.meta.url 相対パターン（ルートファイル基準・7階層上）
function loadFontData(): Promise<ArrayBuffer> {
  return fetch(
    new URL('../../../../../../../public/fonts/NotoSansJP-subset.ttf', import.meta.url)
  ).then((r) => r.arrayBuffer())
}

// 氏名(ローマ字)用 Playfair Display（Latinサブセット）
function loadNameFontData(): Promise<ArrayBuffer> {
  return fetch(
    new URL('../../../../../../../public/fonts/PlayfairDisplay-subset.ttf', import.meta.url)
  ).then((r) => r.arrayBuffer())
}

function isAdmin(request: Request): boolean {
  const cookie = request.headers.get('cookie') || ''
  return /(?:^|;\s*)rp_admin_auth=authenticated(?:;|$)/.test(cookie)
}

function decodePayload(d: string): CertificateRenderInput {
  return JSON.parse(Buffer.from(d, 'base64').toString('utf-8')) as CertificateRenderInput
}

async function fetchDataUri(origin: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}${path}`, { cache: 'no-store' })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  if (!isAdmin(request)) return new Response('Unauthorized', { status: 401 })

  const url = new URL(request.url)
  const d = url.searchParams.get('d')
  if (!d) return new Response('missing payload', { status: 400 })

  let input: CertificateRenderInput
  try {
    input = decodePayload(d)
  } catch {
    return new Response('invalid payload', { status: 400 })
  }

  const [fontData, nameFontData, backgroundDataUri] = await Promise.all([
    loadFontData(),
    loadNameFontData(),
    fetchDataUri(url.origin, certBgPath(input.tier)),
  ])

  const { element, options } = buildCertificateElement(input, { fontData, nameFontData, backgroundDataUri })
  return new ImageResponse(element, options)
}
