import { createHash, randomUUID } from 'crypto'

/**
 * プルーフのハッシュを計算する
 *
 * ハッシュの入力:
 * - voter_email（または normalized_email）
 * - professional_id
 * - vote_type
 * - selected_proof_ids（JSON文字列化してソート済み）
 * - comment
 * - created_at（ISO文字列）
 * - nonce（ランダム文字列）
 * - prev_hash（1つ前のプルーフのハッシュ。最初のプルーフは "GENESIS"）
 */

export interface ProofHashInput {
  voter_email: string
  professional_id: string
  vote_type: string
  selected_proof_ids: string[] | null
  comment: string | null
  created_at: string // ISO 8601
  nonce: string
  prev_hash: string
}

export function computeProofHash(input: ProofHashInput): string {
  const sortedProofIds = input.selected_proof_ids
    ? [...input.selected_proof_ids].sort().join(',')
    : ''

  const payload = [
    input.voter_email,
    input.professional_id,
    input.vote_type,
    sortedProofIds,
    input.comment || '',
    input.created_at,
    input.nonce,
    input.prev_hash,
  ].join('|')

  return createHash('sha256').update(payload).digest('hex')
}

export function generateNonce(): string {
  return randomUUID()
}

/**
 * 最初のプルーフ（チェーンの起点）用の prev_hash 定数
 */
export const GENESIS_HASH = 'GENESIS'

/**
 * ソフトデリート時にハッシュチェーンを維持するための定数
 * 個人情報を消してもハッシュとチェーン構造は残す
 */
export const DELETED_MARKER = '[deleted]'

/**
 * Hash 計算用 created_at format 統一
 *
 * Node.js の Date.toISOString() は "...143Z" (Z 末尾, 常に 3桁 ms) を返すが、
 * Postgres timestamptz を SELECT で取り出すと "...143+00:00" を返し、
 * かつ trailing zeros を trim する (例: ".490" → ".49", ".000" → 省略)。
 *
 * 「INSERT 時 hash 計算」と「verify 時 hash 再計算」を同じ payload にするには、
 * INSERT に渡す createdAt も DB の return 形式に揃える必要がある:
 *   1. "Z" 末尾を "+00:00" に
 *   2. fractional seconds の trailing zeros を trim
 *
 * 例:
 *   '2026-04-03T01:26:19.143Z' → '2026-04-03T01:26:19.143+00:00'
 *   '2026-04-04T00:30:43.490Z' → '2026-04-04T00:30:43.49+00:00'
 *   '2026-04-05T00:00:00.000Z' → '2026-04-05T00:00:00+00:00'
 */
export function normalizeTimestampForHash(ts: string): string {
  let n = ts.replace(/Z$/, '+00:00')
  n = n.replace(/\.(\d+)(\+\d{2}:\d{2})$/, (_match, frac: string, tz: string) => {
    const trimmed = frac.replace(/0+$/, '')
    return trimmed ? `.${trimmed}${tz}` : tz
  })
  return n
}

function classifyTimestampFormat(ts: string): 'Z' | '+00:00' | 'other' {
  if (ts.endsWith('Z')) return 'Z'
  if (ts.endsWith('+00:00')) return '+00:00'
  return 'other'
}

/**
 * 過去 vote の hash 検証用に試すべき created_at 候補リストを生成。
 *
 * 4/3〜5/1 の callback 経由 vote は `new Date().toISOString()` の
 * `.XXXZ` (3桁 ms padding + Z) で hash 計算済。これに加えて DB return 形式の
 * trim 後 ('.XX+00:00' など) と相互変換した候補を網羅する。
 */
export function buildCreatedAtCandidates(
  ts: string
): Array<{ key: 'Z' | '+00:00' | 'other'; ts: string }> {
  const out: Array<{ key: 'Z' | '+00:00' | 'other'; ts: string }> = []
  const seen = new Set<string>()
  const push = (key: 'Z' | '+00:00' | 'other', t: string) => {
    if (seen.has(t)) return
    seen.add(t)
    out.push({ key, ts: t })
  }

  // 1. as-is
  push(classifyTimestampFormat(ts), ts)
  // 2. timezone 切替 (+00:00 ⇔ Z)
  if (ts.endsWith('+00:00')) push('Z', ts.replace(/\+00:00$/, 'Z'))
  if (ts.endsWith('Z')) push('+00:00', ts.replace(/Z$/, '+00:00'))
  // 3. fractional seconds が 1〜2桁なら 3桁に padding (DB trailing zero trim 復元)
  const paddedMs = ts.replace(
    /\.(\d{1,2})([+-Z])/,
    (_m, frac: string, after: string) => `.${frac.padEnd(3, '0')}${after}`
  )
  if (paddedMs !== ts) {
    push(classifyTimestampFormat(paddedMs), paddedMs)
    if (paddedMs.endsWith('+00:00')) push('Z', paddedMs.replace(/\+00:00$/, 'Z'))
    if (paddedMs.endsWith('Z')) push('+00:00', paddedMs.replace(/Z$/, '+00:00'))
  }
  // 4. fractional seconds が無いなら .000 を補って試す (秒ピッタリ vote の trim 対応)
  const noFrac = ts.match(/^(.*?:\d{2})([+-Z].*)$/)
  if (noFrac && !ts.includes('.')) {
    const [, before, after] = noFrac
    const ms3 = `${before}.000${after}`
    push(classifyTimestampFormat(ms3), ms3)
    if (ms3.endsWith('+00:00')) push('Z', ms3.replace(/\+00:00$/, 'Z'))
  }
  return out
}

/**
 * チェーンの整合性を検証する
 * votes配列は created_at 昇順でソート済みであること
 */
export function verifyChain(
  votes: Array<{
    voter_email: string
    professional_id: string
    vote_type: string
    selected_proof_ids: string[] | null
    comment: string | null
    created_at: string
    proof_nonce: string
    proof_hash: string
    prev_hash: string
  }>
): {
  valid: boolean
  brokenAt?: number
  formats: Record<'Z' | '+00:00' | 'other', number>
} {
  // どの created_at format で hash 一致したかの集計
  // - '+00:00': DB 返却値そのまま (migrate 経由 vote / 今後の callback 経由 vote)
  // - 'Z'     : Node.js Date.toISOString() 形式 (4/3〜5/1 の callback 経由 vote の互換)
  // - 'other' : 想定外 format (調査の手がかり)
  const formats: Record<'Z' | '+00:00' | 'other', number> = {
    'Z': 0,
    '+00:00': 0,
    'other': 0,
  }

  for (let i = 0; i < votes.length; i++) {
    const vote = votes[i]

    // prev_hash の整合性チェック
    if (i === 0) {
      if (vote.prev_hash !== GENESIS_HASH) {
        return { valid: false, brokenAt: i, formats }
      }
    } else {
      if (vote.prev_hash !== votes[i - 1].proof_hash) {
        return { valid: false, brokenAt: i, formats }
      }
    }

    // ソフトデリート済み (voter_email または comment が DELETED_MARKER):
    // ハッシュ再計算はスキップ、チェーンリンク (prev_hash) のみ検証する。
    // - voter_email === '[deleted]' : ADMIN フル ソフトデリート (admin/soft-delete-vote)
    // - comment === '[deleted]'     : プロによるコメント削除 (dashboard/voices/.../remove-comment)
    if (vote.voter_email === DELETED_MARKER || vote.comment === DELETED_MARKER) {
      continue
    }

    // 過去の不整合 (4/3〜5/1) 互換: vote.created_at の format 候補を網羅し、
    // いずれか一致すれば valid とする。format breakdown も同時に集計。
    let matched: 'Z' | '+00:00' | 'other' | null = null
    for (const { key, ts } of buildCreatedAtCandidates(vote.created_at)) {
      const recomputed = computeProofHash({
        voter_email: vote.voter_email,
        professional_id: vote.professional_id,
        vote_type: vote.vote_type,
        selected_proof_ids: vote.selected_proof_ids,
        comment: vote.comment,
        created_at: ts,
        nonce: vote.proof_nonce,
        prev_hash: vote.prev_hash,
      })
      if (recomputed === vote.proof_hash) {
        matched = key
        break
      }
    }

    if (matched === null) {
      return { valid: false, brokenAt: i, formats }
    }
    formats[matched]++
  }

  return { valid: true, formats }
}
