import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import { isReferralEnabled } from '@/lib/feature-flags'
import { getValidDelegateListIds } from '@/lib/referral-delegate'

export const dynamic = 'force-dynamic'

const ALLOWED_VISIBILITY = ['link', 'private', 'public']

/**
 * GET /api/referral/lists
 * 自分が所有する処方箋リスト一覧 + 各リストのピン(referral_list_items)を返す。
 * PII（normalized_email等）は含めない。
 */
export async function GET() {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isReferralEnabled(ownPro.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = getSupabaseAdmin()

    const { data: lists, error: listsError } = await supabase
      .from('referral_lists')
      .select('id, title, comment, visibility, criteria, slug, is_delegate, created_at, updated_at')
      .eq('owner_id', ownPro.id)
      .order('created_at', { ascending: false })

    if (listsError) {
      console.error('[api/referral/lists] GET lists error:', listsError)
      return NextResponse.json({ error: 'failed_to_fetch' }, { status: 500 })
    }

    const listIds = (lists || []).map((l) => l.id)
    let itemsByList: Record<string, any[]> = {}

    if (listIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from('referral_list_items')
        .select('id, list_id, pro_id, note, sort_order, consent_status, created_at, professionals(id, name, title, photo_url, accepting_status, delegate_list_id)')
        .in('list_id', listIds)
        .order('sort_order', { ascending: true })

      if (itemsError) {
        console.error('[api/referral/lists] GET items error:', itemsError)
        return NextResponse.json({ error: 'failed_to_fetch' }, { status: 500 })
      }

      for (const item of items || []) {
        if (!itemsByList[item.list_id]) itemsByList[item.list_id] = []
        itemsByList[item.list_id].push(item)
      }
    }

    // §2-2改訂: 🟡点灯条件の厳格化。判定対象は2種類あるが同じ関数で一括判定できる:
    //   ①自分の各リスト自体が「有効な代理リスト」か(is_valid_delegate。ダッシュボードの
    //     受付ステータスウィジェットが、選択中のdelegateListIdの有効性判定に使う)
    //   ②各ピン(pro)自身が設定しているdelegate_list_idが有効か(has_valid_delegate。
    //     ReferralTabのピン行ドット表示に使う)
    // 両方のIDをまとめて1回のヘルパー呼び出しに渡し、二重実装しない。
    const pinDelegateListIds = Object.values(itemsByList)
      .flat()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => item.professionals?.delegate_list_id)
      .filter((id): id is string => !!id)
    const ownListIds = (lists || []).map((l) => l.id)
    const validDelegateListIds = await getValidDelegateListIds(supabase, [
      ...ownListIds,
      ...pinDelegateListIds,
    ])

    const result = (lists || []).map((l) => ({
      ...l,
      is_valid_delegate: validDelegateListIds.has(l.id),
      items: (itemsByList[l.id] || []).map((item) => ({
        ...item,
        has_valid_delegate: !!(
          item.professionals?.delegate_list_id &&
          validDelegateListIds.has(item.professionals.delegate_list_id)
        ),
      })),
    }))

    return NextResponse.json({ lists: result })
  } catch (err: any) {
    console.error('[api/referral/lists] GET error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}

/**
 * POST /api/referral/lists
 * 処方箋リストを新規作成する。body: { title, comment?, visibility?, criteria? }
 */
export async function POST(request: NextRequest) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    if (!isReferralEnabled(ownPro.id)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const comment = typeof body.comment === 'string' ? body.comment.trim() : null
    const visibility = ALLOWED_VISIBILITY.includes(body.visibility) ? body.visibility : 'link'
    const criteria = body.criteria && typeof body.criteria === 'object' ? body.criteria : null

    if (!title) {
      return NextResponse.json({ error: 'title_required' }, { status: 400 })
    }
    if (title.length > 200) {
      return NextResponse.json({ error: 'title_too_long' }, { status: 400 })
    }

    // slug: 推測不能な英数12桁（voice-share.ts の既存パターンを踏襲）
    const slug = crypto.randomUUID().replace(/-/g, '').slice(0, 12)

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('referral_lists')
      .insert({
        owner_id: ownPro.id,
        title,
        comment,
        visibility,
        criteria,
        slug,
      })
      .select('id, title, comment, visibility, criteria, slug, is_delegate, created_at, updated_at')
      .maybeSingle()

    if (error) {
      console.error('[api/referral/lists] POST error:', error)
      return NextResponse.json({ error: 'failed_to_create' }, { status: 500 })
    }

    return NextResponse.json({ list: { ...data, items: [] } })
  } catch (err: any) {
    console.error('[api/referral/lists] POST error:', err)
    return NextResponse.json({ error: err.message || 'internal_error' }, { status: 500 })
  }
}
