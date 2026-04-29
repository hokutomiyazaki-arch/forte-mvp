/**
 * リワード配信のチャネル選択ロジック
 *
 * 方針:
 *   - LINE 認証 (votes.auth_method='line') の voter は LINE Push 優先
 *   - LINE がスキップ ('not_line_auth' 等) または失敗なら Email にフォールバック
 *   - 両方失敗してもスローしない (vote-confirmed 画面はブロックしない fire-and-forget 用途)
 *
 * 内部 API call は server-side でも自身の origin を解決する必要があるため、
 * NEXT_PUBLIC_SITE_URL → NEXT_PUBLIC_APP_URL → 既定 (https://realproof.jp) の順で解決。
 */

export interface ChannelResult {
  ok: boolean
  status?: number
  skipped?: string
  error?: string
}

export interface DeliverRewardResult {
  line?: ChannelResult
  email?: ChannelResult
}

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://realproof.jp'
  )
}

async function callChannel(path: '/api/send-reward-line' | '/api/send-reward-email', voteId: string): Promise<ChannelResult> {
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
 * vote_id に紐づくリワードを LINE → Email の順で配信。
 * LINE が delivered (ok && !skipped) なら Email はスキップ。
 */
export async function deliverReward(voteId: string): Promise<DeliverRewardResult> {
  const result: DeliverRewardResult = {}

  // 1. LINE 試行
  result.line = await callChannel('/api/send-reward-line', voteId)

  // delivered = ok かつ skipped で無い (= 実際に LINE が送信完了)
  const lineDelivered = result.line.ok && !result.line.skipped
  if (lineDelivered) return result

  // 2. Email フォールバック
  result.email = await callChannel('/api/send-reward-email', voteId)
  return result
}
