/**
 * 大量IDに対する `.in()` クエリを安全にスケールさせる共通ヘルパー。
 *
 * 真因(2026-08): `/api/search` 等で `.in(proIds)` にチャンク分割が無くURL長/パラメータ数の
 * リスクがある上、Supabaseの暗黙 max-rows=1000 キャップにより1000行超のデータが無音truncate
 * される実装が複数箇所に存在した(fetchAllVotesPaginatedがproIdsを一度も使っていない等)。
 *
 * 二重対策:
 *   ① IN句の要素数を `IN_CLAUSE_CHUNK_SIZE`(100件)ずつに分割する(既存 payouts/route.ts と同じ値)
 *   ② 各チャンク内で `.range()` により1000行キャップを回避し、空ページに当たるまで全件取得する
 *
 * 呼び出し側は `buildQuery(chunkIds, from, to)` で「そのチャンク・そのrangeに対応する
 * Supabaseクエリ」を返す関数を渡す(`.eq()`等の追加フィルタは呼び出し側で自由に付けられる)。
 * CLAUDE.mdの規律により、buildQuery内では必ず決定的な `.order(...)` を付けること
 * (ORDER BYの無いLIMIT/rangeは非決定的で intermittent バグの元)。対象テーブルに `id` が無い
 * VIEW(例: vote_summary)の場合は、複合キー等の別カラムで代替してよい。
 *
 * 既存の正しくページネーション済みの実装(referral-data.ts の getDistinctSupporterCounts、
 * referral-delegate-criteria.ts の getLastProofDates、card-data.ts の supportersRaw)は
 * このヘルパーへの移行対象ではない(触らない)。
 */

export const IN_CLAUSE_CHUNK_SIZE = 100

export function chunkArray<T>(arr: T[], size: number = IN_CLAUSE_CHUNK_SIZE): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

interface ChunkedQueryResult<T> {
  data: T[] | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: any
}

export async function selectInChunks<T = unknown>(
  ids: string[],
  buildQuery: (chunkIds: string[], from: number, to: number) => PromiseLike<ChunkedQueryResult<T>>,
  chunkSize: number = IN_CLAUSE_CHUNK_SIZE
): Promise<T[]> {
  if (!ids || ids.length === 0) return []

  const all: T[] = []
  const pageSize = 1000

  for (const chunk of chunkArray(ids, chunkSize)) {
    let from = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await buildQuery(chunk, from, from + pageSize - 1)
      if (error) {
        console.error('[selectInChunks] query error:', error)
        break
      }
      if (!data || data.length === 0) break
      all.push(...data)
      if (data.length < pageSize) break
      from += pageSize
    }
  }

  return all
}

// ============================================================
// X-Day対応(2026-08-08・CEO GO): /api/search の votes 全件JS集計を Postgres 側集計(RPC)へ移行
// するための呼び出しヘルパー。migration 059_search_aggregates.sql の2関数に対応する。
//
// fail-soft 必須: RPC 未作成(42883)・権限・その他あらゆるエラー時は null を返し、
// 呼び出し側(route.ts)が従来のJS集計へフォールバックする。検索は公開機能のため、
// SQL未実行の環境でも絶対に落とさない。
//
// max-rows対策: PostgREST の行数キャップは .rpc() の戻り値にも効き得るため、
// p_pro_ids を RPC_CHUNK_SIZE 件ずつに分割して呼ぶ(戻り行数 = チャンク内のプロ数 ≦ 500 < 1000)。
// ============================================================

export const RPC_CHUNK_SIZE = 500

/** search_pro_vote_aggregates が返す1行(プロ単位の votes 集計)。 */
export interface SearchProVoteAggregate {
  professional_id: string
  total_proofs: number
  recent_proofs_30d: number
  rising_7d: number
  last_proof_at: string | null
  latest_comment: string | null
  /** proof_item_id -> 票数(vote_type='proof'のみ・selected_proof_ids展開) */
  item_vote_counts: Record<string, number> | null
  /** 同・直近30日分 */
  item_vote_counts_30d: Record<string, number> | null
  /** proof_item_id -> 人数(DISTINCT COALESCE(normalized_email, vote id)) */
  item_voter_counts: Record<string, number> | null
  /** personality_item_id -> 票数(vote_type='proof'のみ) */
  personality_counts: Record<string, number> | null
  unique_voters: number
  first_count: number
  repeater_count: number
  regular_count: number
}

export async function fetchSearchAggregates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  proIds: string[]
): Promise<Map<string, SearchProVoteAggregate> | null> {
  if (!proIds || proIds.length === 0) return new Map()
  const map = new Map<string, SearchProVoteAggregate>()
  try {
    for (const chunk of chunkArray(proIds, RPC_CHUNK_SIZE)) {
      const { data, error } = await supabase.rpc('search_pro_vote_aggregates', { p_pro_ids: chunk })
      if (error) {
        // 42883 = function does not exist(migration未実行)。それ以外も含め全てフォールバック。
        console.warn('[fetchSearchAggregates] rpc error (fallback to JS aggregation):', error?.code, error?.message)
        return null
      }
      for (const row of data || []) {
        map.set(row.professional_id, row as SearchProVoteAggregate)
      }
    }
    return map
  } catch (err) {
    console.warn('[fetchSearchAggregates] rpc threw (fallback to JS aggregation):', err)
    return null
  }
}

/** search_voice_matches が返す1行(コメント検索マッチ)。 */
export interface VoiceMatchAggregate {
  professional_id: string
  match_count: number
  first_comment: string | null
}

export async function fetchVoiceMatches(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  proIds: string[],
  query: string
): Promise<Map<string, VoiceMatchAggregate> | null> {
  if (!proIds || proIds.length === 0 || !query) return new Map()
  const map = new Map<string, VoiceMatchAggregate>()
  try {
    for (const chunk of chunkArray(proIds, RPC_CHUNK_SIZE)) {
      const { data, error } = await supabase.rpc('search_voice_matches', { p_pro_ids: chunk, p_query: query })
      if (error) {
        console.warn('[fetchVoiceMatches] rpc error (fallback to JS aggregation):', error?.code, error?.message)
        return null
      }
      for (const row of data || []) {
        map.set(row.professional_id, row as VoiceMatchAggregate)
      }
    }
    return map
  } catch (err) {
    console.warn('[fetchVoiceMatches] rpc threw (fallback to JS aggregation):', err)
    return null
  }
}
