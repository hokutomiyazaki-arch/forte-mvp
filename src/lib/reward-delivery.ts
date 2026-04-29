/**
 * リワード配信のチャネル選択ロジック
 *
 * 方針:
 *   - LINE 認証 (votes.auth_method='line') の voter は LINE Push 優先
 *   - LINE がスキップ ('not_line_auth' 等) または失敗なら通常は Email にフォールバック
 *   - **ただし client_email が @line.realproof.jp ダミーの場合は Email fallback しない**
 *     (DNS 未登録の架空ドメイン → bounce 確実、無駄な送信になる)
 *   - 両方失敗してもスローしない (vote-confirmed 画面はブロックしない fire-and-forget 用途)
 *
 * 内部 API call は server-side でも自身の origin を解決する必要があるため、
 * NEXT_PUBLIC_SITE_URL → NEXT_PUBLIC_APP_URL → 既定 (https://realproof.jp) の順で解決。
 */

import { createClient } from '@supabase/supabase-js'

export interface ChannelResult {
  ok: boolean
  status?: number
  skipped?: string
  error?: string
}

export interface DeliverRewardResult {
  line?: ChannelResult
  email?: ChannelResult
  /** Email fallback をスキップした理由 (デバッグ用) */
  email_skipped_reason?: string
}

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://realproof.jp'
  )
}

async function callChannel(
  path: '/api/send-reward-line' | '/api/send-reward-email',
  voteId: string
): Promise<ChannelResult> {
  const url = `${getSiteUrl()}${path}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ vote_id: voteId }),
    })
    const data = await res.json().catch(() => ({}))
    return {
      ok: res.ok,
      status: res.status,
      skipped: typeof data?.skipped === 'string' ? data.skipped : undefined,
      error: typeof data?.error === 'string' ? data.error : undefined,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'fetch_error' }
  }
}

/**
 * vote_id に紐づく client_rewards.client_email を取得。
 * ダミーメール判定だけに使うため、無くても fallback 経路は維持する。
 */
async function getClientEmail(voteId: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  try {
    const supabase = createClient(url, key)
    const { data } = await supabase
      .from('client_rewards')
      .select('client_email')
      .eq('vote_id', voteId)
      .maybeSingle()
    return ((data as any)?.client_email || null) as string | null
  } catch {
    return null
  }
}

/**
 * vote_id に紐づくリワードを LINE → Email の順で配信。
 * - LINE が delivered (ok && !skipped) → Email スキップ
 * - LINE が not delivered + client_email が @line.realproof.jp ダミー → Email スキップ
 * - 上記以外 → Email フォールバック
 */
export async function deliverReward(voteId: string): Promise<DeliverRewardResult> {
  const result: DeliverRewardResult = {}

  // 0. ダミーメール判定 (失敗時は null = 通常フォールバック経路)
  const clientEmail = await getClientEmail(voteId)
  const isLineDummyEmail = !!clientEmail?.toLowerCase().endsWith('@line.realproof.jp')

  // 1. LINE 試行
  result.line = await callChannel('/api/send-reward-line', voteId)
  const lineDelivered = result.line.ok && !result.line.skipped
  if (lineDelivered) return result

  // 2. ダミーメール → Email fallback しない
  if (isLineDummyEmail) {
    result.email_skipped_reason = 'line_dummy_email'
    return result
  }

  // 3. Email フォールバック
  result.email = await callChannel('/api/send-reward-email', voteId)
  return result
}
