/**
 * LINE Messaging API Webhook
 *
 * 友達追加イベント (follow) を受信し、
 * LINE user_id を professionals.line_messaging_user_id に紐付ける。
 *
 * 同一プロバイダー内であれば、LINEログインの sub と
 * Messaging API の event.source.userId は同一。
 * Clerk Backend API で全ユーザーの外部アカウントを照合して自動マッチ。
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { clerkClient } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ── 署名検証 ──
function validateSignature(body: string, signature: string, secret: string): boolean {
  const hash = crypto
    .createHmac('SHA256', secret)
    .update(body)
    .digest('base64')
  return hash === signature
}

export async function POST(req: NextRequest) {
  const channelSecret = process.env.LINE_MESSAGING_CHANNEL_SECRET
  if (!channelSecret) {
    console.error('[line-webhook] LINE_MESSAGING_CHANNEL_SECRET not set')
    return NextResponse.json({ status: 'ok' })
  }

  // 1. 署名検証
  const rawBody = await req.text()
  const signature = req.headers.get('x-line-signature') || ''

  if (!validateSignature(rawBody, signature, channelSecret)) {
    console.error('[line-webhook] Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  // 2. イベント処理
  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    console.error('[line-webhook] Invalid JSON body')
    return NextResponse.json({ status: 'ok' })
  }

  const events = body.events || []

  for (const event of events) {
    // 友達追加イベントのみ処理
    if (event.type !== 'follow') continue

    const lineUserId = event.source?.userId
    if (!lineUserId) continue

    console.log(`[line-webhook] Follow event: userId=${lineUserId}`)

    try {
      // 1. Clerk自動紐付け（既存ロジック）
      const linked = await linkLineUserToProfessional(lineUserId)

      // 2. Clerk紐付け失敗 → コード方式にフォールバック
      if (!linked) {
        await handleCodeLinking(lineUserId, event.replyToken)
      }
    } catch (err) {
      console.error(`[line-webhook] Link error for ${lineUserId}:`, err)
    }
  }

  // 4. LINE APIにHTTP 200を返す（必須）
  return NextResponse.json({ status: 'ok' })
}

// ── LINE user_id を professional に紐付け（Clerk方式） ──
// 成功したら true、紐付けできなければ false
async function linkLineUserToProfessional(lineUserId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()

  // 既に紐付け済みかチェック
  const { data: existingPro } = await supabase
    .from('professionals')
    .select('id')
    .eq('line_messaging_user_id', lineUserId)
    .maybeSingle()

  if (existingPro) {
    console.log(`[line-webhook] Already linked: lineUserId=${lineUserId} → pro=${existingPro.id}`)
    return true
  }

  // Clerk Backend API で LINE 外部アカウントを持つユーザーを検索
  const clerk = await clerkClient()
  let matchedClerkUserId: string | null = null

  // ページネーションで全ユーザーを検索（MVP規模なので全件取得OK）
  let offset = 0
  const limit = 100

  while (!matchedClerkUserId) {
    const users = await clerk.users.getUserList({ limit, offset })
    if (!users.data || users.data.length === 0) break

    for (const user of users.data) {
      const lineAccount = user.externalAccounts?.find(
        (acc: any) => acc.provider === 'line' && acc.providerUserId === lineUserId
      )
      if (lineAccount) {
        matchedClerkUserId = user.id
        break
      }
    }

    if (users.data.length < limit) break
    offset += limit
  }

  if (!matchedClerkUserId) {
    console.log(`[line-webhook] No Clerk user found for lineUserId=${lineUserId}. Falling back to code linking.`)
    return false
  }

  // Clerk user_id → professionals.user_id で検索
  const { data: pro } = await supabase
    .from('professionals')
    .select('id')
    .eq('user_id', matchedClerkUserId)
    .maybeSingle()

  if (!pro) {
    console.log(`[line-webhook] Clerk user ${matchedClerkUserId} found but no professional record. lineUserId=${lineUserId}`)
    return false
  }

  // 紐付け
  const { error } = await supabase
    .from('professionals')
    .update({ line_messaging_user_id: lineUserId })
    .eq('id', pro.id)

  if (error) {
    console.error(`[line-webhook] Update error: pro=${pro.id}`, error.message)
    return false
  }

  console.log(`[line-webhook] Linked: lineUserId=${lineUserId} → pro=${pro.id}`)
  return true
}

// ── コード方式フォールバック ──
// pendingレコードを検索し、line_user_idを保存 → LINEでコードを返信
async function handleCodeLinking(lineUserId: string, replyToken: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const accessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN

  // 直近5分以内の最新 pending レコードを検索
  const { data: pendingRecord } = await supabase
    .from('line_link_codes')
    .select('id, code')
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pendingRecord) {
    // pending レコードあり → line_user_id を保存して waiting に
    await supabase
      .from('line_link_codes')
      .update({ line_user_id: lineUserId, status: 'waiting' })
      .eq('id', pendingRecord.id)

    console.log(`[line-webhook] Code linking: set waiting for code=${pendingRecord.code}, lineUserId=${lineUserId}`)

    // LINEで4桁コードを返信
    if (accessToken && replyToken) {
      await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          replyToken,
          messages: [{
            type: 'text',
            text: `REALPROOFへようこそ！\n\n認証コード: ${pendingRecord.code}\n\nダッシュボードに戻って、このコードを入力してください。\n（5分間有効）`,
          }],
        }),
      })
    }
  } else {
    // pending レコードなし → ウェルカムメッセージのみ
    console.log(`[line-webhook] No pending code for lineUserId=${lineUserId}. Sending welcome message.`)

    if (accessToken && replyToken) {
      await fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          replyToken,
          messages: [{
            type: 'text',
            text: 'REALPROOFへようこそ！\nダッシュボードから「LINEで受け取る」を押して連携を完了してください。',
          }],
        }),
      })
    }
  }
}
