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
      await linkLineUserToProfessional(lineUserId)
    } catch (err) {
      console.error(`[line-webhook] Link error for ${lineUserId}:`, err)
    }
  }

  // 4. LINE APIにHTTP 200を返す（必須）
  return NextResponse.json({ status: 'ok' })
}

// ── LINE user_id を professional に紐付け ──
async function linkLineUserToProfessional(lineUserId: string): Promise<void> {
  const supabase = getSupabaseAdmin()

  // 既に紐付け済みかチェック
  const { data: existingPro } = await supabase
    .from('professionals')
    .select('id')
    .eq('line_messaging_user_id', lineUserId)
    .maybeSingle()

  if (existingPro) {
    console.log(`[line-webhook] Already linked: lineUserId=${lineUserId} → pro=${existingPro.id}`)
    return
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
    console.log(`[line-webhook] No Clerk user found for lineUserId=${lineUserId}. Manual linking required.`)
    return
  }

  // Clerk user_id → professionals.user_id で検索
  const { data: pro } = await supabase
    .from('professionals')
    .select('id')
    .eq('user_id', matchedClerkUserId)
    .maybeSingle()

  if (!pro) {
    console.log(`[line-webhook] Clerk user ${matchedClerkUserId} found but no professional record. lineUserId=${lineUserId}`)
    return
  }

  // 紐付け
  const { error } = await supabase
    .from('professionals')
    .update({ line_messaging_user_id: lineUserId })
    .eq('id', pro.id)

  if (error) {
    console.error(`[line-webhook] Update error: pro=${pro.id}`, error.message)
    return
  }

  console.log(`[line-webhook] Linked: lineUserId=${lineUserId} → pro=${pro.id}`)
}
