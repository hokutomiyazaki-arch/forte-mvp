import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('photo') as File | null
    const voteId = formData.get('voteId') as string | null

    if (!file || !voteId) {
      return NextResponse.json(
        { error: 'photo and voteId are required' },
        { status: 400 }
      )
    }

    // ファイルサイズチェック
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Max 5MB.' },
        { status: 400 }
      )
    }

    // MIMEタイプチェック
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: jpeg, png, webp' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    // ユニークなファイル名生成
    const mimeSub = file.type.split('/')[1]
    const ext = mimeSub === 'jpeg' ? 'jpg' : mimeSub
    const fileName = `${voteId}-${Date.now()}.${ext}`
    const filePath = `photos/${fileName}`

    // Supabase Storage にアップロード
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('client-photos')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('[upload-client-photo] Storage upload error:', uploadError)
      return NextResponse.json(
        { error: 'Upload failed' },
        { status: 500 }
      )
    }

    // 公開URLを取得
    const { data: urlData } = supabase.storage
      .from('client-photos')
      .getPublicUrl(filePath)

    const publicUrl = urlData.publicUrl

    // votes テーブルの client_photo_url を更新
    const { error: updateError } = await supabase
      .from('votes')
      .update({ client_photo_url: publicUrl })
      .eq('id', voteId)

    if (updateError) {
      console.error('[upload-client-photo] Vote update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update vote record' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('[upload-client-photo] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
