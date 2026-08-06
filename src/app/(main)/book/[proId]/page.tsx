/**
 * §17-1 REALPROOFの直接予約ページ（/book/[proId]・CEO決定 2026-08-06）
 *
 * 「予約システム構築いこうか。既存の仕組みに、予約金なしにすればok。」
 * 紹介予約のフォーム(ReferralRequestForm)をそのまま variant='direct' で使う。
 * 紹介予約との違いは「紹介元がいない」「予約金が無い」の2点だけ。
 *
 * 受付の判定はここで済ませる（フォームには渡さない）:
 *   - deactivated_at → 404
 *   - booking_enabled === false → 受け付けていない旨（§16-29）
 *   - booking_mode='external' → 自分のサイトで受けているので、そちらへ案内する
 *     ただし ?menu= 付き（メニューからの予約）は常にRPで受ける。外部サイトに
 *     「このメニューで」を渡す手段が無く、渡せないまま飛ばすと選んだメニューが消えるため。
 */

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'
import { normalizeBookingMode } from '@/lib/booking-mode'
import ReferralRequestForm from '@/components/referral/ReferralRequestForm'
import type { BusinessHours } from '@/lib/referral-format'

export const dynamic = 'force-dynamic'

interface BookableMenu {
  id: string
  name: string
  price_jpy: number
  duration_min: number | null
}

const T = { gold: '#C4A35A', textSub: '#555555' }

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'ご予約 | REAL PROOF',
    robots: { index: false, follow: false },
  }
}

/**
 * 直接予約で選べるメニュー。
 * 紹介予約(/r/[slug]/request)と違い price_jpy > 0 で絞らない。
 * 理由: 予約金(オンライン決済)が無いので「0円メニューで決済を素通りされる」穴が存在しない。
 * 「このメニューで予約を受ける」(is_referral_bookable)はプロ自身のスイッチなので尊重する。
 */
async function getBookableMenus(supabase: any, proId: string): Promise<BookableMenu[]> {
  const { data } = await supabase
    .from('pro_menus')
    .select('id, name, price_jpy, duration_min')
    .eq('professional_id', proId)
    .eq('is_active', true)
    .eq('is_referral_bookable', true)
    .order('display_order', { ascending: true })

  return ((data || []) as any[]).map((m) => ({
    id: m.id,
    name: m.name,
    price_jpy: typeof m.price_jpy === 'number' ? m.price_jpy : 0,
    duration_min: m.duration_min ?? null,
  }))
}

export default async function DirectBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ proId: string }>
  searchParams: Promise<{ menu?: string }>
}) {
  const { proId } = await params
  const { menu: menuParam } = await searchParams

  const supabase = getSupabaseAdmin()

  // business_hours / booking_enabled / booking_mode は migration 依存カラム。
  // 未作成の環境で 42703 により「予約ページ全体が落ちる」ことを避けるため、
  // 本体は既存カラムだけで引き、追加カラムは別クエリ＋fail-soft で読む
  // （LESSONS: 未作成カラムを明示selectするとクエリ全体が失敗する）。
  const { data: pro } = await supabase
    .from('professionals')
    .select('id, name, title, photo_url, booking_url, deactivated_at')
    .eq('id', proId)
    .maybeSingle()

  if (!pro || pro.deactivated_at) notFound()

  let bookingEnabled: boolean | null = null
  let bookingMode: string | null = null
  let businessHours: BusinessHours | null = null
  try {
    const { data: extra } = await supabase
      .from('professionals')
      .select('booking_enabled, booking_mode, business_hours')
      .eq('id', proId)
      .maybeSingle()
    if (extra) {
      bookingEnabled = (extra as any).booking_enabled ?? null
      bookingMode = (extra as any).booking_mode ?? null
      businessHours = ((extra as any).business_hours as BusinessHours | null) || null
    }
  } catch {
    // カラム未作成: 受付中(fail-open)・モード未選択として扱う
  }

  const menus = await getBookableMenus(supabase, proId)
  const requestedMenuId = typeof menuParam === 'string' && menuParam ? menuParam : null
  // 指定されたメニューが実在し、いま予約を受け付けている場合だけ初期選択にする
  const initialMenuId = requestedMenuId && menus.some((m) => m.id === requestedMenuId) ? requestedMenuId : null

  // §16-29: 予約の受付そのものが止まっている
  if (bookingEnabled === false) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8, marginBottom: 16 }}>
          {pro.name}さんは現在ご予約を受け付けていません。
        </p>
        <a href={`/card/${proId}`} style={{ fontSize: 12, color: T.gold, textDecoration: 'none', fontWeight: 600 }}>
          ← プロフィールに戻る
        </a>
      </div>
    )
  }

  // §17-1: 「自分のサイトで受ける」を選んでいるプロ。受け口を2本にしないため、
  // ここでは受け取らずに本人のサイトへ案内する（メニュー指定は例外＝RPで受ける）。
  if (!initialMenuId && normalizeBookingMode(bookingMode) === 'external' && pro.booking_url) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '60px 16px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8, marginBottom: 16 }}>
          {pro.name}さんのご予約は、{pro.name}さんのサイトで受け付けています。
        </p>
        <a
          href={pro.booking_url}
          target="_blank"
          rel="noopener"
          style={{
            display: 'inline-block', padding: '12px 20px', borderRadius: 10,
            background: '#1A1A2E', color: T.gold, fontSize: 14, fontWeight: 700, textDecoration: 'none',
          }}
        >
          予約ページへ進む
        </a>
        <div style={{ marginTop: 16 }}>
          <a href={`/card/${proId}`} style={{ fontSize: 12, color: T.gold, textDecoration: 'none', fontWeight: 600 }}>
            ← プロフィールに戻る
          </a>
        </div>
      </div>
    )
  }

  return (
    <ReferralRequestForm
      variant="direct"
      slug={null}
      listId={null}
      initialMenuId={initialMenuId}
      receiverPro={{
        id: pro.id,
        name: pro.name,
        photoUrl: pro.photo_url,
        title: pro.title,
        // 直接予約では見ない値（紹介の受付状態とは別軸・§16-29）
        acceptingStatus: 'open',
        businessHours,
      }}
      menus={menus}
    />
  )
}
