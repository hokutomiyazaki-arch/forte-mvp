/**
 * 認定賞状 — PNG / PDF レンダリング（1カテゴリ=1枚）
 *
 * GET /api/admin/certification-card/render/certificate?d={base64(JSON:CertificateRenderInput)}
 *   → 2000×1414 PNG。背景はティア別 cert-bg-{tier}.png。
 * GET ...&format=pdf
 *   → 上記PNGを A4横(297×210mm) PDF にフルページ貼り込み（RGBのまま・家庭用プリンタ向け）。
 */
import { ImageResponse } from 'next/og'
import { PDFDocument } from 'pdf-lib'
import {
  buildCertificateElement,
  certBgPath,
  type CertificateRenderInput,
} from '@/lib/certificate-render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A4横（297×210mm）をポイント換算（1mm = 2.834645669pt）。賞状PNGは√2比なので歪みなくフルページ配置。
const MM_TO_PT = 2.834645669
const A4_LANDSCAPE_W = 297 * MM_TO_PT // ≈ 841.89
const A4_LANDSCAPE_H = 210 * MM_TO_PT // ≈ 595.28

// PNG(RGB) を A4横 PDF にフルページ貼り込み（RGBのまま・塗り足し/トンボなし）
async function pngToA4Pdf(pngBytes: ArrayBuffer): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([A4_LANDSCAPE_W, A4_LANDSCAPE_H])
  const img = await pdf.embedPng(pngBytes)
  page.drawImage(img, { x: 0, y: 0, width: A4_LANDSCAPE_W, height: A4_LANDSCAPE_H })
  return pdf.save()
}

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
  const png = new ImageResponse(element, options)

  if (url.searchParams.get('format') === 'pdf') {
    const pngBytes = await png.arrayBuffer()
    const pdfBytes = await pngToA4Pdf(pngBytes)
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-store',
      },
    })
  }

  return png
}
