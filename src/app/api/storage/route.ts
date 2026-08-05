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
 */
const USER_SCOPED_BUCKETS = ['avatars', 'gallery-images']
const ORG_SCOPED_BUCKETS = ['badge-images']
const MAX_FILE_BYTES = 10 * 1024 * 1024

function isSafePath(path: string): boolean {
  if (path.length > 512) return false
  const segments = path.split('/')
  return segments.length >= 2 && segments.every(s => s.length > 0 && s !== '.' && s !== '..')
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

    if (USER_SCOPED_BUCKETS.includes(bucket)) {
      if (path.split('/')[0] !== userId) {
        return NextResponse.json({ error: 'Forbidden path' }, { status: 403 })
      }
    } else if (ORG_SCOPED_BUCKETS.includes(bucket)) {
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
    } else {
      return NextResponse.json({ error: 'Bucket not allowed' }, { status: 403 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: file.type,
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
