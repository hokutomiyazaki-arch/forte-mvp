/**
 * 一回限り backfill: Clerk の揮発URL → Supabase Storage の永続URL
 *
 * professionals.photo_url（≈214件）と votes.client_photo_url（≈28件・--votes時のみ）に
 * 焼かれている Clerk の揮発する外部URLを、Supabase Storage にコピーした永続URLに置き換える。
 * 既に失効（NoSuchKey/404）しているものは回復不能として null 化（フロントのイニシャル表示へ）。
 *
 * 実行:
 *   npx tsx scripts/backfill-clerk-photos.ts --dry-run   # 読み取りのみで分類（DB/Storage非変更）
 *   npx tsx scripts/backfill-clerk-photos.ts             # 本実行（プロ写真のみ）
 *   npx tsx scripts/backfill-clerk-photos.ts --votes     # 投票写真パスも有効化
 *
 * 安全装置:
 *   - 1行ごとに try/catch。失敗行は [BACKFILL][error] でログしてスキップ → 次行へ
 *     （移行で消えた user_id だと clerk.users.getUser が例外を投げる。全体クラッシュで
 *      中途半端な本番状態にしないため、絶対に1行で止めない）。集計に errors を含める。
 *   - 本実行時、対象行を scripts/backfill-snapshot-<ts>.json にスナップショット（復元用 / PITR無し対策）
 *   - --dry-run は DB も Storage も snapshot も一切触らない。各行を「実際に GET で読み取って」
 *     existing / clerk / null に分類し、内訳と null一覧（プロ name+id）を出力する。
 *   - 冪等: 完了行は photo_url が '%clerk%' に該当しなくなるので再実行でスキップ
 *
 * ⚠️ このスクリプトは「作成のみ」。実行はほくとが手動で（--dry-run で件数確認 → 本実行）。
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

type ProRow = { id: string; user_id: string | null; photo_url: string | null; name: string | null }
type VoteRow = { id: string; client_photo_url: string | null }
type SnapshotEntry = { table: string; id: string; user_id: string | null; old_value: string | null }

/**
 * dry-run 用: URL が実際に GET 取得できるか（res.ok）だけを確認する読み取り専用プローブ。
 * Storage upload も DB 更新も行わない。falsy / 例外 / 非ok はすべて false。
 */
async function probe(url: string | null | undefined): Promise<boolean> {
  if (!url) return false
  try {
    const res = await fetch(url, { cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

// 対象行を全件メモリにロード（処理中の UPDATE で結果セットがずれる問題を避けるため、先に全件確定）
async function loadProRows(): Promise<ProRow[]> {
  const all: ProRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('professionals')
      .select('id, user_id, photo_url, name')
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
  let fromExisting = 0 // 既存URLが生きていて永続化できる/できた
  let fromClerk = 0 // 既存は死んでいたが Clerk 再取得で回復できる/できた
  let nulled = 0 // 回復不能 → null になる/なった
  let errors = 0 // 1行処理が例外で失敗（user_id消失等）
  const nullList: { name: string | null; id: string }[] = []
  const total = rows.length

  for (let i = 0; i < total; i++) {
    const row = rows[i]
    const tag = `[BACKFILL][pro] ${i + 1}/${total} id=${row.id}`

    try {
      // ---- dry-run: GET で読み取って分類するだけ（DB/Storage非変更）----
      if (dryRun) {
        let cls: 'existing' | 'clerk' | 'null'
        if (await probe(row.photo_url)) {
          cls = 'existing'
        } else {
          let freshUrl: string | null = null
          if (row.user_id) {
            const u = await clerk.users.getUser(row.user_id)
            freshUrl = u.imageUrl ?? null
          }
          cls = (await probe(freshUrl)) ? 'clerk' : 'null'
        }
        if (cls === 'existing') fromExisting++
        else if (cls === 'clerk') fromClerk++
        else {
          nulled++
          nullList.push({ name: row.name, id: row.id })
        }
        console.log(`${tag} [dry-run] class=${cls}`)
        continue
      }

      // ---- live: persist（fetch+upload）して UPDATE ----
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
        const u = await clerk.users.getUser(row.user_id)
        newUrl = await persistExternalImage({
          sourceUrl: u.imageUrl ?? null,
          bucket: 'avatars',
          path: `${row.user_id}/avatar.jpg`,
          cacheBust: true,
        })
        if (newUrl) source = 'clerk'
      }

      // 3. 成功なら永続URL、失敗なら null に UPDATE
      const { error } = await supabase
        .from('professionals')
        .update({ photo_url: newUrl })
        .eq('id', row.id)
        .select('id')
        .maybeSingle()
      if (error) throw new Error(`UPDATE failed: ${error.message}`)

      if (source === 'existing') fromExisting++
      else if (source === 'clerk') fromClerk++
      else {
        nulled++
        nullList.push({ name: row.name, id: row.id })
      }
      console.log(`${tag} done (source=${source})`)
    } catch (e) {
      errors++
      console.warn('[BACKFILL][error]', {
        table: 'professionals',
        id: row.id,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return { fromExisting, fromClerk, nulled, errors, total, nullList }
}

async function processVotes(rows: VoteRow[]) {
  let fromExisting = 0
  let nulled = 0
  let errors = 0
  const total = rows.length

  for (let i = 0; i < total; i++) {
    const row = rows[i]
    const tag = `[BACKFILL][vote] ${i + 1}/${total} id=${row.id}`

    try {
      // クライアントは Clerk 再取得しない（追えない）。existing or null の2分類。
      if (dryRun) {
        const cls = (await probe(row.client_photo_url)) ? 'existing' : 'null'
        if (cls === 'existing') fromExisting++
        else nulled++
        console.log(`${tag} [dry-run] class=${cls}`)
        continue
      }

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
      if (error) throw new Error(`UPDATE failed: ${error.message}`)

      if (newUrl) fromExisting++
      else nulled++
      console.log(`${tag} done (source=${newUrl ? 'existing' : 'null'})`)
    } catch (e) {
      errors++
      console.warn('[BACKFILL][error]', {
        table: 'votes',
        id: row.id,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return { fromExisting, nulled, errors, total }
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
    console.log('[backfill] dry-run: no snapshot, no DB/Storage writes (read-only probing)')
  }

  const proResult = await processPros(proRows)
  const voteResult = doVotes ? await processVotes(voteRows) : null

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log('')
  console.log('======== Backfill Summary ========')
  console.log(`Mode: ${dryRun ? 'DRY-RUN (read-only probing, no writes)' : 'LIVE'}`)

  if (dryRun) {
    console.log(
      `Professionals (dry-run): existing: ${proResult.fromExisting} / clerk: ${proResult.fromClerk} / null: ${proResult.nulled} / errors: ${proResult.errors}  (total=${proResult.total})`
    )
  } else {
    console.log(
      `Professionals: total=${proResult.total}, persisted=${proResult.fromExisting}, recovered=${proResult.fromClerk}, nulled=${proResult.nulled}, errors=${proResult.errors}`
    )
  }

  // null になる/なったプロ一覧（本番前にほくとが目視する）
  if (proResult.nullList.length > 0) {
    console.log('')
    console.log(`--- Professionals that WILL/DID become null (${proResult.nullList.length}) ---`)
    for (const p of proResult.nullList) {
      console.log(`  null  id=${p.id}  name=${p.name ?? '(no name)'}`)
    }
  }

  if (voteResult) {
    console.log('')
    if (dryRun) {
      console.log(
        `Votes (dry-run): existing: ${voteResult.fromExisting} / null: ${voteResult.nulled} / errors: ${voteResult.errors}  (total=${voteResult.total})`
      )
    } else {
      console.log(
        `Votes: total=${voteResult.total}, persisted=${voteResult.fromExisting}, nulled=${voteResult.nulled}, errors=${voteResult.errors}`
      )
    }
  } else {
    console.log('')
    console.log('Votes: skipped (pass --votes to enable)')
  }

  console.log('')
  console.log(`Elapsed: ${elapsed}s`)
  console.log('==================================')
}

main().catch((err) => {
  console.error('[backfill-clerk-photos] fatal:', err)
  process.exit(1)
})
