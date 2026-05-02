/**
 * #354 prev_hash チェーンリンク破損の原因特定スクリプト
 * 実行: npx tsx scripts/inspect-chain-link-354.ts
 *
 * 本番 Supabase に READ ONLY で接続。
 * verify route と同じ取得条件・並び順で #352〜#356 周辺の vote を出力し、
 * - #353.proof_hash と #354.prev_hash の文字列完全一致
 * - 同一 created_at の有無 (並び順不安定の検出)
 * - payload 再計算で「正しい prev_hash の候補」探索
 * を行う。
 *
 * !!! WRITE 一切なし、.env.local の中身は出力しない !!!
 */
import { createClient } from '@supabase/supabase-js'
import {
  computeProofHash,
  buildCreatedAtCandidates,
  DELETED_MARKER,
} from '../src/lib/proof-chain'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('❌ env var missing')
    process.exit(1)
  }
  const supabase = createClient(url, serviceKey)

  console.log('🔍 #354 chain link inspection (READ ONLY)')
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
  console.log('')

  // 周辺 vote 出力 (#350〜#357)
  const indexes = [350, 351, 352, 353, 354, 355, 356, 357]
  console.log('=== 周辺 vote (#350〜#357) ===')
  for (const i of indexes) {
    const v = votes[i]
    if (!v) {
      console.log(`#${i}: (out of bounds)`)
      continue
    }
    console.log(`#${i} id=${v.id}`)
    console.log(`     created_at = ${v.created_at}`)
    console.log(`     proof_hash = ${v.proof_hash}`)
    console.log(`     prev_hash  = ${v.prev_hash}`)
    console.log('')
  }

  // チェーンリンク検査
  const a = votes[353]
  const b = votes[354]
  if (!a || !b) {
    console.log('#353 or #354 missing')
    return
  }

  console.log('=== チェーンリンク #353 → #354 ===')
  console.log(`#353.proof_hash = ${a.proof_hash}`)
  console.log(`#354.prev_hash  = ${b.prev_hash}`)
  const linkOK = a.proof_hash === b.prev_hash
  console.log(`一致: ${linkOK ? '✅' : '❌'}`)
  console.log('')

  if (!linkOK) {
    // #354.prev_hash が他のどの vote の proof_hash と一致するか探索 (全 924 件)
    console.log('=== #354.prev_hash がどの proof_hash と一致するか全件探索 ===')
    let foundIdx: number | null = null
    for (let j = 0; j < votes.length; j++) {
      if (votes[j].proof_hash === b.prev_hash) {
        foundIdx = j
        break
      }
    }
    if (foundIdx !== null) {
      const vf = votes[foundIdx]
      console.log(`✅ #354.prev_hash は #${foundIdx} (id=${vf.id}, created_at=${vf.created_at}) の proof_hash と一致`)
      console.log(`   → 並び順で #${foundIdx} と #353 の位置がズレている可能性`)
    } else {
      console.log('❌ 全 924 件のどの proof_hash とも一致しない')
      console.log('   → 仮説: #354 作成当時の前 vote が hard delete された (orphan prev_hash)')
    }
    console.log('')

    // 別 vote_type も含めた全件検索 (proof 以外で hash が振られている可能性)
    const { data: allHashes } = await supabase
      .from('votes')
      .select('id, vote_type, created_at, proof_hash')
      .not('proof_hash', 'is', null)
    const orphan = (allHashes || []).find((h) => h.proof_hash === b.prev_hash)
    if (orphan) {
      console.log(`✅ 全 vote (vote_type 問わず) で発見: id=${orphan.id} type=${orphan.vote_type} created_at=${orphan.created_at}`)
    } else {
      console.log('❌ vote_type 問わず全 hash 検索でも未発見 → orphan 確定')
    }
    console.log('')

    // votes テーブルの SELECT が「proof_hash IS NOT NULL」付きで何件か
    // と全件 (NULL も含む) で何件かを比較
    const { count: cntAll } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('vote_type', 'proof')
    const { count: cntHash } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('vote_type', 'proof')
      .not('proof_hash', 'is', null)
    console.log(`vote_type='proof' 全件: ${cntAll}, proof_hash IS NOT NULL: ${cntHash}`)
    if ((cntAll ?? 0) > (cntHash ?? 0)) {
      console.log(`⚠️  ${(cntAll ?? 0) - (cntHash ?? 0)} 件の proof_hash NULL vote が存在 → 並び順 ズレの原因候補`)
    }
    console.log('')
  }

  // 同一 created_at の検査 (周辺 5 件)
  console.log('=== #353 / #354 周辺の created_at 同時刻チェック ===')
  for (let i = 350; i <= 357 && i < votes.length; i++) {
    const same = votes
      .map((v, idx) => ({ v, idx }))
      .filter(({ v }) => v.created_at === votes[i].created_at)
    if (same.length > 1) {
      console.log(`⚠️  #${i} (created_at=${votes[i].created_at}) と同一時刻: ${same.length} 件`)
      for (const s of same) {
        console.log(`     #${s.idx} id=${s.v.id}`)
      }
    }
  }
  console.log('')

  // #353 の payload 再計算で "ありうる proof_hash" を探索
  // チェーンリンク破損が「#354 が認識する前 vote が現 #353 とは別」の場合、
  // 実は #353 自身も hash 計算面では正しく繋がっているはず。
  console.log('=== #353 の payload 再計算 (両 format 試行) ===')
  const effectiveEmail = a.normalized_email || a.voter_email || ''
  if (effectiveEmail === DELETED_MARKER || a.comment === DELETED_MARKER) {
    console.log('#353 はソフトデリート済 (再計算 skip)')
  } else {
    for (const { key, ts } of buildCreatedAtCandidates(a.created_at)) {
      const h = computeProofHash({
        voter_email: effectiveEmail,
        professional_id: a.professional_id,
        vote_type: a.vote_type,
        selected_proof_ids: a.selected_proof_ids,
        comment: a.comment,
        created_at: ts,
        nonce: a.proof_nonce,
        prev_hash: a.prev_hash,
      })
      const matchStored = h === a.proof_hash ? '== a.proof_hash' : ''
      const matchPrev354 = h === b.prev_hash ? '== #354.prev_hash 🎯' : ''
      console.log(`  [${key}] created_at='${ts}'`)
      console.log(`    → ${h} ${matchStored} ${matchPrev354}`)
    }
  }
  console.log('')

  // 並び順の安定性: created_at が duplicate な場合 PostgREST/Supabase は id sort fallback?
  console.log('=== 並び順安定性 ===')
  let dupCount = 0
  for (let i = 1; i < votes.length; i++) {
    if (votes[i].created_at === votes[i - 1].created_at) dupCount++
  }
  console.log(`同一 created_at 隣接ペア数: ${dupCount}`)
  if (dupCount > 0) {
    console.log('⚠️  PostgREST の SELECT は created_at が同値だと並び順が不定 (random)')
    console.log('   → migrate-hash-chain.ts 実行時と verify 実行時で並び順が変わる可能性')
  }
}

main().catch((err) => {
  console.error('❌ Unhandled:', err)
  process.exit(1)
})
