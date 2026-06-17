/**
 * 一回限り backfill: Clerk の揮発URL → Supabase Storage の永続URL
 *
 * professionals.photo_url（≈214件）と votes.client_photo_url（≈28件・--votes時のみ）に
 * 焼かれている Clerk の揮発する外部URLを、Supabase Storage にコピーした永続URLに置き換える。
 * 既に失効（NoSuchKey/404）しているものは回復不能として null 化（フロントのイニシャル表示へ）。
 *
 * 実行:
 *   npx tsx scripts/backfill-clerk-photos.ts --dry-run   # 触らずログのみ（件数確認）
 *   npx tsx scripts/backfill-clerk-photos.ts             # 本実行（プロ写真のみ）
 *   npx tsx scripts/backfill-clerk-photos.ts --votes     # 投票写真パスも有効化
 *
 * 安全装置:
 *   - 本実行時、対象行を scripts/backfill-snapshot-<ts>.json にスナップショット（復元用 / PITR無し対策）
 *   - --dry-run は DB も Storage も一切触らない（何をするかログ出力するだけ）
 *   - 冪等: 完了行は photo_url が '%clerk%' に該当しなくなるので再実行でスキップ
 *
 * ⚠️ このスクリプトは「作成のみ」。実行はほくとが手動で（--dry-run → 件数確認 → 本実行）。
 */
import { createClient } from '@supabase/supabase-js'
import { createClerkClient } from '@clerk/backend'
import { randomUUID } from 'crypto'
import { writeFileSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'
import { persistExternalImage } from '../src/lib/server-image'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const CLERK_SECRET = process.env.CLERK_SECRET_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
if (!CLERK_SECRET) {
  console.error('Missing CLERK_SECRET_KEY in .env.local (needed to re-fetch fresh imageUrl)')
  process.exit(1)
}

const dryRun = process.argv.includes('--dry-run')
const doVotes = process.argv.includes('--votes')

// persistExternalImage は内部で getSupabaseAdmin()（同じ env を読む）を使うので、
// dotenv.config 済みであればそのまま動く。下の supabase は SELECT/UPDATE 用。
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const clerk = createClerkClient({ secretKey: CLERK_SECRET })

const PAGE = 1000

type ProRow = { id: string; user_id: string | null; photo_url: string | null }
type VoteRow = { id: string; client_photo_url: string | null }
type SnapshotEntry = { table: string; id: string; user_id: string | null; old_value: string | null }

// 対象行を全件メモリにロード（処理中の UPDATE で結果セットがずれる問題を避けるため、先に全件確定）
async function loadProRows(): Promise<ProRow[]> {
  const all: ProRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('professionals')
      .select('id, user_id, photo_url')
      .ilike('photo_url', '%clerk%')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as ProRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

async function loadVoteRows(): Promise<VoteRow[]> {
  const all: VoteRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('votes')
      .select('id, client_photo_url')
      .ilike('client_photo_url', '%clerk%')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as VoteRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

function writeSnapshot(entries: SnapshotEntry[]): string {
  const path = join('scripts', `backfill-snapshot-${Date.now()}.json`)
  writeFileSync(path, JSON.stringify(entries, null, 2), 'utf-8')
  return path
}

async function processPros(rows: ProRow[]) {
  let persisted = 0 // 既存URLが生きていて永続化できた
  let recovered = 0 // 既存は死んでいたが Clerk 再取得で永続化できた
  let nulled = 0 // 回復不能 → null 化
  const total = rows.length

  for (let i = 0; i < total; i++) {
    const row = rows[i]
    const tag = `[BACKFILL][pro] ${i + 1}/${total} id=${row.id}`

    if (dryRun) {
      console.log(`${tag} [dry-run] would: persist existing photo_url → fallback Clerk(user_id=${row.user_id ?? 'none'}) → null`)
      continue
    }

    // 1. 既存 photo_url を avatars に永続化（生きていればこれで完了）
    let newUrl = await persistExternalImage({
      sourceUrl: row.photo_url,
      bucket: 'avatars',
      path: `${row.user_id}/avatar.jpg`,
      cacheBust: true,
    })
    let source: 'existing' | 'clerk' | 'null' = newUrl ? 'existing' : 'null'

    // 2. null（=404等）なら Clerk から最新 imageUrl を取り直して再試行
    if (!newUrl && row.user_id) {
      try {
        const u = await clerk.users.getUser(row.user_id)
        newUrl = await persistExternalImage({
          sourceUrl: u.imageUrl ?? null,
          bucket: 'avatars',
          path: `${row.user_id}/avatar.jpg`,
          cacheBust: true,
        })
        if (newUrl) source = 'clerk'
      } catch (e) {
        console.warn(`${tag} clerk getUser failed:`, e instanceof Error ? e.message : e)
      }
    }

    // 3. 成功なら永続URL、失敗なら null に UPDATE
    const { error } = await supabase
      .from('professionals')
      .update({ photo_url: newUrl })
      .eq('id', row.id)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error(`${tag} UPDATE failed:`, error.message)
      continue
    }

    if (source === 'existing') persisted++
    else if (source === 'clerk') recovered++
    else nulled++
    console.log(`${tag} done (source=${source})`)
  }

  return { persisted, recovered, nulled, total }
}

async function processVotes(rows: VoteRow[]) {
  let persisted = 0
  let nulled = 0
  const total = rows.length

  for (let i = 0; i < total; i++) {
    const row = rows[i]
    const tag = `[BACKFILL][vote] ${i + 1}/${total} id=${row.id}`

    if (dryRun) {
      console.log(`${tag} [dry-run] would: persist existing client_photo_url → null (no Clerk refetch for clients)`)
      continue
    }

    // クライアントは Clerk 再取得しない（追えない）。既存URLが生きていれば永続化、ダメなら null。
    const newUrl = await persistExternalImage({
      sourceUrl: row.client_photo_url,
      bucket: 'client-photos',
      path: `photos/migrated-${randomUUID()}.jpg`,
    })

    const { error } = await supabase
      .from('votes')
      .update({ client_photo_url: newUrl })
      .eq('id', row.id)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error(`${tag} UPDATE failed:`, error.message)
      continue
    }

    if (newUrl) persisted++
    else nulled++
    console.log(`${tag} done (source=${newUrl ? 'existing' : 'null'})`)
  }

  return { persisted, nulled, total }
}

async function main() {
  const startedAt = Date.now()
  console.log(`[backfill-clerk-photos] starting (dryRun=${dryRun}, votes=${doVotes})`)

  console.log('[backfill] loading professionals with clerk photo_url...')
  const proRows = await loadProRows()
  console.log(`[backfill] professionals to process: ${proRows.length}`)

  const voteRows = doVotes ? await loadVoteRows() : []
  if (doVotes) console.log(`[backfill] votes to process: ${voteRows.length}`)

  // スナップショット（本実行のみ・処理前に取得）
  if (!dryRun) {
    const entries: SnapshotEntry[] = [
      ...proRows.map((r) => ({ table: 'professionals', id: r.id, user_id: r.user_id, old_value: r.photo_url })),
      ...voteRows.map((r) => ({ table: 'votes', id: r.id, user_id: null, old_value: r.client_photo_url })),
    ]
    const snapPath = writeSnapshot(entries)
    console.log(`[backfill] snapshot saved: ${snapPath} (${entries.length} rows)`)
  } else {
    console.log('[backfill] dry-run: no snapshot, no DB/Storage writes')
  }

  const proResult = await processPros(proRows)
  const voteResult = doVotes ? await processVotes(voteRows) : null

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log('')
  console.log('======== Backfill Summary ========')
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'LIVE'}`)
  console.log(`Professionals: total=${proResult.total}, persisted=${proResult.persisted}, recovered=${proResult.recovered}, nulled=${proResult.nulled}`)
  if (voteResult) {
    console.log(`Votes:         total=${voteResult.total}, persisted=${voteResult.persisted}, nulled=${voteResult.nulled}`)
  } else {
    console.log('Votes:         skipped (pass --votes to enable)')
  }
  console.log(`Elapsed: ${elapsed}s`)
  console.log('==================================')
}

main().catch((err) => {
  console.error('[backfill-clerk-photos] fatal:', err)
  process.exit(1)
})
