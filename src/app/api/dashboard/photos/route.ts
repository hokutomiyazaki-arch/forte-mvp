/**
 * ダッシュボード「公開中の顔写真」管理エンドポイント
 *
 * Voices タブ (/api/dashboard/voices) はコメント必須のため、コメント無しの写真票が
 * 表示されない。本エンドポイントは display_mode='photo' で同意された顔写真を、
 * コメントの有無に関係なく一覧で返し、プロが公開状態を管理できるようにする。
 *
 * 取得条件:
 *   - professional_id = ログイン中のプロ (deactivated 除外)
 *   - status = 'confirmed'
 *   - display_mode = 'photo'           (顔写真公開に同意した票のみ)
 *   - client_photo_url IS NOT NULL     (削除済み/未取得は除外)
 *
 * レスポンスには個人情報 (normalized_email / voter_email / voter_phone /
 * auth_provider_id 等) を絶対に含めない。返すのは表示用の名前と写真 URL と投票日時のみ。
 *
 * 写真削除は既存の /api/dashboard/voices/[voteId]/remove-photo を流用する
 * (client_photo_url=null + display_mode='hidden')。
 */
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

interface PhotoRow {
  id: string
  client_photo_url: string | null
  auth_display_name: string | null
  created_at: string
}

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'unauthorized' },
        { status: 401, headers: NO_STORE_HEADERS }
      )
    }

    const supabase = getSupabaseAdmin()

    // ① ログイン中のプロを特定 (deactivated は除外)
    const { data: pro, error: proErr } = await supabase
      .from('professionals')
      .select('id, name')
      .eq('user_id', userId)
      .is('deactivated_at', null)
      .maybeSingle()
    if (proErr) throw proErr
    if (!pro) {
      return NextResponse.json(
        { error: 'pro not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      )
    }

    // ② 顔写真公開に同意した票 (display_mode='photo' + 写真URLあり、status=confirmed)
    const { data: rowsRaw, error: rowsErr } = await supabase
      .from('votes')
      .select('id, client_photo_url, auth_display_name, created_at')
      .eq('professional_id', pro.id)
      .eq('status', 'confirmed')
      .eq('display_mode', 'photo')
      .not('client_photo_url', 'is', null)
      .order('created_at', { ascending: false })
    if (rowsErr) throw rowsErr

    const rows = (rowsRaw || []) as PhotoRow[]

    const photos = rows.map(r => ({
      id: r.id,
      client_photo_url: r.client_photo_url,
      name: r.auth_display_name?.trim() || 'クライアント',
      created_at: r.created_at,
    }))

    return NextResponse.json(
      { photos, professionalName: pro.name },
      { headers: NO_STORE_HEADERS }
    )
  } catch (err) {
    console.error('[api/dashboard/photos] error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json(
      { error: message },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
