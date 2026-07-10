/**
 * 認定申請者の発送ラベル一覧 — 管理者用
 *
 * GET /api/admin/certification-labels
 * → certification_applications を「申請グループ（application_group_id）単位」で集約して返す。
 *   1回の申請＝1発送＝1ラベル。宛名・住所・申請カテゴリ・入金状況を含む。
 *
 * 対象は認定申請者のみ。NFCカード購入者（card_orders）は別系統で扱う（このAPIの対象外）。
 * 認証: admin cookie（rp_admin_auth=authenticated）。読み取り専用。
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  return cookieStore.get('rp_admin_auth')?.value === 'authenticated'
}

type AppRow = {
  id: string
  application_group_id: string | null
  professional_id: string | null
  full_name_kanji: string | null
  full_name_romaji: string | null
  postal_code: string | null
  prefecture: string | null
  city_address: string | null
  building: string | null
  phone: string | null
  organization: string | null
  category_slug: string | null
  applied_at: string | null
  payment_status: string | null
  status: string | null
}

export async function GET() {
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('certification_applications')
    .select(
      'id, application_group_id, professional_id, full_name_kanji, full_name_romaji, postal_code, prefecture, city_address, building, phone, organization, category_slug, applied_at, payment_status, status'
    )
    .order('applied_at', { ascending: false })
    .limit(2000)

  if (error) {
    console.error('[admin/certification-labels] query failed:', error.message)
    return NextResponse.json({ error: 'query failed' }, { status: 500 })
  }

  const rows = (data as AppRow[] | null) ?? []

  // category_slug → 表示ラベル（proof_items.label）を解決
  const slugs = Array.from(new Set(rows.map((r) => r.category_slug).filter(Boolean))) as string[]
  const labelBySlug = new Map<string, string>()
  if (slugs.length > 0) {
    const { data: pis } = await supabase.from('proof_items').select('id, label').in('id', slugs)
    for (const p of (pis as { id: string; label: string | null }[] | null) ?? []) {
      if (p.label) labelBySlug.set(p.id, p.label)
    }
  }

  // 発送先（氏名＋住所）単位に名寄せする。同じ人が別カテゴリを複数回申請しても
  // 送り先が同じなら1発送1ラベルにまとめる（申請グループ単位だと重複表示になるため）。
  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '').trim()
  const dedupeKey = (r: AppRow) =>
    [r.full_name_kanji, r.postal_code, r.prefecture, r.city_address, r.building].map(norm).join('|')

  type Group = {
    key: string
    professional_id: string | null
    full_name_kanji: string | null
    full_name_romaji: string | null
    postal_code: string | null
    prefecture: string | null
    city_address: string | null
    building: string | null
    phone: string | null
    organization: string | null
    applied_at: string | null
    categories: string[]
    anyUnpaid: boolean
  }
  const groups = new Map<string, Group>()
  for (const r of rows) {
    const key = dedupeKey(r)
    const cat = (r.category_slug && labelBySlug.get(r.category_slug)) || r.category_slug || ''
    const cur = groups.get(key)
    if (cur) {
      if (cat && !cur.categories.includes(cat)) cur.categories.push(cat)
      if (r.payment_status === 'pending') cur.anyUnpaid = true
      // applied_at は最新（一覧は新しい順）を代表に残す
      if (r.applied_at && (!cur.applied_at || r.applied_at > cur.applied_at)) cur.applied_at = r.applied_at
    } else {
      groups.set(key, {
        key,
        professional_id: r.professional_id,
        full_name_kanji: r.full_name_kanji,
        full_name_romaji: r.full_name_romaji,
        postal_code: r.postal_code,
        prefecture: r.prefecture,
        city_address: r.city_address,
        building: r.building,
        phone: r.phone,
        organization: r.organization,
        applied_at: r.applied_at,
        categories: cat ? [cat] : [],
        anyUnpaid: r.payment_status === 'pending',
      })
    }
  }

  const list = Array.from(groups.values()).sort((a, b) =>
    (b.applied_at ?? '').localeCompare(a.applied_at ?? '')
  )

  return NextResponse.json({ groups: list })
}
