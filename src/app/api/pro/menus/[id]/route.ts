import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const NAME_MAX = 100
const PRICE_MAX = 100
const DESC_MAX = 200
// タスクC(§2-3): 紹介予約の決済計算に使う数値の料金。上限は1000万円程度。
const PRICE_JPY_MAX = 10_000_000
const ALLOWED_TAGS = [
  '個人セッション',
  'グループ',
  'パッケージ',
  'サブスク',
  '初回限定',
  'オンライン対応',
] as const

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveProfessionalId(userId: string) {
  const supabase = getSupabaseAdmin()
  const { data: pro } = await supabase
    .from('professionals')
    .select('id')
    .eq('user_id', userId)
    .is('deactivated_at', null)
    .maybeSingle()
  return pro?.id ?? null
}

async function loadOwnedMenu(menuId: string, professionalId: string) {
  const supabase = getSupabaseAdmin()
  const { data: menu } = await supabase
    .from('pro_menus')
    .select('id, professional_id, price_jpy, is_referral_bookable')
    .eq('id', menuId)
    .maybeSingle()

  if (!menu) return { status: 404 as const, body: { error: 'not_found' } }
  if (menu.professional_id !== professionalId) {
    return { status: 403 as const, body: { error: 'forbidden' } }
  }
  return { status: 200 as const, menu }
}

function validateTags(tags: unknown): string[] | { error: string } {
  if (!Array.isArray(tags)) return { error: 'category_tags は配列で指定してください' }
  for (const t of tags) {
    if (typeof t !== 'string' || !ALLOWED_TAGS.includes(t as any)) {
      return { error: `category_tags に不正な値があります: ${String(t)}` }
    }
  }
  return Array.from(new Set(tags as string[]))
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
    }

    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const professionalId = await resolveProfessionalId(userId)
    if (!professionalId) {
      return NextResponse.json({ error: 'not_a_pro' }, { status: 403 })
    }

    const owned = await loadOwnedMenu(id, professionalId)
    if (owned.status !== 200) {
      return NextResponse.json(owned.body, { status: owned.status })
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    const update: Record<string, any> = {}

    if (body?.name !== undefined) {
      if (typeof body.name !== 'string') {
        return NextResponse.json({ error: 'name must be string' }, { status: 400 })
      }
      const v = body.name.trim()
      if (!v || v.length > NAME_MAX) {
        return NextResponse.json(
          { error: `name は1〜${NAME_MAX}文字で指定してください` },
          { status: 400 }
        )
      }
      update.name = v
    }

    if (body?.price_text !== undefined) {
      if (typeof body.price_text !== 'string') {
        return NextResponse.json({ error: 'price_text must be string' }, { status: 400 })
      }
      const v = body.price_text.trim()
      if (!v || v.length > PRICE_MAX) {
        return NextResponse.json(
          { error: `price_text は1〜${PRICE_MAX}文字で指定してください` },
          { status: 400 }
        )
      }
      update.price_text = v
    }

    if (body?.description !== undefined) {
      if (body.description === null) {
        update.description = null
      } else if (typeof body.description === 'string') {
        const v = body.description.trim()
        if (v.length > DESC_MAX) {
          return NextResponse.json(
            { error: `description は${DESC_MAX}文字以内で指定してください` },
            { status: 400 }
          )
        }
        update.description = v
      } else {
        return NextResponse.json({ error: 'description must be string or null' }, { status: 400 })
      }
    }

    if (body?.category_tags !== undefined) {
      const tags = validateTags(body.category_tags)
      if (!Array.isArray(tags)) {
        return NextResponse.json({ error: tags.error }, { status: 400 })
      }
      update.category_tags = tags
    }

    if (body?.display_order !== undefined) {
      if (typeof body.display_order !== 'number' || !Number.isInteger(body.display_order)) {
        return NextResponse.json({ error: 'display_order must be integer' }, { status: 400 })
      }
      update.display_order = body.display_order
    }

    if (body?.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') {
        return NextResponse.json({ error: 'is_active must be boolean' }, { status: 400 })
      }
      update.is_active = body.is_active
    }

    // タスクC(§2-3): 料金(円・数値)・紹介予約受付フラグ
    if (body?.price_jpy !== undefined) {
      if (body.price_jpy === null) {
        update.price_jpy = null
      } else if (typeof body.price_jpy === 'number' && Number.isInteger(body.price_jpy)) {
        if (body.price_jpy < 1) {
          return NextResponse.json({ error: '1円以上の金額を入力してください' }, { status: 400 })
        }
        if (body.price_jpy > PRICE_JPY_MAX) {
          return NextResponse.json(
            { error: `料金（円）は${PRICE_JPY_MAX.toLocaleString()}円以内で入力してください` },
            { status: 400 }
          )
        }
        update.price_jpy = body.price_jpy
      } else {
        return NextResponse.json({ error: '料金（円）は整数で指定してください' }, { status: 400 })
      }
    }

    if (body?.is_referral_bookable !== undefined) {
      if (typeof body.is_referral_bookable !== 'boolean') {
        return NextResponse.json({ error: 'is_referral_bookable must be boolean' }, { status: 400 })
      }
      update.is_referral_bookable = body.is_referral_bookable
    }

    // 更新後に有効となる price_jpy / is_referral_bookable の組み合わせを検証
    // (body側で指定が無いフィールドは既存値 = owned.menu を使う)。
    const effectivePriceJpy: number | null =
      'price_jpy' in update ? update.price_jpy : (owned.menu?.price_jpy ?? null)
    const effectiveBookable: boolean =
      'is_referral_bookable' in update ? update.is_referral_bookable : !!owned.menu?.is_referral_bookable
    if (effectiveBookable && (effectivePriceJpy === null || effectivePriceJpy <= 0)) {
      return NextResponse.json(
        { error: '紹介予約を受け付けるには料金（円）の入力が必要です' },
        { status: 400 }
      )
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
    }

    update.updated_at = new Date().toISOString()

    const supabase = getSupabaseAdmin()
    const { data: updated, error } = await supabase
      .from('pro_menus')
      .update(update)
      .eq('id', id)
      .eq('professional_id', professionalId)
      .select('id, name, price_text, category_tags, description, display_order, is_active, created_at, updated_at, price_jpy, is_referral_bookable')
      .maybeSingle()

    if (error) {
      console.error('[api/pro/menus PATCH] error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ menu: updated })
  } catch (err: any) {
    console.error('[api/pro/menus PATCH] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
    }

    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const professionalId = await resolveProfessionalId(userId)
    if (!professionalId) {
      return NextResponse.json({ error: 'not_a_pro' }, { status: 403 })
    }

    const owned = await loadOwnedMenu(id, professionalId)
    if (owned.status !== 200) {
      return NextResponse.json(owned.body, { status: owned.status })
    }

    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('pro_menus')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('professional_id', professionalId)

    if (error) {
      console.error('[api/pro/menus DELETE] error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[api/pro/menus DELETE] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
