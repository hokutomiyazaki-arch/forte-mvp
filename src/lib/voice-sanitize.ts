/**
 * §2-6 Voice の表示時AI変換（紹介URL経路のみ・Phase 1で繰り上げ実装）
 *
 * - 原本 (`votes.comment`) は絶対に書き換えない。ハッシュチェーンは原本に対して打つ。
 * - 変換の適用は紹介URL(/r/[slug])のみ。アプリ内(プロ↔プロ)は常に原本表示。
 * - 生成は表示時に1回→ `vote_comment_sanitized` にキャッシュ。表示ごとのAPIコールはしない。
 * - FEATURE_AI_TEXT_SANITIZE が off の間は原文をそのまま返す（挙動変更なし）。
 * - 新規パッケージは追加しない（Anthropic APIはSDKでなくfetch直叩き。Resendの既存流儀と同じ）。
 */

import { getSupabaseAdmin } from '@/lib/supabase'
import { isAiSanitizeEnabled } from '@/lib/feature-flags'

const SANITIZE_VERSION = 1

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
 * 紹介URLページで表示するVoice本文をAI変換して返す（キャッシュ付き）。
 * - flag off: 原文をそのまま返す
 * - キャッシュあり: キャッシュを禁止語チェックしてから返す
 * - キャッシュなし: Anthropic APIで1回変換 → upsert → 禁止語チェック
 * - API失敗・禁止語残存: null（呼び出し側はこの抜粋の表示をスキップする）
 */
export async function sanitizeVoiceForReferral(
  voteId: string,
  originalText: string
): Promise<string | null> {
  if (!isAiSanitizeEnabled()) {
    return originalText
  }

  const supabase = getSupabaseAdmin()

  const { data: cached } = await supabase
    .from('vote_comment_sanitized')
    .select('sanitized_text')
    .eq('vote_id', voteId)
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
