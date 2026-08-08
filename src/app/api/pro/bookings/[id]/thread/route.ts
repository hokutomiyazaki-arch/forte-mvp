import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getOwnPro } from '@/lib/referral-auth'
import { normalizeEmail } from '@/lib/normalize-email'

export const dynamic = 'force-dynamic'

/**
 * POST /api/pro/bookings/[id]/thread — 予約のお客さんと REAL PROOF の中でやりとりする
 * （§17-6・CEO指示 2026-08-06）
 *
 * CEOの指示:
 *   「直接予約、紹介予約問わず、クライアントのメールは表示せずに、
 *     リアプルの相談チャットにリンクして欲しい。」
 *
 * なぜメールを出さないか: 出した瞬間にやりとりが REAL PROOF の外へ出て、
 *   記録も、通報の受け口も、次の紹介への接続も消える（§16-30「リードはこっちで握る」）。
 *   相談チャットに寄せれば、既にある往復・通報・送信取り消しがそのまま使える。
 *
 * 新しいテーブルは作らない。**既存の相談スレッド(consultations)を再利用する**:
 *   - 同じプロ × 同じメールアドレス のスレッドがあればそれを返す
 *     （予約のたびに別スレッドを作ると、同じお客さんとの会話が分断される）
 *   - 無ければ空のスレッドを作る。お客さんへの通知はプロが最初の1通を書いた時点で飛ぶ
 *     （既存の返信フローがそのままメールを送る。ここでは何も送らない）
 *
 * 開示条件: 予約が confirmed / completed のときだけ。requested の段階では
 *   連絡先そのものを開示しない既存ルール(canDiscloseContact)に合わせる。
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownPro = await getOwnPro()
    if (!ownPro) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const supabase = getSupabaseAdmin()

    const { data: booking } = await supabase
      .from('referral_bookings')
      .select('id, receiver_pro_id, status, client_name, client_email')
      .eq('id', id)
      .maybeSingle()

    if (!booking || booking.receiver_pro_id !== ownPro.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (booking.status !== 'confirmed' && booking.status !== 'completed') {
      return NextResponse.json({ error: 'not_confirmed' }, { status: 409 })
    }
    if (!booking.client_email) {
      return NextResponse.json({ error: 'no_client_email' }, { status: 409 })
    }

    // §17-20(CEO報告 2026-08-06・本番不具合): 保存・送信するのは**予約フォームに入力された
    //   そのままのアドレス**。normalizeEmail() は Gmail のドットと全ドメインの "+タグ" を落とす
    //   照合キーであって宛先ではない。ここに正規化後の値を入れていたため、
    //   `foo+test@example.com` の予約から立てたスレッドのメールが `foo@example.com`
    //   （別のメールボックス）へ飛び、クライアントには永久に届かなかった。
    const clientEmail = (booking.client_email || '').trim().toLowerCase()
    const normalized = normalizeEmail(booking.client_email)

    // 既存スレッドの再利用（アーカイブ済みも拾う。同じ人との会話は1本にまとめる方がよい）。
    // §17-20: 突き合わせは JS 側で正規化して行う（保存値は生アドレスのため）。
    const { data: candidates } = await supabase
      .from('consultations')
      .select('id, access_token, status, client_email, created_at')
      .eq('pro_id', ownPro.id)
      .order('created_at', { ascending: false })
      .limit(200)
    const existing =
      ((candidates || []) as Array<{ id: string; status: string; client_email: string | null }>).find(
        (c) => normalizeEmail(c.client_email) === normalized,
      ) || null

    if (existing) {
      // アーカイブされていたら受信箱へ戻す（プロが今まさに使おうとしているため）
      if (existing.status === 'archived') {
        await supabase
          .from('consultations')
          .update({ status: 'open', updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      }
      return NextResponse.json({ consultation_id: existing.id, created: false })
    }

    const accessToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
    const record: Record<string, unknown> = {
      pro_id: ownPro.id,
      client_name: booking.client_name || 'お客さま',
      // §17-20: 送信先になる値。正規化前の（クライアントが入力した）アドレスを保存する。
      client_email: clientEmail,
      access_token: accessToken,
      // 'new' は「プロが未返信」の意味なので使わない。プロ側から始めるスレッドは 'open'。
      status: 'open',
      // 予約フォームで情報共有に同意して連絡先を預けてくれている。その証跡を引き継ぐ。
      consent_at: new Date().toISOString(),
    }

    let created: { id: string } | null = null
    {
      const res = await supabase.from('consultations').insert(record).select('id').maybeSingle()
      if (res.error) {
        // fail-soft: consent_at 未作成の環境（migration 050 未実行）ではキーを外して再試行
        const { consent_at: _omit, ...withoutConsent } = record
        const retry = await supabase.from('consultations').insert(withoutConsent).select('id').maybeSingle()
        if (retry.error || !retry.data) {
          console.error('[api/pro/bookings/thread] insert error:', res.error.message, retry.error?.message)
          return NextResponse.json({ error: 'create_failed' }, { status: 500 })
        }
        created = retry.data
      } else {
        created = res.data
      }
    }

    if (!created) {
      return NextResponse.json({ error: 'create_failed' }, { status: 500 })
    }

    return NextResponse.json({ consultation_id: created.id, created: true })
  } catch (err) {
    console.error('[api/pro/bookings/thread] error:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
