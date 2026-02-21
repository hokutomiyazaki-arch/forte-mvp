import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

// サーバーサイドなのでService Role Keyを使用
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: { card_uid: string } }
) {
  const { card_uid } = params

  try {
    // 1. card_uid からカードを検索
    const { data: card, error: cardError } = await supabase
      .from('nfc_cards')
      .select('id, professional_id, status')
      .eq('card_uid', card_uid)
      .maybeSingle()

    // カードが見つからない
    if (!card || cardError) {
      return NextResponse.redirect(
        new URL('/?error=invalid_card', request.url)
      )
    }

    // カードが紛失・無効化されている
    if (card.status === 'lost' || card.status === 'deactivated') {
      return NextResponse.redirect(
        new URL('/?error=card_disabled', request.url)
      )
    }

    // カードが未紐づけ
    if (card.status === 'unlinked' || !card.professional_id) {
      return NextResponse.redirect(
        new URL('/?error=card_not_linked', request.url)
      )
    }

    // 2. 既存トークンを削除してから新規作成（既存QR生成と同じパターン）
    await supabase
      .from('qr_tokens')
      .delete()
      .eq('professional_id', card.professional_id)

    // 3. 24時間有効のワンタイムトークンを生成
    const token = randomBytes(16).toString('hex')
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { error: tokenError } = await supabase
      .from('qr_tokens')
      .insert({
        professional_id: card.professional_id,
        token: token,
        expires_at: expiresAt,
      })

    if (tokenError) {
      console.error('Token generation error:', tokenError)
      return NextResponse.redirect(
        new URL('/?error=token_error', request.url)
      )
    }

    // 4. 既存の投票ページにリダイレクト（/vote/{professional_id}?token={token}）
    return NextResponse.redirect(
      new URL(`/vote/${card.professional_id}?token=${token}`, request.url)
    )

  } catch (error) {
    console.error('NFC redirect error:', error)
    return NextResponse.redirect(
      new URL('/?error=server_error', request.url)
    )
  }
}
