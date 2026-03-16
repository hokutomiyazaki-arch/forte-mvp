import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ professional_id: string; proof_item_id: string }> }
) {
  const { professional_id, proof_item_id } = await params
  const supabase = getSupabaseAdmin()

  try {
    // votes テーブルから該当プロ × 該当proof_item_id を含む確定投票の日付を取得
    const { data, error } = await supabase
      .from('votes')
      .select('created_at')
      .eq('professional_id', professional_id)
      .eq('status', 'confirmed')
      .contains('selected_proof_ids', [proof_item_id])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[api/proof-votes] Error:', error)
      return NextResponse.json({ dates: [] })
    }

    // 日付のみ抽出（YYYY-MM-DD）
    const dates = (data || []).map(v =>
      new Date(v.created_at).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    )

    return NextResponse.json({ dates })
  } catch (err) {
    console.error('[api/proof-votes] Error:', err)
    return NextResponse.json({ dates: [] })
  }
}
