import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { auth } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

/**
 * Storage proxy for client components.
 * Handles file uploads to Supabase Storage.
 *
 * POST /api/storage
 * FormData with: bucket, path, file
 *
 * 認可: service-role で書くため、bucket/path は呼び出し元の所有物に限定する。
 * - avatars / gallery-images: path 先頭セグメント = 自分の Clerk userId
 * - badge-images: `org-logos/{orgId}/...` or `{orgId}/...` で、その org の owner_id = 自分
 * 上記以外の bucket・他人スコープの path は 403。
 *
 * ファイル種別: 拡張子・クライアント申告のContent-Typeだけは信用せず、ファイル先頭の
 * マジックバイトから実体を判定し、bucket毎に許可された画像形式のみ通す（拡張子偽装対策）。
 * upload時にSupabaseへ渡す contentType も、判定済みの実体形式から生成した値を使う
 * （クライアント申告の file.type をそのまま信用しない）。
 * 許可形式は現行の全呼び出し元(setup/dashboard/MediaSection=jpeg、バッジ・団体ロゴ=png)を
 * grepで確認した実績に合わせている。
 */
type ImageFormat = 'jpeg' | 'png' | 'webp'

const FORMAT_MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}
const FORMAT_EXTENSIONS: Record<ImageFormat, string[]> = {
  jpeg: ['jpg', 'jpeg'],
  png: ['png'],
  webp: ['webp'],
}

const BUCKET_RULES: Record<string, { scope: 'user' | 'org'; allowedFormats: ImageFormat[] }> = {
  avatars: { scope: 'user', allowedFormats: ['jpeg'] },
  'gallery-images': { scope: 'user', allowedFormats: ['jpeg'] },
  'badge-images': { scope: 'org', allowedFormats: ['png'] },
}

const MAX_FILE_BYTES = 10 * 1024 * 1024

function isSafePath(path: string): boolean {
  if (path.length > 512) return false
  if (path.includes('\0')) return false
  const segments = path.split('/')
  return segments.length >= 2 && segments.every(s => s.length > 0 && s !== '.' && s !== '..' && !s.includes('\\'))
}

function getExtension(path: string): string | null {
  const last = path.split('/').pop() || ''
  const dotIndex = last.lastIndexOf('.')
  if (dotIndex <= 0) return null
  return last.slice(dotIndex + 1).toLowerCase()
}

/** ファイル先頭バイトから実際の画像形式を判定する（拡張子・Content-Type申告は信用しない）。 */
function detectImageFormat(buffer: Buffer): ImageFormat | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg'
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png'
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  try {
    const formData = await req.formData()
    const bucket = formData.get('bucket') as string
    const path = formData.get('path') as string
    const file = formData.get('file') as File
    const upsert = formData.get('upsert') === 'true'

    if (!bucket || !path || !file) {
      return NextResponse.json({ error: 'Missing bucket, path, or file' }, { status: 400 })
    }

    if (!isSafePath(path)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    }

    const rule = BUCKET_RULES[bucket]
    if (!rule) {
      return NextResponse.json({ error: 'Bucket not allowed' }, { status: 403 })
    }

    if (rule.scope === 'user') {
      if (path.split('/')[0] !== userId) {
        return NextResponse.json({ error: 'Forbidden path' }, { status: 403 })
      }
    } else {
      const segments = path.split('/')
      const orgId = segments[0] === 'org-logos' ? segments[1] : segments[0]
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', orgId)
        .eq('owner_id', userId)
        .maybeSingle()
      if (!org) {
        return NextResponse.json({ error: 'Forbidden path' }, { status: 403 })
      }
    }

    // 拡張子チェック(申告ベース。最終判定はマジックバイト)
    const ext = getExtension(path)
    const allowedExtensions = rule.allowedFormats.flatMap(f => FORMAT_EXTENSIONS[f])
    if (!ext || !allowedExtensions.includes(ext)) {
      return NextResponse.json({ error: 'Unsupported file extension' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // マジックバイトで実体の画像形式を確認(拡張子・Content-Type申告のなりすまし対策)
    const detectedFormat = detectImageFormat(buffer)
    if (!detectedFormat || !rule.allowedFormats.includes(detectedFormat)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: FORMAT_MIME[detectedFormat],
        cacheControl: '3600',
        upsert,
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)

    return NextResponse.json({ publicUrl: urlData.publicUrl })
  } catch (err: any) {
    console.error('[storage-proxy] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
