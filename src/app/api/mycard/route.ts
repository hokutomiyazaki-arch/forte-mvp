import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mycard
 * 1リクエストでマイカードに必要な全データをまとめて返す。
 * サーバー側でPromise.allを使い並列実行。
 */
export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    // Clerk からユーザー情報を取得（emailが必要）
    // auth() では email が取れないので、Clerk API からフェッチ
    const clerkRes = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
    })
    const clerkUser = await clerkRes.json()
    const email = clerkUser?.email_addresses?.[0]?.email_address || ''

    const isLine = email.startsWith('line_') && email.endsWith('@line.realproof.jp')
    const lineUserId = isLine ? email.replace('line_', '').replace('@line.realproof.jp', '') : null

    // ────────────────────────────────────────
    // Phase 1: 全ての独立クエリを並列実行
    // ────────────────────────────────────────
    const [
      proCheck,
      clientData,
      bookmarksData,
      // リワード: 3つの方法を並列で試行
      crByEmail,
      crLineVotes,
      crUserVotes,
      // 投票履歴: 3つの方法を並列で試行
      votesByEmail,
      votesByLine,
      votesByUserId,
    ] = await Promise.all([
      // プロ確認
      supabase.from('professionals').select('id').eq('user_id', userId).maybeSingle(),
      // ニックネーム
      supabase.from('clients').select('nickname').eq('user_id', userId).maybeSingle(),
      // ブックマーク
      supabase.from('bookmarks')
        .select('id, created_at, professional_id, professionals(id, name, title, photo_url, prefecture, area_description)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),

      // === リワード検索: 3方法を並列 ===
      // 方法1: client_email
      supabase.from('client_rewards')
        .select('id, reward_id, professional_id, status')
        .eq('client_email', email)
        .in('status', ['active', 'used'])
        .order('created_at', { ascending: false }),
      // 方法2: LINE auth votes
      lineUserId
        ? supabase.from('votes').select('id').eq('auth_provider_id', lineUserId).eq('auth_method', 'line')
        : Promise.resolve({ data: null, error: null }),
      // 方法3: client_user_id votes
      supabase.from('votes')
        .select('id, selected_reward_id')
        .eq('client_user_id', userId)
        .not('selected_reward_id', 'is', null),

      // === 投票履歴検索: 3方法を並列 ===
      // 方法1: voter_email
      supabase.from('votes')
        .select('id, professional_id, result_category, created_at')
        .eq('voter_email', email)
        .order('created_at', { ascending: false }),
      // 方法2: LINE auth
      lineUserId
        ? supabase.from('votes')
            .select('id, professional_id, result_category, created_at')
            .eq('auth_provider_id', lineUserId)
            .eq('auth_method', 'line')
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: null, error: null }),
      // 方法3: client_user_id
      supabase.from('votes')
        .select('id, professional_id, result_category, created_at')
        .eq('client_user_id', userId)
        .order('created_at', { ascending: false }),
    ])

    // ────────────────────────────────────────
    // リワード: 最初にヒットした方法を採用
    // ────────────────────────────────────────
    let allClientRewards: any[] = crByEmail.data && crByEmail.data.length > 0
      ? crByEmail.data
      : []

    // 方法2: LINE votes → client_rewards
    if (allClientRewards.length === 0 && crLineVotes.data && crLineVotes.data.length > 0) {
      const voteIds = crLineVotes.data.map((v: any) => v.id)
      const { data: crByVote } = await supabase.from('client_rewards')
        .select('id, reward_id, professional_id, status')
        .in('vote_id', voteIds)
        .in('status', ['active', 'used'])
        .order('created_at', { ascending: false })
      if (crByVote && crByVote.length > 0) allClientRewards = crByVote
    }

    // 方法3: user votes → client_rewards
    if (allClientRewards.length === 0 && crUserVotes.data && crUserVotes.data.length > 0) {
      const voteIds = crUserVotes.data.map((v: any) => v.id)
      const { data: crByVote } = await supabase.from('client_rewards')
        .select('id, reward_id, professional_id, status')
        .in('vote_id', voteIds)
        .in('status', ['active', 'used'])
        .order('created_at', { ascending: false })
      if (crByVote && crByVote.length > 0) allClientRewards = crByVote
    }

    // ────────────────────────────────────────
    // リワード詳細を並列取得
    // ────────────────────────────────────────
    let rewards: any[] = []
    if (allClientRewards.length > 0) {
      const rewardIds = Array.from(new Set(allClientRewards.map((cr: any) => cr.reward_id)))
      const proIds = Array.from(new Set(allClientRewards.map((cr: any) => cr.professional_id)))

      const [rewardDetails, proDetails] = await Promise.all([
        supabase.from('rewards').select('id, reward_type, title, content').in('id', rewardIds),
        supabase.from('professionals').select('id, name').in('id', proIds),
      ])

      const rewardMap = new Map<string, any>()
      if (rewardDetails.data) {
        for (const r of rewardDetails.data) rewardMap.set(r.id, r)
      }
      const proMap = new Map<string, string>()
      if (proDetails.data) {
        for (const p of proDetails.data) proMap.set(p.id, p.name)
      }

      rewards = allClientRewards.map((cr: any) => {
        const reward = rewardMap.get(cr.reward_id)
        return {
          id: cr.id,
          reward_id: cr.reward_id,
          reward_type: reward?.reward_type || '',
          title: reward?.title || '',
          content: reward?.content || '',
          status: cr.status,
          professional_id: cr.professional_id,
          pro_name: proMap.get(cr.professional_id) || 'プロ',
        }
      })
    }

    // ────────────────────────────────────────
    // 投票履歴: 最初にヒットした方法を採用
    // ────────────────────────────────────────
    let voteData: any[] = []
    if (votesByEmail.data && votesByEmail.data.length > 0) {
      voteData = votesByEmail.data
    } else if (votesByLine.data && votesByLine.data.length > 0) {
      voteData = votesByLine.data
    } else if (votesByUserId.data && votesByUserId.data.length > 0) {
      voteData = votesByUserId.data
    }

    let voteHistory: any[] = []
    if (voteData.length > 0) {
      const voteProIds = Array.from(new Set(voteData.map((v: any) => v.professional_id)))
      const { data: voteProData } = await supabase.from('professionals')
        .select('id, name, title, photo_url, prefecture, area_description')
        .in('id', voteProIds)

      const voteProMap = new Map<string, any>()
      if (voteProData) {
        for (const p of voteProData) voteProMap.set(p.id, p)
      }

      voteHistory = voteData.map((v: any) => {
        const p = voteProMap.get(v.professional_id)
        return {
          ...v,
          pro_name: p?.name || '不明',
          pro_title: p?.title || '',
          pro_photo_url: p?.photo_url || '',
          pro_prefecture: p?.prefecture || '',
          pro_area: p?.area_description || '',
        }
      })
    }

    return NextResponse.json({
      isPro: !!proCheck.data,
      nickname: clientData.data?.nickname || '',
      email,
      isLine,
      rewards,
      voteHistory,
      bookmarks: bookmarksData.data || [],
    })
  } catch (err: any) {
    console.error('[api/mycard] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
