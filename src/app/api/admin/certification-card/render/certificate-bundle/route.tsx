/**
 * 認定賞状 — 複数カテゴリを1つの連続PDFにまとめて出力
 *
 * POST /api/admin/certification-card/render/certificate-bundle
 *   body: { certs: CertificateRenderInput[] }
 *   → 各賞状PNGを A4横(297×210mm) の1ページずつに貼り、全ページを1つのPDFで返す。
 *
 * 1枚ずつの単票PDFは既存の render/certificate?format=pdf を使う。こちらは一括DL専用。
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

export async function POST(request: Request) {
  if (!isAdmin(request)) return new Response('Unauthorized', { status: 401 })

  let certs: CertificateRenderInput[]
  try {
    const body = await request.json()
    certs = Array.isArray(body?.certs) ? (body.certs as CertificateRenderInput[]) : []
  } catch {
    return new Response('invalid body', { status: 400 })
  }
  if (certs.length === 0) return new Response('no certs', { status: 400 })

  try {
    const [fontData, nameFontData] = await Promise.all([
      readPubArrayBuffer('fonts/NotoSansJP-subset.ttf'),
      readPubArrayBuffer('fonts/PlayfairDisplay-subset.ttf'),
    ])

    // ティア別背景はキャッシュして重複読み込みを避ける
    const bgCache = new Map<string, string | null>()
    const pdf = await PDFDocument.create()

    for (const input of certs) {
      if (!bgCache.has(input.tier)) {
        bgCache.set(input.tier, await readPubDataUri(certBgPath(input.tier)))
      }
      const backgroundDataUri = bgCache.get(input.tier) ?? null
      const { element, options } = buildCertificateElement(input, { fontData, nameFontData, backgroundDataUri })
      const pngBytes = await new ImageResponse(element, options).arrayBuffer()
      const page = pdf.addPage([A4_LANDSCAPE_W, A4_LANDSCAPE_H])
      const img = await pdf.embedPng(pngBytes)
      page.drawImage(img, { x: 0, y: 0, width: A4_LANDSCAPE_W, height: A4_LANDSCAPE_H })
    }

    const pdfBytes = await pdf.save()
    return new Response(Buffer.from(pdfBytes), {
      headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err)
    console.error('[render/certificate-bundle] error:', msg)
    return new Response(`RENDER_ERROR(certificate-bundle): ${msg}`, { status: 500 })
  }
}
