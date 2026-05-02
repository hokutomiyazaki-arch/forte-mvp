/**
 * バックアップ JSON から votes.prev_hash / proof_hash を復元
 *
 * 実行方法:
 *   dry-run (default):
 *     BACKUP_FILE=backups/votes-pre-r3-20260502-0900.json \
 *       npx tsx scripts/rollback-from-backup.ts
 *   本実行:
 *     DRY_RUN=false BACKUP_FILE=backups/votes-pre-r3-20260502-0900.json \
 *       npx tsx scripts/rollback-from-backup.ts
 *
 * 処理:
 *   1. BACKUP_FILE から votes 配列 (= バックアップ取得時の状態) を読み込む
 *   2. 現 DB の id, prev_hash, proof_hash を全件取得
 *   3. 各 vote の (prev_hash, proof_hash) を比較し、差分のみ復元対象に絞る
 *   4. DRY_RUN=true: 件数 + sample 5 件の差分を出力
 *      DRY_RUN=false: 差分のある vote について UPDATE で復元
 *
 * !!! .env.local の中身は出力しない !!!
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { readFileSync, existsSync } from 'fs'

dotenv.config({ path: '.env.local' })

const DRY_RUN = process.env.DRY_RUN !== 'false'
const BACKUP_FILE = process.env.BACKUP_FILE

interface BackupVote {
  id: string
  prev_hash: string | null
  proof_hash: string | null
  [key: string]: unknown
}

async function main() {
  if (!BACKUP_FILE) {
    console.error('❌ BACKUP_FILE 未指定')
    console.error('   例: BACKUP_FILE=backups/votes-pre-r3-XXXX.json npx tsx scripts/rollback-from-backup.ts')
    process.exit(1)
  }
  if (!existsSync(BACKUP_FILE)) {
    console.error(`❌ file not found: ${BACKUP_FILE}`)
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('❌ env var missing')
    process.exit(1)
  }
  const supabase = createClient(url, serviceKey)

  console.log(`🔄 Rollback from backup (DRY_RUN=${DRY_RUN})`)
  console.log(`   file: ${BACKUP_FILE}`)

  const raw = readFileSync(BACKUP_FILE, 'utf-8')
  const json = JSON.parse(raw) as { timestamp?: string; votes?: BackupVote[] }
  const backupVotes = (json.votes || []) as BackupVote[]
  if (backupVotes.length === 0) {
    console.error('❌ backup file に votes 配列がない or 空')
    process.exit(1)
  }
  console.log(`   backup taken: ${json.timestamp ?? '(unknown)'}`)
  console.log(`   backup rows:  ${backupVotes.length}`)

  // 現 DB から id, prev_hash, proof_hash を全件取得 (1000 行制限を chunk で回避)
  const PAGE = 1000
  let from = 0
  const currentMap = new Map<
    string,
    { prev_hash: string | null; proof_hash: string | null }
  >()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('votes')
      .select('id, prev_hash, proof_hash')
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('❌ fetch error:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    for (const r of data as Array<{
      id: string
      prev_hash: string | null
      proof_hash: string | null
    }>) {
      currentMap.set(r.id, { prev_hash: r.prev_hash, proof_hash: r.proof_hash })
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  console.log(`   current rows: ${currentMap.size}`)
  console.log('')

  // 差分検出
  interface Diff {
    id: string
    backupPrev: string | null
    currentPrev: string | null
    backupHash: string | null
    currentHash: string | null
  }
  const diffs: Diff[] = []
  let missing = 0
  for (const bv of backupVotes) {
    const cur = currentMap.get(bv.id)
    if (!cur) {
      missing++
      continue
    }
    if (cur.prev_hash !== bv.prev_hash || cur.proof_hash !== bv.proof_hash) {
      diffs.push({
        id: bv.id,
        backupPrev: bv.prev_hash,
        currentPrev: cur.prev_hash,
        backupHash: bv.proof_hash,
        currentHash: cur.proof_hash,
      })
    }
  }

  console.log(`📊 復元対象 (差分あり):                      ${diffs.length} 件`)
  console.log(`   backup に存在するが現 DB にない (孤児):   ${missing} 件`)
  console.log('')

  if (diffs.length > 0) {
    console.log('=== sample (最大 5 件) ===')
    for (const d of diffs.slice(0, 5)) {
      console.log(`  id=${d.id}`)
      console.log(`    prev: ${d.currentPrev}`)
      console.log(`       → ${d.backupPrev}`)
      console.log(`    hash: ${d.currentHash}`)
      console.log(`       → ${d.backupHash}`)
    }
    if (diffs.length > 5) {
      console.log(`   ... and ${diffs.length - 5} more`)
    }
    console.log('')
  }

  if (DRY_RUN) {
    console.log('🔵 DRY_RUN — 復元なし')
    console.log('   本実行: DRY_RUN=false BACKUP_FILE=... npx tsx scripts/rollback-from-backup.ts')
    return
  }

  if (diffs.length === 0) {
    console.log('差分なし → 復元不要')
    return
  }

  // ===== LIVE ROLLBACK =====
  console.log('🟢 LIVE — Rollback UPDATE 実行開始')
  let ok = 0
  let fail = 0
  for (const d of diffs) {
    const { error: upErr } = await supabase
      .from('votes')
      .update({
        prev_hash: d.backupPrev,
        proof_hash: d.backupHash,
      })
      .eq('id', d.id)
    if (upErr) {
      console.error(`❌ Failed ${d.id}: ${upErr.message}`)
      fail++
      continue
    }
    ok++
    if (ok % 50 === 0) {
      console.log(`  ...rolled back ${ok}/${diffs.length}`)
    }
  }
  console.log('')
  console.log(`✅ Rollback 完了: ${ok} 件成功 / ${fail} 件失敗`)
}

main().catch((err) => {
  console.error('❌ Unhandled:', err)
  process.exit(1)
})
