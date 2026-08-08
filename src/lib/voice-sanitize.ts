/**
 * §2-6 Voice の表示時AI変換（外部に見える全てのVoice表示に広域適用・2026-08-08 CEO GO）
 *
 * - 原本 (`votes.comment`) は絶対に書き換えない。ハッシュチェーンは原本に対して打つ。
 * - 適用範囲は「外部に見える」全経路（紹介URL/検索/公開カード/JSON-LD/団体ページ/voice共有ページ等）。
 *   プロ本人ダッシュボード・admin・ハッシュチェーン検証は原文のまま非接触。
 * - 生成は表示時に1回→ `vote_comment_sanitized` にキャッシュ。表示ごとのAPIコールはしない。
 * - FEATURE_AI_TEXT_SANITIZE が off の間は原文をそのまま返す（挙動変更なし）。
 * - 禁止語を検知しないコメントは、LLM・キャッシュのどちらにも触れず原文をそのまま返す
 *   （広域適用時のコスト対策の核。大半のコメントはここで抜ける）。
 * - 新規パッケージは追加しない（Anthropic APIはSDKでなくfetch直叩き。Resendの既存流儀と同じ）。
 */

import { getSupabaseAdmin } from '@/lib/supabase'
import { isAiSanitizeEnabled } from '@/lib/feature-flags'

// §2-6広域適用(2026-08-08 CEO GO): 「治った」等の断定体験談トリガー語を追加したためバージョンを上げる。
// version不一致のキャッシュ行は再変換対象になる(本番0件確認済みのため再変換コストなし)。
const SANITIZE_VERSION = 2

const SYSTEM_PROMPT = `あなたは、施術者(トレーナー・治療家・コーチ等)に対するクライアントの感想文を、
一般公開の紹介ページに掲載できる表現に言い換える校正者です。

ルール:
1. 病名・診断名（例: ヘルニア、坐骨神経痛、脊柱管狭窄、うつ病、自律神経失調症 など）が含まれる場合は、
   医学的な診断名を出さずに「状態の言葉」に言い換える（例: 「長年の腰の不調」「気持ちが不安定だった時期」）。
2. 効果を断定する表現（「治った」「完治した」「絶対に良くなる」等）は、
   本人の実感として書かれた表現に言い換える（例: 「良くなったと感じた」「楽になった」）。
3. 原文の意味・トーン・熱量・長さはできるだけ保つ。誇張の追加や新しい事実の創作は禁止。
4. 出力は変換後の本文テキストのみ。前置き・見出し・注記・「変換しました」等のメタ発言は一切付けない。
5. 単語レベルでどこを変えたかがわかるマーカー（**強調**、[変更]等）は絶対に付けない。`

// 保守的な禁止語リスト（診断名・医学用語）。二段構えチェック用。
const FORBIDDEN_LITERAL_TERMS = [
  'ヘルニア',
  '坐骨神経痛',
  '脊柱管狭窄',
  'うつ病',
  '自律神経失調',
  '椎間板',
  '腱鞘炎',
  'ぎっくり腰',
  '糖尿病',
  '高血圧症',
  '統合失調症',
  'パニック障害',
  '適応障害',
  // §2-6広域適用(2026-08-08 CEO GO): 効果を断定する体験談は広告規制リスクが高いため追加
  '治った',
  '治る',
  '治り',
  '治し',
  '治療',
  '完治',
]

// 「〜症」「〜病」等の一般的な診断名っぽい語尾。false positiveがあっても
// 「その抜粋を非表示にする」だけなので安全側に倒す（原文の外部露出は防げる）。
const FORBIDDEN_SUFFIX_PATTERN = /[一-龠ぁ-んァ-ヶー]{1,10}(症|病|障害)/

// 中9レビュー指摘: 「症状」「炎症」等の一般語は診断名ではないため、語尾パターン判定の
// 前にマスクして誤検知を減らす(保守的すぎない形の調整・除外しすぎない)。
// 初期2週間はログ(vote_idと検知語のみ・本文は出さない)で誤検知率を確認して調整する（§2-6）。
const SUFFIX_FALSE_POSITIVES = ['症状', '炎症', '既往症', '対症', '病院', '病気', '発症', '重症', '軽症', '持病']

/** 禁止語を検知した場合、検知語(本文は含まない)を返す。検知しなければ null。 */
function findForbiddenTerm(text: string): string | null {
  const literal = FORBIDDEN_LITERAL_TERMS.find((term) => text.includes(term))
  if (literal) return literal

  let masked = text
  for (const word of SUFFIX_FALSE_POSITIVES) {
    masked = masked.split(word).join('')
  }
  const suffixMatch = masked.match(FORBIDDEN_SUFFIX_PATTERN)
  return suffixMatch ? suffixMatch[0] : null
}

async function callAnthropic(originalText: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[voice-sanitize] ANTHROPIC_API_KEY is not set')
    return null
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: originalText }],
      }),
    })

    if (!res.ok) {
      console.error('[voice-sanitize] Anthropic API error status:', res.status)
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json()

    if (json?.stop_reason === 'refusal') {
      return null
    }

    const blocks = Array.isArray(json?.content) ? json.content : []
    const combined = blocks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => b.text)
      .join('')
      .trim()

    return combined || null
  } catch (err) {
    console.error('[voice-sanitize] Anthropic fetch error:', err)
    return null
  }
}

/**
 * 禁止語検知のみを行う軽量ゲート（LLM・キャッシュに触れない）。
 * vote_id が無く `vote_comment_sanitized` のキャッシュキーが作れない経路
 * （例: 検索のRPC集計パス由来のvoiceマッチ、latestVoteComment由来のスニペット）で、
 * 「変換はしないが、検知したら非表示にする」という安全側の判定にのみ使う。
 */
export function hasForbiddenTerm(text: string): boolean {
  return !!findForbiddenTerm(text)
}

/**
 * 外部に見える全てのVoice表示で使う中核関数（キャッシュ付き・事前ゲート化）。
 * - flag off: 原文をそのまま返す（既存挙動維持）
 * - 禁止語を検知しない: LLM・キャッシュのどちらにも触れず原文をそのまま返す
 *   （広域適用のコスト対策の核。大半のコメントはここで抜ける）
 * - 検知あり・キャッシュヒット(同バージョン)かつ変換後に禁止語なし: キャッシュを返す
 * - 検知あり・キャッシュヒットだが変換後にも禁止語が残る: null（非表示）
 * - 検知あり・キャッシュミス: Anthropic APIで1回変換 → upsert(version=SANITIZE_VERSION) → 禁止語チェック
 * - API失敗・禁止語残存: null（呼び出し側はこの抜粋の表示をスキップする＝原文は絶対に出さない）
 */
export async function sanitizeVoiceForDisplay(
  voteId: string,
  originalText: string
): Promise<string | null> {
  if (!isAiSanitizeEnabled()) {
    return originalText
  }

  // 事前ゲート: 検知が無ければLLM/キャッシュに触れず原文を返す(広域適用のコスト対策の核)
  if (!findForbiddenTerm(originalText)) {
    return originalText
  }

  const supabase = getSupabaseAdmin()

  const { data: cached } = await supabase
    .from('vote_comment_sanitized')
    .select('sanitized_text')
    .eq('vote_id', voteId)
    .eq('sanitize_version', SANITIZE_VERSION)
    .maybeSingle()

  if (cached?.sanitized_text) {
    const cachedForbiddenTerm = findForbiddenTerm(cached.sanitized_text)
    if (cachedForbiddenTerm) {
      console.log('[voice-sanitize] skipped (forbidden term detected):', { voteId, term: cachedForbiddenTerm })
      return null
    }
    return cached.sanitized_text
  }

  const converted = await callAnthropic(originalText)
  if (!converted) return null

  const { error: upsertError } = await supabase
    .from('vote_comment_sanitized')
    .upsert(
      {
        vote_id: voteId,
        sanitized_text: converted,
        sanitize_version: SANITIZE_VERSION,
        sanitized_at: new Date().toISOString(),
      },
      { onConflict: 'vote_id' }
    )

  if (upsertError) {
    console.error('[voice-sanitize] cache upsert error:', upsertError)
  }

  const forbiddenTerm = findForbiddenTerm(converted)
  if (forbiddenTerm) {
    console.log('[voice-sanitize] skipped (forbidden term detected):', { voteId, term: forbiddenTerm })
    return null
  }
  return converted
}

/**
 * 互換ラッパー（既存呼び出し = referral-data.ts は無改修で動く）。
 */
export async function sanitizeVoiceForReferral(
  voteId: string,
  originalText: string
): Promise<string | null> {
  return sanitizeVoiceForDisplay(voteId, originalText)
}

/**
 * バッチ版（検索・公開カード等・複数件を一括変換）。
 * - flag off: 全件原文のMapを返す
 * - 検知語ゲートで対象を絞る（非対象は原文でMapへ。ここがコスト対策の核）
 * - 対象分のキャッシュを1回のクエリで一括取得（1件1クエリにしない）
 * - キャッシュミス分のLLM変換はPromise.all・同時最大10件
 *   （検索/カードの初回表示でAnthropicへ数百並列を送るのを防ぐため）。
 *   10件を超えた分は今回null(非表示)とし、console.warnで件数を記録する
 *   （次回表示時にはキャッシュが埋まっていくため、恒久的な非表示ではない）。
 * - 戻り値 null = 非表示にすべき
 */
export async function sanitizeVoicesForDisplay(
  items: Array<{ voteId: string; text: string }>
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>()

  if (!isAiSanitizeEnabled()) {
    for (const item of items) result.set(item.voteId, item.text)
    return result
  }

  const targets: Array<{ voteId: string; text: string }> = []
  for (const item of items) {
    if (findForbiddenTerm(item.text)) {
      targets.push(item)
    } else {
      // 事前ゲート: 検知が無ければLLM/キャッシュに触れず原文を返す
      result.set(item.voteId, item.text)
    }
  }

  if (targets.length === 0) return result

  const supabase = getSupabaseAdmin()
  const targetIds = targets.map((t) => t.voteId)

  const { data: cachedRows } = await supabase
    .from('vote_comment_sanitized')
    .select('vote_id, sanitized_text')
    .in('vote_id', targetIds)
    .eq('sanitize_version', SANITIZE_VERSION)

  const cacheMap = new Map<string, string>()
  for (const row of (cachedRows || []) as Array<{ vote_id: string; sanitized_text: string | null }>) {
    if (row.sanitized_text) cacheMap.set(row.vote_id, row.sanitized_text)
  }

  const missing: Array<{ voteId: string; text: string }> = []
  for (const item of targets) {
    const cachedText = cacheMap.get(item.voteId)
    if (cachedText) {
      const forbidden = findForbiddenTerm(cachedText)
      if (forbidden) {
        console.log('[voice-sanitize] skipped (forbidden term detected):', { voteId: item.voteId, term: forbidden })
      }
      result.set(item.voteId, forbidden ? null : cachedText)
    } else {
      missing.push(item)
    }
  }

  if (missing.length === 0) return result

  // 検索/カードの初回表示でAnthropicへ数百並列を送るのを防ぐため、同時最大10件に絞る。
  const MAX_CONCURRENT_LLM = 10
  const toConvert = missing.slice(0, MAX_CONCURRENT_LLM)
  const overflow = missing.slice(MAX_CONCURRENT_LLM)
  if (overflow.length > 0) {
    console.warn(
      `[voice-sanitize] batch overflow: ${overflow.length} item(s) skipped this request ` +
      `(LLM concurrency cap=${MAX_CONCURRENT_LLM}); will be converted & cached on a later display`
    )
    for (const item of overflow) result.set(item.voteId, null)
  }

  const upsertRows: Array<{
    vote_id: string
    sanitized_text: string
    sanitize_version: number
    sanitized_at: string
  }> = []

  await Promise.all(
    toConvert.map(async (item) => {
      const converted = await callAnthropic(item.text)
      if (!converted) {
        result.set(item.voteId, null)
        return
      }
      const forbidden = findForbiddenTerm(converted)
      if (forbidden) {
        console.log('[voice-sanitize] skipped (forbidden term detected):', { voteId: item.voteId, term: forbidden })
      } else {
        upsertRows.push({
          vote_id: item.voteId,
          sanitized_text: converted,
          sanitize_version: SANITIZE_VERSION,
          sanitized_at: new Date().toISOString(),
        })
      }
      result.set(item.voteId, forbidden ? null : converted)
    })
  )

  if (upsertRows.length > 0) {
    const { error } = await supabase
      .from('vote_comment_sanitized')
      .upsert(upsertRows, { onConflict: 'vote_id' })
    if (error) {
      console.error('[voice-sanitize] batch cache upsert error:', error)
    }
  }

  return result
}
