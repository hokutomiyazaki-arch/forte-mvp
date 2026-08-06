import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const REASON_MAX = 500

/**
 * POST /api/consultations/[token]/report — 通報（§16-27-4）
 *
 * 「通常、運営はチャットを閲覧しません。通報があった場合のみ確認します」を成立させるための記録。
 * 常時監視の息苦しさを避けつつ、記録が残る安心は担保する、という立て付け。
 * token を持っている＝当事者なので、追加の認証は求めない。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params
    if (!token) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const payload = await request.json().catch(() => null)
    const reason = payload && typeof payload.reason === 'string'
      ? payload.reason.trim().slice(0, REASON_MAX)
      : ''

    const supabase = getSupabaseAdmin()
    const { data: consultation } = await supabase
      .from('consultations')
      .select('id')
      .eq('access_token', token)
      .maybeSingle()

    if (!consultation) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const { error } = await supabase.from('consultation_reports').insert({
      consultation_id: consultation.id,
      reporter: 'client',
      reason: reason || null,
    })

    if (error) {
      // migration 052 未実行だとここに来る（テーブルが無い）。
      // 通報が届いていないのに「受け付けました」と出すのは最悪なので、必ず失敗として返す。
      console.error('[api/consultations/[token]/report] error:', error.message)
      return NextResponse.json({ error: 'report_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/consultations/[token]/report] error:', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
