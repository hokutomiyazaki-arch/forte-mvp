/**
 * 認定賞状 — PNG / PDF レンダリング（1カテゴリ=1枚）
 *
 * GET /api/admin/certification-card/render/certificate?d={base64(JSON:CertificateRenderInput)}
 *   → 2000×1414 PNG。背景はティア別 cert-bg-{tier}.png。
 * GET ...&format=pdf
 *   → 上記PNGを A4横(297×210mm) PDF にフルページ貼り込み（RGB・家庭用プリンタ向け）。
 *
 * ローカル素材（フォント/背景）は fs.readFile（絶対パス）で読む。
 */
import { ImageResponse } from 'next/og'
import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  buildCertificateElement,
  certBgPath,
  type CertificateRenderInput,
} from '@/lib/certificate-render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MM_TO_PT = 2.834645669
const A4_LANDSCAPE_W = 297 * MM_TO_PT // ≈ 841.89
const A4_LANDSCAPE_H = 210 * MM_TO_PT // ≈ 595.28

const pubPath = (rel: string) => path.join(process.cwd(), 'public', rel.replace(/^\//, ''))

async function readPubArrayBuffer(rel: string): Promise<ArrayBuffer> {
  const b = await readFile(pubPath(rel))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}
async function readPubDataUri(rel: string): Promise<string | null> {
  try {
    const b = await readFile(pubPath(rel))
    return `data:image/png;base64,${b.toString('base64')}`
  } catch {
    return null
  }
}

function isAdmin(request: Request): boolean {
  const cookie = request.headers.get('cookie') || ''
  return /(?:^|;\s*)rp_admin_auth=authenticated(?:;|$)/.test(cookie)
}

function decodePayload(d: string): CertificateRenderInput {
  return JSON.parse(Buffer.from(d, 'base64').toString('utf-8')) as CertificateRenderInput
}

// PNG(RGB) を A4横 PDF にフルページ貼り込み
async function pngToA4Pdf(pngBytes: ArrayBuffer): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([A4_LANDSCAPE_W, A4_LANDSCAPE_H])
  const img = await pdf.embedPng(pngBytes)
  page.drawImage(img, { x: 0, y: 0, width: A4_LANDSCAPE_W, height: A4_LANDSCAPE_H })
  return pdf.save()
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

  try {
    const [fontData, nameFontData, backgroundDataUri] = await Promise.all([
      readPubArrayBuffer('fonts/NotoSansJP-subset.ttf'),
      readPubArrayBuffer('fonts/PlayfairDisplay-subset.ttf'),
      readPubDataUri(certBgPath(input.tier)),
    ])

    const { element, options } = buildCertificateElement(input, { fontData, nameFontData, backgroundDataUri })
    const png = new ImageResponse(element, options)

    if (url.searchParams.get('format') === 'pdf') {
      const pngBytes = await png.arrayBuffer()
      const pdfBytes = await pngToA4Pdf(pngBytes)
      return new Response(Buffer.from(pdfBytes), {
        headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' },
      })
    }

    return png
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err)
    console.error('[render/certificate] error:', msg)
    return new Response(`RENDER_ERROR(certificate): ${msg}`, { status: 500 })
  }
}
