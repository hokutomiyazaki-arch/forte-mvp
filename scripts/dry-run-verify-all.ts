/**
 * 全 proof 票のハッシュ整合性 dry-run 検証スクリプト
 *
 * 実行方法: npx tsx scripts/dry-run-verify-all.ts
 *
 * - 本番 Supabase に READ ONLY で接続
 * - votes (vote_type='proof', proof_hash IS NOT NULL) を created_at ASC で全件取得
 * - 各 vote について、現在の DB データから proof_hash を再計算
 * - 保存値と一致しない vote をリストアップ
 *   不一致時は payload (各フィールド) も出力する
 *
 * !!! WRITE は一切しない。.env.local の中身も一切出力しない。!!!
 */
import { createClient } from '@supabase/supabase-js'
import {
  computeProofHash,
  DELETED_MARKER,
  buildCreatedAtCandidates,
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

interface MismatchReport {
  index: number // 0-indexed (verify の brokenAt と同じ)
  id: string
  created_at: string
  voter_email: string | null
  normalized_email: string | null
  storedHash: string
  computedHash: string
  payloadFields: {
    voter_email: string
    professional_id: string
    vote_type: string
    sortedProofIds: string
    comment: string
    created_at: string
    nonce: string
    prev_hash: string
  }
}

async function dryRunVerify() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey)

  console.log('🔍 ハッシュチェーン全件 dry-run 検証 (READ ONLY)')
  console.log('---')

  // verify route と完全に同じ select 条件
  const { data: votesRaw, error } = await supabase
    .from('votes')
    .select(
      'id, voter_email, normalized_email, professional_id, vote_type, selected_proof_ids, comment, created_at, proof_nonce, proof_hash, prev_hash'
    )
    .eq('vote_type', 'proof')
    .not('proof_hash', 'is', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('❌ Failed to fetch votes:', error.message)
    process.exit(1)
  }

  const votes = (votesRaw || []) as VoteRow[]
  console.log(`Found ${votes.length} proofs to verify`)
  console.log('')

  const mismatches: MismatchReport[] = []
  let skippedSoftDeleted = 0
  let skippedNoNonce = 0
  // verifyChain と同じ「両 format 試行」ロジックで集計
  const formats: Record<'Z' | '+00:00' | 'other', number> = {
    'Z': 0,
    '+00:00': 0,
    'other': 0,
  }

  for (let i = 0; i < votes.length; i++) {
    const v = votes[i]

    // verify route と同じ: voter_email を normalized_email || voter_email に上書き
    const effectiveVoterEmail = v.normalized_email || v.voter_email || ''

    // ソフトデリート skip (verifyChain と同じ条件)
    if (effectiveVoterEmail === DELETED_MARKER || v.comment === DELETED_MARKER) {
      skippedSoftDeleted++
      continue
    }

    // proof_nonce が無いと再計算できない
    if (!v.proof_nonce) {
      skippedNoNonce++
      continue
    }

    const sortedProofIds = v.selected_proof_ids
      ? [...v.selected_proof_ids].sort().join(',')
      : ''

    // verifyChain と同じ buildCreatedAtCandidates を使って網羅試行
    let matchedKey: 'Z' | '+00:00' | 'other' | null = null
    let lastComputed = ''
    for (const { key, ts } of buildCreatedAtCandidates(v.created_at)) {
      const c = computeProofHash({
        voter_email: effectiveVoterEmail,
        professional_id: v.professional_id,
        vote_type: v.vote_type,
        selected_proof_ids: v.selected_proof_ids,
        comment: v.comment,
        created_at: ts,
        nonce: v.proof_nonce,
        prev_hash: v.prev_hash,
      })
      lastComputed = c
      if (c === v.proof_hash) {
        matchedKey = key
        break
      }
    }

    if (matchedKey === null) {
      mismatches.push({
        index: i,
        id: v.id,
        created_at: v.created_at,
        voter_email: v.voter_email,
        normalized_email: v.normalized_email,
        storedHash: v.proof_hash,
        computedHash: lastComputed,
        payloadFields: {
          voter_email: effectiveVoterEmail,
          professional_id: v.professional_id,
          vote_type: v.vote_type,
          sortedProofIds,
          comment: v.comment ?? '',
          created_at: v.created_at,
          nonce: v.proof_nonce,
          prev_hash: v.prev_hash,
        },
      })
    } else {
      formats[matchedKey]++
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  ...checked ${i + 1}/${votes.length} (mismatches so far: ${mismatches.length})`)
    }
  }

  console.log('')
  console.log('Format breakdown:', formats)

  console.log('')
  console.log('---')
  console.log(`✅ 検証完了`)
  console.log(`   total proofs:        ${votes.length}`)
  console.log(`   skipped (soft-del):  ${skippedSoftDeleted}`)
  console.log(`   skipped (no nonce):  ${skippedNoNonce}`)
  console.log(`   mismatches:          ${mismatches.length}`)
  console.log('')

  if (mismatches.length === 0) {
    console.log('🎉 全 vote が hash 一致 — chain 健全')
    return
  }

  // 不一致詳細出力 (最大20件)
  const limit = Math.min(mismatches.length, 20)
  console.log(`=== 不一致 vote 詳細 (先頭 ${limit} 件) ===`)
  for (let i = 0; i < limit; i++) {
    const m = mismatches[i]
    console.log('')
    console.log(`[#${m.index} (0-indexed)] id: ${m.id}`)
    console.log(`  created_at:       ${m.created_at}`)
    console.log(`  voter_email:      ${m.voter_email ?? '(null)'}`)
    console.log(`  normalized_email: ${m.normalized_email ?? '(null)'}`)
    console.log(`  storedHash:       ${m.storedHash}`)
    console.log(`  computedHash:     ${m.computedHash}`)
    console.log(`  payload:`)
    console.log(`    voter_email:      '${m.payloadFields.voter_email}'`)
    console.log(`    professional_id:  '${m.payloadFields.professional_id}'`)
    console.log(`    vote_type:        '${m.payloadFields.vote_type}'`)
    console.log(`    sortedProofIds:   '${m.payloadFields.sortedProofIds}'`)
    console.log(`    comment:          '${m.payloadFields.comment}'`)
    console.log(`    created_at:       '${m.payloadFields.created_at}'`)
    console.log(`    nonce:            '${m.payloadFields.nonce}'`)
    console.log(`    prev_hash:        '${m.payloadFields.prev_hash}'`)
  }

  if (mismatches.length > limit) {
    console.log('')
    console.log(`... and ${mismatches.length - limit} more mismatches (詳細省略)`)
  }

  // ID 一覧 (修復スクリプト用)
  console.log('')
  console.log('=== 不一致 vote の id 一覧 ===')
  for (const m of mismatches) {
    console.log(`  ${m.id}  (index=${m.index}, created_at=${m.created_at})`)
  }
}

dryRunVerify().catch((err) => {
  console.error('❌ Unhandled error:', err)
  process.exit(1)
})
