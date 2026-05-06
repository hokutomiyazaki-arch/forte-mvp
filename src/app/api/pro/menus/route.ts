import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MENU_LIMIT = 20
const NAME_MAX = 100
const PRICE_MAX = 100
const DESC_MAX = 200
const ALLOWED_TAGS = [
  '個人セッション',
  'グループ',
  'パッケージ',
  'サブスク',
  '初回限定',
  'オンライン対応',
] as const

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

function validateTags(tags: unknown): string[] | { error: string } {
  if (tags === undefined || tags === null) return []
  if (!Array.isArray(tags)) return { error: 'category_tags は配列で指定してください' }
  for (const t of tags) {
    if (typeof t !== 'string' || !ALLOWED_TAGS.includes(t as any)) {
      return { error: `category_tags に不正な値があります: ${String(t)}` }
    }
  }
  return Array.from(new Set(tags as string[]))
}

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const professionalId = await resolveProfessionalId(userId)
    if (!professionalId) {
      return NextResponse.json({ error: 'not_a_pro' }, { status: 403 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('pro_menus')
      .select('id, name, price_text, category_tags, description, display_order, is_active, created_at, updated_at')
      .eq('professional_id', professionalId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[api/pro/menus GET] error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ menus: data ?? [] })
  } catch (err: any) {
    console.error('[api/pro/menus GET] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const professionalId = await resolveProfessionalId(userId)
    if (!professionalId) {
      return NextResponse.json({ error: 'not_a_pro' }, { status: 403 })
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const priceText = typeof body?.price_text === 'string' ? body.price_text.trim() : ''
    const description =
      body?.description === undefined || body?.description === null
        ? null
        : typeof body.description === 'string'
          ? body.description.trim()
          : null

    if (!name || name.length > NAME_MAX) {
      return NextResponse.json(
        { error: `name は1〜${NAME_MAX}文字で指定してください` },
        { status: 400 }
      )
    }
    if (!priceText || priceText.length > PRICE_MAX) {
      return NextResponse.json(
        { error: `price_text は1〜${PRICE_MAX}文字で指定してください` },
        { status: 400 }
      )
    }
    if (description !== null && description.length > DESC_MAX) {
      return NextResponse.json(
        { error: `description は${DESC_MAX}文字以内で指定してください` },
        { status: 400 }
      )
    }

    const tagsResult = validateTags(body?.category_tags)
    if (!Array.isArray(tagsResult)) {
      return NextResponse.json({ error: tagsResult.error }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // 上限チェック (is_active = true のみカウント)
    const { count, error: countError } = await supabase
      .from('pro_menus')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', professionalId)
      .eq('is_active', true)

    if (countError) {
      console.error('[api/pro/menus POST] count error:', countError.message)
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }
    if ((count ?? 0) >= MENU_LIMIT) {
      return NextResponse.json(
        { error: `メニュー上限(${MENU_LIMIT}件)に達しています` },
        { status: 400 }
      )
    }

    // display_order: 既存(全行・is_active不問)の最大値+1
    const { data: maxRow, error: maxError } = await supabase
      .from('pro_menus')
      .select('display_order')
      .eq('professional_id', professionalId)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (maxError) {
      console.error('[api/pro/menus POST] max error:', maxError.message)
      return NextResponse.json({ error: maxError.message }, { status: 500 })
    }

    const nextOrder = (maxRow?.display_order ?? -1) + 1

    const { data: inserted, error: insertError } = await supabase
      .from('pro_menus')
      .insert({
        professional_id: professionalId,
        name,
        price_text: priceText,
        description,
        category_tags: tagsResult,
        display_order: nextOrder,
        is_active: true,
      })
      .select('id, name, price_text, category_tags, description, display_order, is_active, created_at, updated_at')
      .maybeSingle()

    if (insertError) {
      console.error('[api/pro/menus POST] insert error:', insertError.message)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ menu: inserted }, { status: 201 })
  } catch (err: any) {
    console.error('[api/pro/menus POST] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
