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
