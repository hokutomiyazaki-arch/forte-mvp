/**
 * §2-4 予約リクエストページ(クライアント向け・/r/[slug]/request?pro=<proId>)
 *
 * - 対象プロが、この処方箋リストの候補(ピン+基準行・代理一段展開込み)に
 *   含まれることを検証してから表示する(それ以外は404)
 * - 認証チェック・フォーム送信は client component(ReferralRequestForm)側で行う
 */

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getReferralPageData, type ReferralCandidate } from '@/lib/referral-data'
import ReferralRequestForm from '@/components/referral/ReferralRequestForm'

export const dynamic = 'force-dynamic'

function findCandidate(candidates: ReferralCandidate[], proId: string): ReferralCandidate | null {
  for (const c of candidates) {
    if (c.pro.id === proId) return c
    if (c.delegate) {
      const found = findCandidate(c.delegate, proId)
      if (found) return found
    }
  }
  return null
}

interface BookableMenu {
  id: string
  name: string
  price_jpy: number
  duration_min: number | null
}

/**
 * 追加3(2026-08-05・CEO指示・構造化版): 受け手プロの受付時間(professionals.business_hours jsonb)。
 * getReferralPageData/ReferralCandidateには含めない専用の軽量フェッチ(共有関数を汚さない・fail-soft)。
 * migration未反映(カラム未作成)の間はerrorを検出してnullを返す(=非表示。CEO決定通りサイレントnull)。
 */
async function getBusinessHours(proId: string): Promise<{ start: string | null; end: string | null; closed_days: string[] | null } | null> {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('professionals')
      .select('business_hours')
      .eq('id', proId)
      .maybeSingle()
    if (error || !data) return null
    return (data as { business_hours: { start: string | null; end: string | null; closed_days: string[] | null } | null }).business_hours || null
  } catch {
    return null
  }
}

/**
 * メニュー未設定プロの予約穴の閉塞(2026-08-05・CEO指示): 「予約可能なメニュー」は
 * price_jpy > 0 のものだけ(0円は無決済成立の抜け道になるため対象外)。
 * referral-data.ts の getHasBookableMenu / bookings POST の受け手検証と定義を統一する。
 */
async function getBookableMenus(proId: string): Promise<BookableMenu[]> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('pro_menus')
    .select('id, name, price_jpy, duration_min')
    .eq('professional_id', proId)
    .eq('is_active', true)
    .eq('is_referral_bookable', true)
    .gt('price_jpy', 0)
    .order('display_order', { ascending: true })

  return (data || []) as BookableMenu[]
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'ご相談・ご予約 | REAL PROOF',
    robots: { index: false, follow: false },
  }
}

export default async function ReferralRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ pro?: string }>
}) {
  const { slug } = await params
  const { pro: proId } = await searchParams

  if (!proId) notFound()

  const data = await getReferralPageData(slug)
  if (!data) notFound()

  const candidate = findCandidate(data.candidates, proId)
  if (!candidate) notFound()

  // 軽微7(レビュー指摘): 互いに依存しない2つのフェッチをPromise.allで並列化する。
  const [menus, businessHours] = await Promise.all([getBookableMenus(proId), getBusinessHours(proId)])

  // メニュー未設定プロの予約穴の閉塞(2026-08-05・CEO指示): 予約可能な有料メニューが1件も無い
  // 受け手はフォームを出さない(price_jpy=0での無決済成立→即時開示を防ぐ)。直接URLで開いた場合の対策。
  if (menus.length === 0) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#555555', lineHeight: 1.8, marginBottom: 16 }}>
          このプロは現在オンライン予約を準備中です。
        </p>
        <a href={`/r/${slug}`} style={{ fontSize: 12, color: '#C4A35A', textDecoration: 'none', fontWeight: 600 }}>
          ← 紹介リストに戻る
        </a>
      </div>
    )
  }

  return (
    <ReferralRequestForm
      slug={slug}
      listId={data.list.id}
      receiverPro={{
        id: candidate.pro.id,
        name: candidate.pro.name,
        photoUrl: candidate.pro.photoUrl,
        title: candidate.pro.title,
        acceptingStatus: candidate.acceptingStatus,
        businessHours,
      }}
      menus={menus}
    />
  )
}
