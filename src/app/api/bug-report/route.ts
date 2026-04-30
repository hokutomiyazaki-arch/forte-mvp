import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/bug-report
 * 不具合報告を受け付ける（認証不要 — 未ログインユーザーからも受付）
 *
 * Body (JSON):
 *   screen       - どの画面で（任意）
 *   description  - 何が起きたか（必須）
 *   email        - 連絡先（任意）
 *   image_url    - スクリーンショットURL（任意）
 *   user_agent   - ブラウザ情報（フロントで自動付与）
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { screen, description, email, image_url, user_agent } = body

    if (!description || !description.trim()) {
      return NextResponse.json({ error: '内容を入力してください' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('bug_reports')
      .insert({
        screen: screen?.trim() || null,
        description: description.trim(),
        email: email?.trim() || null,
        image_url: image_url || null,
        user_agent: user_agent || null,
      })
      .select()
      .maybeSingle()

    if (error) {
      console.error('[bug-report] insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 管理者にメール通知
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'REAL PROOF <noreply@realproof.jp>',
            to: 'hokutomiyazaki312@gmail.com',
            subject: `[不具合報告] ${screen || '画面不明'}`,
            html: `
              <div style="max-width:480px;margin:0 auto;font-family:sans-serif;">
                <div style="background:#1A1A2E;padding:24px;border-radius:12px 12px 0 0;">
                  <h1 style="color:#C4A35A;font-size:14px;margin:0;">REAL PROOF — 不具合報告</h1>
                </div>
                <div style="padding:24px;background:#fff;border:1px solid #eee;">
                  <p style="color:#333;font-size:14px;"><strong>画面:</strong> ${screen || '未入力'}</p>
                  <p style="color:#333;font-size:14px;"><strong>内容:</strong></p>
                  <p style="color:#333;font-size:14px;white-space:pre-wrap;">${description}</p>
                  ${email ? `<p style="color:#333;font-size:14px;"><strong>連絡先:</strong> ${email}</p>` : ''}
                  ${image_url ? `<p style="color:#333;font-size:14px;"><strong>スクリーンショット:</strong><br><img src="${image_url}" style="max-width:100%;border-radius:8px;margin-top:8px;" /></p>` : ''}
                  <p style="color:#999;font-size:12px;margin-top:16px;"><strong>UA:</strong> ${user_agent || '不明'}</p>
                </div>
                <div style="padding:16px;text-align:center;background:#f9f9f9;border-radius:0 0 12px 12px;">
                  <p style="color:#999;font-size:11px;margin:0;">管理画面で確認: /admin/dashboard</p>
                </div>
              </div>
            `,
          }),
        })
      } catch (emailErr) {
        console.error('[bug-report] email notification failed:', emailErr)
        // メール失敗してもレポート自体は保存済みなのでエラーにしない
      }
    }

    return NextResponse.json({ success: true, id: data?.id })
  } catch (err: any) {
    console.error('[bug-report] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
