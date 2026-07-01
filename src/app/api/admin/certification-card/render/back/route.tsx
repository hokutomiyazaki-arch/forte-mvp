/**
 * 認定カード — 裏(back) PNG レンダリング
 *
 * GET /api/admin/certification-card/render/back?d={base64(JSON:CardRenderInput)}
 * → 2035×1300 RGB PNG（透過なし）。QR＋項目別メダルを埋め込む。
 *
 * ローカル素材（フォント/背景/メダル）は fs.readFile（絶対パス）で読む。
 */
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  buildBackElement,
  buildQrDataUri,
  type CardRenderInput,
  type CardAssets,
} from '@/lib/certification-card-render'
import { MEDAL_PATHS, type CertifiableTier } from '@/lib/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

function decodePayload(d: string): CardRenderInput {
  return JSON.parse(Buffer.from(d, 'base64').toString('utf-8')) as CardRenderInput
}

export async function GET(request: Request) {
  if (!isAdmin(request)) return new Response('Unauthorized', { status: 401 })

  const url = new URL(request.url)
  const d = url.searchParams.get('d')
  if (!d) return new Response('missing payload', { status: 400 })

  let input: CardRenderInput
  try {
    input = decodePayload(d)
  } catch {
    return new Response('invalid payload', { status: 400 })
  }

  try {
    // 表示中の項目に必要なティアのメダルだけ読む
    const neededTiers = new Set<CertifiableTier>()
    for (const it of input.items) {
      if (it.tier === 'SPECIALIST' || it.tier === 'MASTER' || it.tier === 'LEGEND') neededTiers.add(it.tier)
    }

    const [fontData, qrDataUri, backgroundDataUri, medalEntries] = await Promise.all([
      readPubArrayBuffer('fonts/NotoSansJP-subset.ttf'),
      buildQrDataUri(input.cardUid),
      readPubDataUri('card-assets/back-bg.png'),
      Promise.all(
        Array.from(neededTiers).map(async (tier) => {
          const uri = await readPubDataUri(MEDAL_PATHS[tier].og)
          return [tier, uri] as const
        })
      ),
    ])

    const medalDataUris: Partial<Record<CertifiableTier, string | null>> = {}
    for (const [tier, uri] of medalEntries) medalDataUris[tier] = uri

    const assets: CardAssets = { fontData, qrDataUri, medalDataUris, backgroundDataUri }
    const { element, options } = buildBackElement(input, assets)
    return new ImageResponse(element, options)
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err)
    console.error('[render/back] error:', msg)
    return new Response(`RENDER_ERROR(back): ${msg}`, { status: 500 })
  }
}
