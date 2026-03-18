/**
 * メール配信停止API
 *
 * GET /api/email/unsubscribe?token=xxxxx
 *
 * tokenはprofessional_idをHMAC-SHA256署名したもの（CRON_SECRETを鍵に使用）。
 * 検証OK → professionals.weekly_report_unsubscribed = true
 * レスポンス: シンプルなHTML
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return new NextResponse(renderHTML('無効なリンクです', false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const professionalId = verifyUnsubscribeToken(token)
  if (!professionalId) {
    return new NextResponse(renderHTML('無効なリンクです', false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('professionals')
    .update({ weekly_report_unsubscribed: true })
    .eq('id', professionalId)

  if (error) {
    console.error('[unsubscribe] Update error:', error.message)
    return new NextResponse(renderHTML('エラーが発生しました。もう一度お試しください。', false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  return new NextResponse(renderHTML('メール配信を停止しました。', true), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function renderHTML(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>REALPROOF - 配信設定</title></head>
<body style="margin:0;padding:0;background:#1A1A2E;font-family:'Helvetica Neue',Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
<div style="text-align:center;padding:40px 24px;max-width:400px;">
  ${success ? '<div style="font-size:48px;margin-bottom:16px;">✓</div>' : ''}
  <div style="color:#FAFAF7;font-size:18px;font-weight:600;margin-bottom:12px;">${message}</div>
  ${success ? '<div style="color:rgba(250,250,247,0.5);font-size:14px;line-height:1.6;">再開するにはダッシュボードのプロフィール編集から設定してください。</div>' : ''}
  <a href="/dashboard" style="display:inline-block;margin-top:24px;color:#C4A35A;font-size:14px;text-decoration:underline;">ダッシュボードへ</a>
</div>
</body>
</html>`
}
