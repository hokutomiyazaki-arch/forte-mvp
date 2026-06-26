import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// 許可するイベントタイプ
const VALID_EVENT_TYPES = ['profile_view', 'card_view', 'consultation_click', 'booking_click']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { professional_id, event_type, visitor_id, source } = body

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

    // source はオプショナル。来た時だけ insert に含める（既存挙動は不変・NULL のまま）
    const sanitizedSource = (typeof source === 'string' && source.length > 0 && source.length <= 64)
      ? source
      : null

    const supabase = getSupabaseAdmin()
    const insertRow: Record<string, any> = {
      professional_id,
      event_type,
      visitor_id: sanitizedVisitorId,
    }
    if (sanitizedSource) insertRow.source = sanitizedSource

    const { error } = await supabase
      .from('tracking_events')
      .insert(insertRow)

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
