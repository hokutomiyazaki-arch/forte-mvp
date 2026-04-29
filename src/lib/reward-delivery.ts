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
 * baseUrl は呼び出し元 (= /api/deliver-reward) が request.headers の host から
 * 動的に構築して渡す。env 変数 (NEXT_PUBLIC_SITE_URL 等) は本番固定値が入っており、
 * ローカル/preview 環境で本番に向けて fetch してしまう事故を起こすため使わない。
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

async function callChannel(
  baseUrl: string,
  path: '/api/send-reward-line' | '/api/send-reward-email',
  voteId: string
): Promise<ChannelResult> {
  const url = `${baseUrl}${path}`
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
 * vote_id から votes.voter_email を取得。
 * ダミーメール判定だけに使うため、取得失敗時は null = 通常フォールバック経路。
 *
 * 設計変更 (2026-04-29) で配信先メアドは votes.voter_email に統一。
 * client_rewards.client_email は 84% の投票で存在しないため、こちらを真の参照先とする。
 */
async function getVoterEmail(voteId: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  try {
    const supabase = createClient(url, key)
    const { data } = await supabase
      .from('votes')
      .select('voter_email')
      .eq('id', voteId)
      .maybeSingle()
    return ((data as any)?.voter_email || null) as string | null
  } catch {
    return null
  }
}

/**
 * vote_id に紐づくリワードを LINE → Email の順で配信。
 * - LINE が delivered (ok && !skipped) → Email スキップ
 * - LINE が not delivered + client_email が @line.realproof.jp ダミー → Email スキップ
 * - 上記以外 → Email フォールバック
 *
 * @param voteId 配信対象の votes.id
 * @param baseUrl 内部 API の origin (例: "http://localhost:3000")。
 *                呼び出し元が request.headers.host から動的構築する。
 */
export async function deliverReward(
  voteId: string,
  baseUrl: string
): Promise<DeliverRewardResult> {
  const result: DeliverRewardResult = {}

  // 0. ダミーメール判定 (失敗時は null = 通常フォールバック経路)
  const voterEmail = await getVoterEmail(voteId)
  const isLineDummyEmail = !!voterEmail?.toLowerCase().endsWith('@line.realproof.jp')

  // 1. LINE 試行
  result.line = await callChannel(baseUrl, '/api/send-reward-line', voteId)
  const lineDelivered = result.line.ok && !result.line.skipped
  if (lineDelivered) return result

  // 2. ダミーメール → Email fallback しない
  if (isLineDummyEmail) {
    result.email_skipped_reason = 'line_dummy_email'
    return result
  }

  // 3. Email フォールバック
  result.email = await callChannel(baseUrl, '/api/send-reward-email', voteId)
  return result
}
