/**
 * 既存プルーフへのハッシュチェーン移行スクリプト
 *
 * 実行方法（ほくとが手動実行）:
 * DRY_RUN=true npx ts-node scripts/migrate-hash-chain.ts
 * npx ts-node scripts/migrate-hash-chain.ts
 *
 * ⚠️ 本番DBに対して実行するので要注意
 * DRY_RUN=true で実行するとDBへの書き込みをスキップ
 */

import { createClient } from '@supabase/supabase-js'
import { computeProofHash, generateNonce, GENESIS_HASH } from '../src/lib/proof-chain'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const DRY_RUN = process.env.DRY_RUN === 'true'

async function migrate() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log(`🔗 Hash Chain Migration ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`)
  console.log('---')

  // 全プルーフを時系列順に取得（ハッシュ未設定のものも含む）。
  // ⚠️ Supabase JS のデフォルト 1000 行上限を回避するため .range() で全ページ取得する。
  //    チャンクごとに鎖を作らず、全件を集約・ソートしてから1本の鎖を構築すること
  //    （チャンク境界で prev_hash が切れるのを防ぐ）。
  //    順序の決定性のため created_at ASC + id ASC の複合キーで取得する。
  type ProofRow = {
    id: string
    voter_email: string
    normalized_email: string | null
    professional_id: string
    vote_type: string
    selected_proof_ids: string[] | null
    comment: string | null
    created_at: string
  }
  const PAGE = 1000
  const fetched: ProofRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('votes')
      .select('id, voter_email, normalized_email, professional_id, vote_type, selected_proof_ids, comment, created_at')
      .eq('vote_type', 'proof')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) {
      console.error('❌ Failed to fetch votes:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    fetched.push(...(data as ProofRow[]))
    if (data.length < PAGE) break
  }

  if (fetched.length === 0) {
    console.log('No proofs found.')
    return
  }

  // 全件を集約後、created_at ASC（同値は id ASC）で明示ソートしてから連結する（破壊的 sort 回避）
  const votes = [...fetched].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  console.log(`Found ${votes.length} proofs to process`)

  let prevHash = GENESIS_HASH
  let processed = 0
  let errors = 0

  for (const vote of votes) {
    const nonce = generateNonce()
    const email = vote.normalized_email || vote.voter_email

    const proofHash = computeProofHash({
      voter_email: email,
      professional_id: vote.professional_id,
      vote_type: vote.vote_type,
      selected_proof_ids: vote.selected_proof_ids,
      comment: vote.comment,
      created_at: vote.created_at,
      nonce,
      prev_hash: prevHash,
    })

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from('votes')
        .update({
          proof_hash: proofHash,
          prev_hash: prevHash,
          proof_nonce: nonce,
        })
        .eq('id', vote.id)

      if (updateError) {
        console.error(`❌ Failed to update vote ${vote.id}:`, updateError.message)
        errors++
        continue
      }
    }

    prevHash = proofHash
    processed++

    if (processed % 50 === 0) {
      console.log(`  ...processed ${processed}/${votes.length}`)
    }
  }

  console.log('---')
  console.log(`✅ Done! Processed: ${processed}, Errors: ${errors}`)
  if (DRY_RUN) {
    console.log('⚠️ DRY RUN — no data was written. Run without DRY_RUN=true to apply.')
  }
}

migrate().catch(console.error)
