import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/bug-report/upload
 * 不具合報告用スクリーンショットのアップロード（認証不要）
 *
 * FormData: file (image)
 * Returns: { publicUrl: string }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    // 5MB制限
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
    }

    // 画像のみ許可
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files allowed' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const ts = Date.now()
    const ext = file.name.split('.').pop() || 'png'
    const path = `report_${ts}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage
      .from('bug-report-images')
      .upload(path, buffer, {
        contentType: file.type,
        cacheControl: '3600',
      })

    if (error) {
      console.error('[bug-report/upload] storage error:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const { data: urlData } = supabase.storage.from('bug-report-images').getPublicUrl(path)

    return NextResponse.json({ publicUrl: urlData.publicUrl })
  } catch (err: any) {
    console.error('[bug-report/upload] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
