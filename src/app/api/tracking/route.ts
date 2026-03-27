import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// 許可するイベントタイプ
const VALID_EVENT_TYPES = ['profile_view', 'card_view', 'consultation_click', 'booking_click']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { professional_id, event_type, visitor_id } = body

    // バリデーション
    if (!professional_id || !event_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!VALID_EVENT_TYPES.includes(event_type)) {
      return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 })
    }

    // visitor_id は文字列で36文字以下（UUID形式）のみ受け付ける
    const sanitizedVisitorId = (typeof visitor_id === 'string' && visitor_id.length <= 36)
      ? visitor_id
      : null

    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('tracking_events')
      .insert({
        professional_id,
        event_type,
        visitor_id: sanitizedVisitorId,
      })

    if (error) {
      console.error('Tracking insert error:', error)
      // トラッキングの失敗はユーザー体験に影響させない
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Tracking API error:', e)
    // エラーでも200を返す（トラッキング失敗でUXを壊さない）
    return NextResponse.json({ ok: true })
  }
}
