/**
 * AIリスト作成ドラフト機能（§CEO GO 2026-08-08）のAnthropic呼び出しロジック。
 * src/lib/voice-sanitize.ts の fetch流儀(SDK無し・素のfetch)を踏襲する。新パッケージは追加しない。
 *
 * 個人情報保護(絶対厳守): このファイルがAnthropicへ送るペイロードには、プロの公開情報
 * (name/title/prefecture/強み集計/コメント本文の抜粋)のみを含める。
 * voter_email / normalized_email / voter_phone / client_email 等は絶対に含めない
 * (このファイル自身は受け取ったオブジェクトをそのままJSON化するだけなので、呼び出し側
 * (ai-list-draft/route.ts)が組み立てるpayloadに含めないことが実質的な担保になる)。
 *
 * 捏造防止: 候補一覧に無い pro_id を選んだ場合は呼び出し側(pickCandidates内)で除外する。
 * 見つかった人数が3人未満の場合も、AIには「水増しせず見つかった分だけ返す」ことを明示する。
 */

import { PREFECTURES } from '@/lib/prefectures'

const MODEL = 'claude-haiku-4-5'

export interface ListIntent {
  prefecture: string | null
  keywords: string[]
}

export interface CandidateInput {
  pro_id: string
  name: string
  title: string | null
  prefecture: string | null
  total_proofs: number
  top_strengths: string[]
  comment_excerpts: string[]
}

export interface PickResult {
  title: string
  comment: string
  picks: Array<{ pro_id: string; reason: string }>
}

/** ANTHROPIC_API_KEY が設定されているか(route側が候補DB探索前に早期判定するために公開)。 */
export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callAnthropicJson(system: string, userText: string): Promise<any | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[referral-ai-list] ANTHROPIC_API_KEY is not set')
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
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: userText }],
      }),
    })

    if (!res.ok) {
      console.error('[referral-ai-list] Anthropic API error status:', res.status)
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

    if (!combined) return null

    // Haikuがコードフェンス(```json ... ```)で包んで返すことがあるため除去してからparseする
    const cleaned = combined.replace(/^```(json)?/i, '').replace(/```$/i, '').trim()

    try {
      return JSON.parse(cleaned)
    } catch (parseErr) {
      console.error('[referral-ai-list] JSON parse error:', parseErr)
      return null
    }
  } catch (err) {
    console.error('[referral-ai-list] Anthropic fetch error:', err)
    return null
  }
}

const INTENT_SYSTEM_PROMPT = `あなたは施術者(トレーナー・治療家・コーチ等)向け紹介リスト作成アシスタントの
意図解析役です。ユーザー(施術者)が自由文で書いた「こんな候補を探したい」という依頼文から、
以下を抽出してください。

1. prefecture: 都道府県レベルの地域(該当する場合のみ)。市区町村名・駅名・エリア名(例: 渋谷、梅田)
   が書かれている場合は、それが含まれる都道府県名に変換する(例: 渋谷→東京都)。地域の指定が
   無い、または都道府県が判断できない場合は null。
2. keywords: 検索キーワード(強みカテゴリ・症状・専門分野・特徴など)の日本語の単語配列。
   多くても6個まで。

出力は次のJSON形式のみ。前置き・説明文・コードフェンスは一切付けないこと:
{"prefecture": "東京都" または null, "keywords": ["腰痛", "..."]}`

/**
 * 自由文から地域・キーワードを抽出する(JSON出力を指示・パース失敗時はnull)。
 * prefectureは実在する都道府県名(src/lib/prefectures.ts)以外が返った場合はnullに落とす
 * (AIが市区町村名等をそのまま返した場合に、専門的地域フィルタが誤って0件化するのを防ぐ)。
 */
export async function parseListIntent(prompt: string): Promise<ListIntent | null> {
  const result = await callAnthropicJson(INTENT_SYSTEM_PROMPT, prompt)
  if (!result || typeof result !== 'object') return null

  const prefecture =
    typeof result.prefecture === 'string' && PREFECTURES.indexOf(result.prefecture) !== -1
      ? result.prefecture
      : null

  const keywords: string[] = []
  if (Array.isArray(result.keywords)) {
    result.keywords.forEach((k: unknown) => {
      if (typeof k === 'string' && k.trim().length > 0 && keywords.length < 6) {
        keywords.push(k.trim())
      }
    })
  }

  return { prefecture, keywords }
}

const PICK_SYSTEM_PROMPT = `あなたは施術者(トレーナー・治療家・コーチ等)向けの紹介リスト作成を手伝う
アシスタントです。入力として、依頼文から抽出した意図(request)と、DBに実在する候補
プロフェッショナルの一覧(candidates。各要素は pro_id/name/title/prefecture/total_proofs/
top_strengths/comment_excerpts)を受け取ります。

ルール(絶対厳守):
1. candidatesに存在する pro_id のみを選ぶこと。一覧に無いプロを創作・言及してはならない。
2. 依頼文に本当に合う人を最大3人まで選ぶ。合う人が1人・2人しか見つからない場合は、
   その人数だけ返すこと(水増し・無関係な候補の追加は絶対禁止。正直に少ない人数を返す方が良い)。
   適切な候補が1人も見つからない場合は picks を空配列にする。
3. 各候補の reason は200字以内の日本語。candidatesに書かれている情報(強み・地域・
   クライアントの声)を根拠にする。一覧に無い実績や資格を創作しないこと。
4. リスト全体の内部用タイトル(title・60字以内)と、クライアント向けの一言コメント
   (comment・500字以内)も作成する。
5. 出力は次のJSON形式のみ。前置き・説明文・コードフェンスは一切付けないこと:
{"title": "...", "comment": "...", "picks": [{"pro_id": "...", "reason": "..."}]}`

/**
 * 候補プロ配列から最大3人 + 推薦理由をAIに選ばせる。
 * 候補に無いプロを捏造しないこと・見つかった分だけ返すことはシステムプロンプトで明示済みだが、
 * 念のため戻り値側でも candidates に無い pro_id は落とす(二重防御)。
 */
export async function pickCandidates(
  intent: ListIntent | null,
  candidates: CandidateInput[]
): Promise<PickResult | null> {
  if (!candidates || candidates.length === 0) {
    return { title: '', comment: '', picks: [] }
  }

  const userText = JSON.stringify({ request: intent, candidates })
  const result = await callAnthropicJson(PICK_SYSTEM_PROMPT, userText)
  if (!result || typeof result !== 'object') return null

  const validIds: Record<string, boolean> = {}
  candidates.forEach((c) => {
    validIds[c.pro_id] = true
  })

  const rawPicks = Array.isArray(result.picks) ? result.picks : []
  const picks: Array<{ pro_id: string; reason: string }> = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawPicks.forEach((p: any) => {
    if (picks.length >= 3) return
    if (!p || typeof p.pro_id !== 'string' || !validIds[p.pro_id]) return
    const reason = typeof p.reason === 'string' ? p.reason.trim().slice(0, 200) : ''
    picks.push({ pro_id: p.pro_id, reason })
  })

  const title = typeof result.title === 'string' ? result.title.trim().slice(0, 60) : ''
  const comment = typeof result.comment === 'string' ? result.comment.trim().slice(0, 500) : ''

  return { title, comment, picks }
}
