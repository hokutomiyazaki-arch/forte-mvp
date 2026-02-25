import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

// サーバーサイドなのでService Role Keyを使用（遅延初期化）
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: { card_uid: string } }
) {
  const supabase = getSupabase()
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

    // 2. プロの強み登録チェック
    const { data: pro } = await supabase
      .from('professionals')
      .select('selected_proofs, display_name, name, contact_email, user_id, last_nfc_notify_at')
      .eq('id', card.professional_id)
      .maybeSingle()

    const selectedProofs = pro?.selected_proofs || []
    if (!pro || selectedProofs.length === 0) {
      // 強み未登録 → 準備中ページにリダイレクト + プロに通知メール
      try {
        // 24時間以内に通知済みかチェック
        const lastNotify = pro?.last_nfc_notify_at ? new Date(pro.last_nfc_notify_at) : null
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const shouldNotify = !lastNotify || lastNotify < twentyFourHoursAgo

        if (shouldNotify) {
          // プロのメールアドレスを取得
          let proEmail = pro?.contact_email
          if (!proEmail && pro?.user_id) {
            const { data: userData } = await supabase.auth.admin.getUserById(pro.user_id)
            proEmail = userData?.user?.email || null
          }

          if (proEmail) {
            // 通知メールを送信（非同期、レスポンスを待たない）
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'
            const resendKey = process.env.RESEND_API_KEY
            const displayName = pro?.display_name || pro?.name || 'プロ'

            if (resendKey) {
              fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${resendKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: 'REAL PROOF <info@proof-app.jp>',
                  to: proEmail,
                  subject: 'あなたのREALPROOFカードが読み取られました',
                  html: `
                    <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
                      <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
                        <h1 style="color:#C4A35A;font-size:14px;margin:0;">REAL PROOF</h1>
                      </div>
                      <div style="padding:24px;background:#fff;border:1px solid #eee;">
                        <p style="color:#333;font-size:16px;font-weight:bold;">${displayName} さん</p>
                        <p style="color:#333;line-height:1.8;">
                          あなたのREALPROOFカードが読み取られました！<br>
                          クライアントが投票しようとしましたが、強み項目の設定がまだ完了していないため、投票できませんでした。
                        </p>
                        <p style="color:#333;line-height:1.8;">
                          今すぐ設定を完了して、クライアントからの投票を受け付けましょう。
                        </p>
                        <div style="text-align:center;margin:24px 0;">
                          <a href="${appUrl}/dashboard"
                             style="background:#1A1A2E;color:#C4A35A;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;">
                            ダッシュボードで設定を完了する
                          </a>
                        </div>
                      </div>
                      <div style="padding:16px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
                        <p style="color:#999;font-size:11px;margin:0;">REAL PROOF — 強みが、あなたを定義する。</p>
                      </div>
                    </div>
                  `,
                }),
              }).catch(err => console.error('NFC notify email error:', err))
            }

            // last_nfc_notify_at を更新
            await supabase
              .from('professionals')
              .update({ last_nfc_notify_at: new Date().toISOString() })
              .eq('id', card.professional_id)
          }
        }
      } catch (notifyErr) {
        console.error('NFC notification error:', notifyErr)
        // 通知エラーはリダイレクトに影響させない
      }

      return NextResponse.redirect(
        new URL(`/vote/preparing/${card.professional_id}`, request.url)
      )
    }

    // 3. 既存トークンを削除してから新規作成（既存QR生成と同じパターン）
    await supabase
      .from('qr_tokens')
      .delete()
      .eq('professional_id', card.professional_id)

    // 4. 24時間有効のワンタイムトークンを生成
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

    // 5. 既存の投票ページにリダイレクト（/vote/{professional_id}?token={token}）
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
