/**
 * ダッシュボード「公開中の顔写真」管理エンドポイント
 *
 * Voices タブ (/api/dashboard/voices) はコメント必須のため、コメント無しの写真票が
 * 表示されない。本エンドポイントは公開カードの SupportersStrip と同じ母集団
 * (display_mode IN ('photo','pro_link')) を、コメントの有無に関係なく一覧で返し、
 * プロが公開状態を管理できるようにする。
 *
 * 2 種類の顔写真:
 *   - type='client' : クライアント顔写真。display_mode='photo' + votes.client_photo_url
 *   - type='pro'    : プロからの認定 (pro_link)。voter_professional_id 経由で
 *                     professionals.photo_url / name を表示。投票者プロのカードへリンク。
 *
 * 取得条件 (公開カード card-data.ts の supporters と一致):
 *   - professional_id = ログイン中のプロ (deactivated 除外)
 *   - status = 'confirmed'
 *   - display_mode IN ('photo','pro_link')
 *   - 表示可能な写真URLが引けるものだけ返す
 *       photo    : votes.client_photo_url IS NOT NULL
 *       pro_link : 投票者プロ (deactivated 除外) の photo_url IS NOT NULL
 *
 * レスポンスには個人情報 (normalized_email / voter_email / voter_phone /
 * auth_provider_id / userId 等) を絶対に含めない。返すのは表示用の名前・写真URL・
 * 投票日時・(pro のみ) 投票者プロのカードリンクのみ。
 *
 * 写真削除 (公開取消) は既存の /api/dashboard/voices/[voteId]/remove-photo を流用する
 * (votes 行を client_photo_url=null + display_mode='hidden' に更新)。pro_link の場合、
 * 投票者プロ本体の photo_url は無傷で、supporters クエリの display_mode フィルタから
 * 外れることでカードから消える。
 */
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

interface PhotoVoteRow {
  id: string
  display_mode: string | null
  client_photo_url: string | null
  auth_display_name: string | null
  voter_professional_id: string | null
  created_at: string
}

interface VoterPro {
  id: string
  name: string
  photo_url: string | null
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

    // ② 顔写真公開に同意した票 (photo + pro_link、status=confirmed)
    const { data: rowsRaw, error: rowsErr } = await supabase
      .from('votes')
      .select('id, display_mode, client_photo_url, auth_display_name, voter_professional_id, created_at')
      .eq('professional_id', pro.id)
      .eq('status', 'confirmed')
      .in('display_mode', ['photo', 'pro_link'])
      .order('created_at', { ascending: false })
    if (rowsErr) throw rowsErr

    const rows = (rowsRaw || []) as PhotoVoteRow[]

    // ③ pro_link の投票者プロを一括取得 (deactivated 除外)
    const voterProIds = Array.from(new Set(
      rows
        .filter(r => r.display_mode === 'pro_link')
        .map(r => r.voter_professional_id)
        .filter((id): id is string => !!id)
    ))
    const voterProMap = new Map<string, VoterPro>()
    if (voterProIds.length > 0) {
      const { data: vpData, error: vpErr } = await supabase
        .from('professionals')
        .select('id, name, photo_url')
        .in('id', voterProIds)
        .is('deactivated_at', null)
      if (vpErr) throw vpErr
      for (const p of (vpData || []) as VoterPro[]) {
        voterProMap.set(p.id, p)
      }
    }

    // ④ 表示可能な写真URLが引けるものだけ整形 (card-data.ts の supporters と同じ分岐)
    interface PhotoItem {
      id: string
      type: 'client' | 'pro'
      name: string
      photo_url: string
      created_at: string
      proCardHref: string | null
    }
    const photos: PhotoItem[] = []
    for (const r of rows) {
      if (r.display_mode === 'photo') {
        if (!r.client_photo_url) continue
        photos.push({
          id: r.id,
          type: 'client',
          name: r.auth_display_name?.trim() || 'クライアント',
          photo_url: r.client_photo_url,
          created_at: r.created_at,
          proCardHref: null,
        })
      } else if (r.display_mode === 'pro_link') {
        if (!r.voter_professional_id) continue
        const voterPro = voterProMap.get(r.voter_professional_id)
        if (!voterPro?.photo_url) continue
        photos.push({
          id: r.id,
          type: 'pro',
          name: voterPro.name,
          photo_url: voterPro.photo_url,
          created_at: r.created_at,
          proCardHref: `/card/${voterPro.id}`,
        })
      }
    }

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
