/**
 * ダッシュボード Voices タブ専用エンドポイント
 *
 * 公開ページ (/card/[id]) と異なり、プロ自身がダッシュボードで見るための表示。
 * display_mode の同意は無視し、auth_method を元にクライアントを「対面の相手」として
 * リッチに表示できる情報だけを返す:
 *   - google / line     → 写真 + 名前 + プロバイダラベル (rich)
 *   - email / email_code → アイコン + 「メール認証」 (auth_only)
 *   - sms                → アイコン + 「SMS認証」    (auth_only)
 *   - hopeful (legacy)   → 配列から除外
 *
 * 個人情報 (normalized_email / voter_email / auth_provider_id 等) はレスポンスに含めない。
 */

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface VoteRow {
  id: string
  comment: string
  created_at: string
  auth_method: string | null
  auth_display_name: string | null
  client_photo_url: string | null
}

type ClientDisplay =
  | {
      type: 'rich'
      name: string
      photoUrl: string | null
      providerLabel: string
    }
  | {
      type: 'auth_only'
      label: string
      icon: 'email' | 'sms' | 'default'
    }

function buildClientDisplay(vote: VoteRow): ClientDisplay {
  if (vote.auth_method === 'google' || vote.auth_method === 'line') {
    return {
      type: 'rich',
      name: vote.auth_display_name?.trim() || 'クライアント',
      photoUrl: vote.client_photo_url,
      providerLabel: vote.auth_method === 'google' ? 'Google認証' : 'LINE認証',
    }
  }
  if (vote.auth_method === 'email' || vote.auth_method === 'email_code') {
    return { type: 'auth_only', label: 'メール認証', icon: 'email' }
  }
  if (vote.auth_method === 'sms') {
    return { type: 'auth_only', label: 'SMS認証', icon: 'sms' }
  }
  // 想定外フォールバック (hopeful は呼び出し側で除外済み)
  return { type: 'auth_only', label: 'クライアント', icon: 'default' }
}

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
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
      return NextResponse.json({ error: 'pro not found' }, { status: 404 })
    }

    // ② コメント付き投票 (hopeful 除外、status=confirmed のみ)
    const { data: votesRaw, error: votesErr } = await supabase
      .from('votes')
      .select('id, comment, created_at, auth_method, auth_display_name, client_photo_url')
      .eq('professional_id', pro.id)
      .eq('status', 'confirmed')
      .not('comment', 'is', null)
      .neq('comment', '')
      .neq('auth_method', 'hopeful')
      .order('created_at', { ascending: false })
    if (votesErr) throw votesErr

    const votes = (votesRaw || []) as VoteRow[]
    const voteIds = votes.map(v => v.id)

    // ③ 返信を一括取得 (is_deleted=false のみ)
    interface VoiceReply {
      id: string
      reply_text: string
      created_at: string
      updated_at: string
      delivered_at: string | null
      delivered_via: 'line' | 'email' | null
    }
    const replyMap = new Map<string, VoiceReply>()
    if (voteIds.length > 0) {
      const { data: replies } = await supabase
        .from('vote_replies')
        .select('id, vote_id, reply_text, created_at, updated_at, delivered_at, delivered_via')
        .in('vote_id', voteIds)
        .eq('is_deleted', false)
      for (const r of (replies || []) as Array<VoiceReply & { vote_id: string }>) {
        replyMap.set(r.vote_id, {
          id: r.id,
          reply_text: r.reply_text,
          created_at: r.created_at,
          updated_at: r.updated_at,
          delivered_at: r.delivered_at,
          delivered_via: r.delivered_via,
        })
      }
    }

    // ④ ダッシュボード向けに整形
    const voices = votes.map(v => ({
      id: v.id,
      comment: v.comment,
      created_at: v.created_at,
      reply: replyMap.get(v.id) ?? null,
      client: buildClientDisplay(v),
    }))

    return NextResponse.json(
      { voices, professionalName: pro.name },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  } catch (err) {
    console.error('[api/dashboard/voices] error:', err)
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
