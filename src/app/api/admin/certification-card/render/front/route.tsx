/**
 * 認定カード — 表(front) PNG レンダリング
 *
 * GET /api/admin/certification-card/render/front?d={base64(JSON:CardRenderInput)}
 * → 2035×1300 RGB PNG（透過なし）
 *
 * ローカル素材（フォント/背景）は fs.readFile（絶対パス）で読む。
 * ※ fetch(new URL(..., import.meta.url)) は nodejs runtime だと file:// 化して
 *    本番(undici)で弾かれ 500 になるため使わない。public 素材は next.config の
 *    outputFileTracingIncludes で lambda に同梱している。
 */
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildFrontElement, type CardRenderInput } from '@/lib/certification-card-render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const pubPath = (rel: string) => path.join(process.cwd(), 'public', rel)

async function readPubArrayBuffer(rel: string): Promise<ArrayBuffer> {
  const b = await readFile(pubPath(rel))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}
async function readPubDataUri(rel: string): Promise<string> {
  const b = await readFile(pubPath(rel))
  return `data:image/png;base64,${b.toString('base64')}`
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
    const [fontData, backgroundDataUri] = await Promise.all([
      readPubArrayBuffer('fonts/NotoSansJP-subset.ttf'),
      readPubDataUri('card-assets/front-bg.png').catch(() => null),
    ])
    const { element, options } = buildFrontElement(input, { fontData, backgroundDataUri })
    return new ImageResponse(element, options)
  } catch (err) {
    // 診断用（原因確認後に外す）。admin限定ルートなのでスタック開示可。
    const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err)
    console.error('[render/front] error:', msg)
    return new Response(`RENDER_ERROR(front): ${msg}`, { status: 500 })
  }
}
