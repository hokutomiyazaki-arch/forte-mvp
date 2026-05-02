/**
 * R-3 連鎖修正: #354 (b5d05dd7) から #923 までの prev_hash / proof_hash 再計算
 *
 * 実行方法:
 *   dry-run (default):  npx tsx scripts/repair-chain-from-354.ts
 *   本実行:             DRY_RUN=false npx tsx scripts/repair-chain-from-354.ts
 *
 * バックアップ前提: backups/votes-pre-r3-YYYYMMDD-HHMM.json が事前取得済であること。
 *
 * 処理:
 *   1. votes (vote_type='proof', proof_hash IS NOT NULL) を created_at ASC で fetch
 *   2. votes[353].proof_hash (= 現 #353.proof_hash) を起点 prev とする
 *   3. i=354 から #923 まで:
 *      - soft-delete vote (voter_email or comment === '[deleted]'):
 *          proof_hash は維持、prev_hash のみ新 chain で更新
 *          次の prev は v.proof_hash (既存値、verify 時 skip 対象)
 *      - 通常 vote:
 *          created_at を +00:00 統一 (normalizeTimestampForHash) で payload 構築
 *          newHash = computeProofHash(...)
 *          prev_hash と proof_hash を両方 UPDATE
 *          次の prev は newHash
 *   4. DRY_RUN=true ならログのみ、DRY_RUN=false なら DB UPDATE 実行
 *
 * !!! .env.local の中身は絶対に出力しない !!!
 */
import { createClient } from '@supabase/supabase-js'
import {
  computeProofHash,
  normalizeTimestampForHash,
  DELETED_MARKER,
} from '../src/lib/proof-chain'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const DRY_RUN = process.env.DRY_RUN !== 'false'
const REPAIR_FROM_INDEX = 354
const REPAIR_FROM_ID_EXPECTED = 'b5d05dd7-4cbb-4b36-ac8b-8962a0234812'

interface VoteRow {
  id: string
  voter_email: string | null
  normalized_email: string | null
  professional_id: string
  vote_type: string
  selected_proof_ids: string[] | null
  comment: string | null
  created_at: string
  proof_nonce: string
  proof_hash: string
  prev_hash: string
}

interface PlannedUpdate {
  idx: number
  id: string
  oldPrev: string
  newPrev: string
  oldHash: string
  newHash: string
  tsUsed: string
  softDeleted: boolean
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('❌ env var missing')
    process.exit(1)
  }
  const supabase = createClient(url, serviceKey)

  console.log(`🔧 R-3 連鎖修正 (DRY_RUN=${DRY_RUN})`)
  console.log(`   start index = ${REPAIR_FROM_INDEX}`)
  console.log(`   expected id = ${REPAIR_FROM_ID_EXPECTED}`)
  console.log('---')

  // verify route と完全に同じ select / order
  const { data, error } = await supabase
    .from('votes')
    .select(
      'id, voter_email, normalized_email, professional_id, vote_type, selected_proof_ids, comment, created_at, proof_nonce, proof_hash, prev_hash'
    )
    .eq('vote_type', 'proof')
    .not('proof_hash', 'is', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('❌ fetch error:', error.message)
    process.exit(1)
  }
  const votes = (data || []) as VoteRow[]
  console.log(`Fetched ${votes.length} proofs`)

  // sanity: REPAIR_FROM_INDEX の vote が想定 id か
  if (votes.length <= REPAIR_FROM_INDEX) {
    console.error(`❌ index ${REPAIR_FROM_INDEX} out of bounds (length=${votes.length})`)
    process.exit(1)
  }
  const startVote = votes[REPAIR_FROM_INDEX]
  if (startVote.id !== REPAIR_FROM_ID_EXPECTED) {
    console.error(
      `❌ index ${REPAIR_FROM_INDEX} の id=${startVote.id} が期待 id ${REPAIR_FROM_ID_EXPECTED} と異なる`
    )
    console.error('   並び順が変わっている可能性。中止して再調査。')
    process.exit(1)
  }
  console.log(`✅ start vote id 一致: ${startVote.id}`)
  console.log('')

  // 起点 prev_hash = 現 #353.proof_hash (このスクリプトでは触らない)
  let prev = votes[REPAIR_FROM_INDEX - 1].proof_hash
  console.log(`起点 prev_hash (= #${REPAIR_FROM_INDEX - 1}.proof_hash) = ${prev}`)
  console.log('')

  const planned: PlannedUpdate[] = []
  let softDelCount = 0

  for (let i = REPAIR_FROM_INDEX; i < votes.length; i++) {
    const v = votes[i]
    const effectiveEmail = v.normalized_email || v.voter_email || ''
    const isSoftDeleted =
      effectiveEmail === DELETED_MARKER || v.comment === DELETED_MARKER

    if (isSoftDeleted) {
      // proof_hash 維持、prev_hash のみ更新
      planned.push({
        idx: i,
        id: v.id,
        oldPrev: v.prev_hash,
        newPrev: prev,
        oldHash: v.proof_hash,
        newHash: v.proof_hash, // 既存維持
        tsUsed: v.created_at,
        softDeleted: true,
      })
      softDelCount++
      // 次の prev は既存 proof_hash (verifyChain は skip するが prev_hash チェーン上は維持)
      prev = v.proof_hash
      continue
    }

    // +00:00 統一 (DB return が既に +00:00 でも安全のため通す)
    const tsUsed = normalizeTimestampForHash(v.created_at)
    const newHash = computeProofHash({
      voter_email: effectiveEmail,
      professional_id: v.professional_id,
      vote_type: v.vote_type,
      selected_proof_ids: v.selected_proof_ids,
      comment: v.comment,
      created_at: tsUsed,
      nonce: v.proof_nonce,
      prev_hash: prev,
    })

    planned.push({
      idx: i,
      id: v.id,
      oldPrev: v.prev_hash,
      newPrev: prev,
      oldHash: v.proof_hash,
      newHash,
      tsUsed,
      softDeleted: false,
    })
    prev = newHash
  }

  console.log(`修復対象 (UPDATE 候補): ${planned.length} 件`)
  console.log(`  うち soft-deleted (proof_hash 維持・prev_hash のみ更新): ${softDelCount}`)
  console.log(`  通常 vote (両方更新): ${planned.length - softDelCount}`)
  console.log('')

  // sample: 最初の 3 件
  console.log('=== sample: 最初の 3 件 ===')
  for (const u of planned.slice(0, 3)) {
    printPlanned(u)
  }
  console.log('')
  console.log('=== sample: 最後の 3 件 ===')
  for (const u of planned.slice(-3)) {
    printPlanned(u)
  }
  console.log('')

  // チェーン整合性: planned[i].newPrev === planned[i-1].newHash
  console.log('=== チェーン整合性 (新 chain) ===')
  let chainOk = true
  let firstBreak = -1
  for (let k = 1; k < planned.length; k++) {
    if (planned[k].newPrev !== planned[k - 1].newHash) {
      chainOk = false
      firstBreak = k
      break
    }
  }
  if (chainOk) {
    console.log('✅ 全 link OK (newPrev[i] === newHash[i-1])')
  } else {
    console.log(`❌ #${firstBreak} で chain 切れ → 実装バグ可能性`)
    console.log(`   newPrev=${planned[firstBreak].newPrev}`)
    console.log(`   prev newHash=${planned[firstBreak - 1].newHash}`)
  }
  console.log('')

  // format breakdown 予測 (実装上、新 hash はすべて +00:00 形式の created_at で計算済)
  console.log('=== format breakdown 予測 ===')
  console.log(`  +00:00: ${votes.length - softDelCount} 件 (924件中の confirmed 通常 vote)`)
  console.log(`  Z:      0 件`)
  console.log(`  other:  0 件`)
  console.log(`  (soft-deleted 1 件は skip 対象、breakdown 集計外)`)
  console.log('')

  if (DRY_RUN) {
    console.log('🔵 DRY_RUN — DB 書き込みなし')
    console.log('   本実行: DRY_RUN=false npx tsx scripts/repair-chain-from-354.ts')
    return
  }

  // ===== LIVE UPDATE =====
  console.log('🟢 LIVE — UPDATE 実行開始')
  let okCount = 0
  let failCount = 0
  for (const u of planned) {
    const updatePayload: { prev_hash: string; proof_hash?: string } = {
      prev_hash: u.newPrev,
    }
    if (!u.softDeleted) {
      updatePayload.proof_hash = u.newHash
    }
    const { error: upErr } = await supabase
      .from('votes')
      .update(updatePayload)
      .eq('id', u.id)
    if (upErr) {
      console.error(`❌ Failed #${u.idx} ${u.id}: ${upErr.message}`)
      failCount++
      // 連鎖修正なので途中失敗は致命的、中断
      console.error('   中断します。バックアップから復元を検討してください。')
      break
    }
    okCount++
    if (okCount % 50 === 0) {
      console.log(`  ...updated ${okCount}/${planned.length}`)
    }
  }
  console.log('')
  console.log(`✅ UPDATE 完了: ${okCount} 件成功 / ${failCount} 件失敗`)
  console.log('   次のステップ: GET /api/verify で verified: true を確認')
}

function printPlanned(u: PlannedUpdate) {
  console.log(`  #${u.idx} id=${u.id}${u.softDeleted ? ' [soft-deleted]' : ''}`)
  console.log(`     oldPrev:  ${u.oldPrev}`)
  console.log(`     newPrev:  ${u.newPrev}`)
  console.log(`     oldHash:  ${u.oldHash}`)
  console.log(`     newHash:  ${u.newHash}${u.softDeleted ? ' (unchanged)' : ''}`)
  console.log(`     ts used:  ${u.tsUsed}`)
}

main().catch((err) => {
  console.error('❌ Unhandled:', err)
  process.exit(1)
})
