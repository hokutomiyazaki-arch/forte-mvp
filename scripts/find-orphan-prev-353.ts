/**
 * #354.prev_hash の親 vote (= 当時 migrate で hash 付与された vote X) を探索
 * 実行: npx tsx scripts/find-orphan-prev-353.ts
 *
 * 戦略:
 *   - vote_type='proof' AND proof_hash IS NULL の 95件を取得
 *   - 当時の chain では X.prev_hash = #352.proof_hash (= 52b3c9cdc486...) のはず
 *   - 各候補 vote の payload (voter_email, professional_id, vote_type,
 *     selected_proof_ids, comment, created_at, proof_nonce) を使い、
 *     prev_hash = 52b3c9cdc486... 固定で計算 → 0a0930a1ed7c... と一致する vote を探す
 *   - created_at 範囲 (2026-03-27T04:47:40 〜 06:56:49) を優先試行、
 *     全外れなら 95件全件にスコープ拡大
 *
 * !!! READ ONLY、コード変更なし、.env.local の中身は出力しない !!!
 */
import { createClient } from '@supabase/supabase-js'
import {
  computeProofHash,
  buildCreatedAtCandidates,
  DELETED_MARKER,
} from '../src/lib/proof-chain'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const TARGET_HASH = '0a0930a1ed7cb94013acc7067831cd740c26a3dce48335644381b2b475b2ebb0'
const PARENT_PREV_HASH = '52b3c9cdc4866d7f0d39c0c2f38ecc3b1d590e50abb72f8a2ea2de4f678a9a22' // = #352.proof_hash
const RANGE_START = '2026-03-27T04:47:40.499793+00:00' // = #353.created_at (排他より大きい)
const RANGE_END = '2026-03-27T06:56:49.454659+00:00'   // = #354.created_at (排他より小さい)

interface VoteRow {
  id: string
  voter_email: string | null
  normalized_email: string | null
  professional_id: string
  vote_type: string
  selected_proof_ids: string[] | null
  comment: string | null
  created_at: string
  proof_nonce: string | null
  proof_hash: string | null
  prev_hash: string | null
  status: string | null
}

interface MatchHit {
  vote: VoteRow
  matchedTs: string
  matchedKey: string
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('❌ env var missing')
    process.exit(1)
  }
  const supabase = createClient(url, serviceKey)

  console.log('🔎 Orphan prev_hash の親 vote 探索 (R-2 試行)')
  console.log(`   target hash:  ${TARGET_HASH}`)
  console.log(`   parent prev:  ${PARENT_PREV_HASH} (= #352.proof_hash)`)
  console.log(`   range:        ${RANGE_START} 〜 ${RANGE_END}`)
  console.log('---')

  // proof_hash NULL の proof vote 全件取得
  const { data, error } = await supabase
    .from('votes')
    .select(
      'id, voter_email, normalized_email, professional_id, vote_type, selected_proof_ids, comment, created_at, proof_nonce, proof_hash, prev_hash, status'
    )
    .eq('vote_type', 'proof')
    .is('proof_hash', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('❌ fetch error:', error.message)
    process.exit(1)
  }
  const candidates = (data || []) as VoteRow[]
  console.log(`📦 NULL hash 候補総数: ${candidates.length}`)

  // proof_nonce 保持の有無
  const withNonce = candidates.filter((v) => !!v.proof_nonce)
  console.log(`   うち proof_nonce 保持: ${withNonce.length}`)

  // 範囲内候補
  const inRange = withNonce.filter(
    (v) => v.created_at > RANGE_START && v.created_at < RANGE_END
  )
  console.log(`   うち created_at 範囲内 (${RANGE_START} 〜 ${RANGE_END}): ${inRange.length}`)
  console.log('')

  // 試行関数
  function tryHashMatch(v: VoteRow): MatchHit | null {
    if (!v.proof_nonce) return null
    const effectiveEmail = v.normalized_email || v.voter_email || ''
    if (effectiveEmail === DELETED_MARKER || v.comment === DELETED_MARKER) return null
    for (const { key, ts } of buildCreatedAtCandidates(v.created_at)) {
      const h = computeProofHash({
        voter_email: effectiveEmail,
        professional_id: v.professional_id,
        vote_type: v.vote_type,
        selected_proof_ids: v.selected_proof_ids,
        comment: v.comment,
        created_at: ts,
        nonce: v.proof_nonce,
        prev_hash: PARENT_PREV_HASH,
      })
      if (h === TARGET_HASH) return { vote: v, matchedTs: ts, matchedKey: key }
    }
    return null
  }

  // Phase 1: 範囲内試行
  console.log('=== Phase 1: 範囲内候補で試行 ===')
  const phase1Hits: MatchHit[] = []
  for (const v of inRange) {
    const hit = tryHashMatch(v)
    if (hit) phase1Hits.push(hit)
  }
  console.log(`Phase 1 一致件数: ${phase1Hits.length}`)
  for (const h of phase1Hits) {
    printHit(h)
  }
  console.log('')

  // Phase 2: 全 95件試行 (Phase 1 で見つかっても、念のため衝突確認)
  console.log('=== Phase 2: 全 NULL hash vote (95件) で試行 ===')
  const phase2Hits: MatchHit[] = []
  for (const v of withNonce) {
    const hit = tryHashMatch(v)
    if (hit) phase2Hits.push(hit)
  }
  console.log(`Phase 2 一致件数: ${phase2Hits.length}`)

  // Phase 1 と重複しないものだけ追加表示
  const phase1Ids = new Set(phase1Hits.map((h) => h.vote.id))
  const phase2Extra = phase2Hits.filter((h) => !phase1Ids.has(h.vote.id))
  if (phase2Extra.length > 0) {
    console.log(`   うち Phase 1 範囲外で追加発見: ${phase2Extra.length}`)
    for (const h of phase2Extra) {
      printHit(h)
    }
  } else if (phase2Hits.length > 0) {
    console.log('   (Phase 1 と同じ vote のみ)')
  }
  console.log('')

  // 集計
  console.log('=== 結論 ===')
  const allHits = phase2Hits.length > 0 ? phase2Hits : phase1Hits
  if (allHits.length === 0) {
    console.log('❌ 一致 0 件 → 親 vote は hard delete された (or payload が変わった)')
    console.log('   → R-3 連鎖修正にフォールバック推奨')
  } else if (allHits.length === 1) {
    const h = allHits[0]
    console.log(`✅ 一致 1 件 → 本物の親確定`)
    console.log(`   id:               ${h.vote.id}`)
    console.log(`   created_at:       ${h.vote.created_at}`)
    console.log(`   voter_email:      ${h.vote.voter_email}`)
    console.log(`   normalized_email: ${h.vote.normalized_email}`)
    console.log(`   professional_id:  ${h.vote.professional_id}`)
    console.log(`   comment:          ${h.vote.comment}`)
    console.log(`   status:           ${h.vote.status}`)
    console.log(`   proof_nonce:      ${h.vote.proof_nonce}`)
    console.log(`   prev_hash (DB):   ${h.vote.prev_hash}`)
    console.log(`   matched format:   ${h.matchedKey}`)
    console.log(`   matched ts:       ${h.matchedTs}`)
    console.log('')
    console.log('→ R-2 復元: この vote の proof_hash を TARGET_HASH で UPDATE すれば')
    console.log('  verify が #354 を超えて #470 まで進める。CEO 承認後に UPDATE スクリプト実行。')
  } else {
    console.log(`⚠️  一致 ${allHits.length} 件 → ハッシュ衝突 or 偶然の payload 一致`)
    for (const h of allHits) {
      printHit(h)
    }
    console.log('→ CEO 判断: どれを採用するか、もしくは R-3 にフォールバック')
  }
}

function printHit(h: MatchHit) {
  console.log(`  ✓ id=${h.vote.id}`)
  console.log(`     created_at=${h.vote.created_at}`)
  console.log(`     status=${h.vote.status} email=${h.vote.voter_email}`)
  console.log(`     prof_id=${h.vote.professional_id}`)
  console.log(`     comment=${(h.vote.comment ?? '').slice(0, 40)}${(h.vote.comment ?? '').length > 40 ? '...' : ''}`)
  console.log(`     matched format=${h.matchedKey} ts=${h.matchedTs}`)
}

main().catch((err) => {
  console.error('❌ Unhandled:', err)
  process.exit(1)
})
