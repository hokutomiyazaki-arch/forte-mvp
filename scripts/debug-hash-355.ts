/**
 * ハッシュチェーン破損 #355 原因特定スクリプト
 *
 * 実行方法: npx tsx scripts/debug-hash-355.ts
 * DB 接続なし。Node.js 単体で動く。
 *
 * 入力値は破損 vote (id=b5d05dd7-...) の DB データを元に固定。
 * created_at の 5 パターンで hash を計算して、期待 hash と一致するものを探す。
 *
 * 期待 hash:
 *   54cd53ed0dedc6b31729091c03ec448ff4ec10503890e5e282e83b6e54cdee8b
 */
import { createHash } from 'crypto'

// ---- 共通入力 ----
const VOTER_EMAIL = 'hinchan0105@gmail.com'
const PROFESSIONAL_ID = 'ee83bdcb-1904-4f44-83f5-12393ba199a4'
const VOTE_TYPE = 'proof'
const SELECTED_PROOF_IDS = [
  '2ac5aeb8-5206-473e-93ef-8b4c781ab99a',
  '61496894-ad11-4caf-8f2c-2c354a6d4508',
  'cca30f77-448b-4f58-8463-d3b30ea83ed6',
]
const COMMENT = '体の不思議を体験できた'
const NONCE = '46f403d7-0387-45fb-a68d-177b74845124'
const PREV_HASH =
  '0a0930a1ed7cb94013acc7067831cd740c26a3dce48335644381b2b475b2ebb0'

const EXPECTED_HASH =
  '54cd53ed0dedc6b31729091c03ec448ff4ec10503890e5e282e83b6e54cdee8b'

// ---- created_at 5 パターン ----
const CREATED_AT_PATTERNS: Array<{ label: string; ts: string }> = [
  { label: 'パターン1: μs, +00:00       ', ts: '2026-03-27T06:56:49.454659+00:00' },
  { label: 'パターン2: μs, Z            ', ts: '2026-03-27T06:56:49.454659Z' },
  { label: 'パターン3: ms, Z (JS toISO)  ', ts: '2026-03-27T06:56:49.454Z' },
  { label: 'パターン4: ms, +00:00       ', ts: '2026-03-27T06:56:49.454+00:00' },
  { label: 'パターン5: Postgres 形式     ', ts: '2026-03-27 06:56:49.454659+00' },
]

// ---- proof-chain.ts:29-45 と同一ロジック ----
function computeHash(createdAt: string): string {
  const sortedProofIds = [...SELECTED_PROOF_IDS].sort().join(',')

  const payload = [
    VOTER_EMAIL,
    PROFESSIONAL_ID,
    VOTE_TYPE,
    sortedProofIds,
    COMMENT || '',
    createdAt,
    NONCE,
    PREV_HASH,
  ].join('|')

  return createHash('sha256').update(payload).digest('hex')
}

// ---- 実行 ----
console.log('=== ハッシュチェーン破損 #355 原因特定 ===')
console.log(`期待 hash: ${EXPECTED_HASH}`)
console.log('')

let matchedPattern: string | null = null

for (const { label, ts } of CREATED_AT_PATTERNS) {
  const computed = computeHash(ts)
  const match = computed === EXPECTED_HASH
  const mark = match ? '✅ MATCH!' : '❌'
  console.log(`${mark} ${label} created_at='${ts}'`)
  console.log(`   computed = ${computed}`)
  if (match) matchedPattern = label.trim()
  console.log('')
}

console.log('---')
if (matchedPattern) {
  console.log(`✅ 一致パターン: ${matchedPattern}`)
  console.log('')
  console.log('推定原因 (対応表):')
  console.log('  パターン1 (μs+00:00) → migrate-hash-chain.ts 経由')
  console.log('  パターン2 (μs+Z)     → 同上 (出力 format 違いのみ)')
  console.log('  パターン3 (ms+Z)     → INSERT 経由。DB created_at が後で μs に書き換わった or')
  console.log('                          検証側の取得 format が μs 化している = 検証側の問題')
  console.log('  パターン4 (ms+00:00) → INSERT 経由 (TZ 表記のみ差)。同上')
  console.log('  パターン5 (PG形式)    → DB から ::text で取った形式そのまま hash 化された')
} else {
  console.log('❌ 全パターン外れ')
  console.log('')
  console.log('追加調査が必要な仮説:')
  console.log('  a) comment 文字列に zero-width space や前後空白が混入')
  console.log('  b) selected_proof_ids の sort 結果が想定と異なる')
  console.log('  c) prev_hash / nonce / professional_id の値が DB 上で異なる')
  console.log('  d) ハッシュ計算ロジックに気付いていない違いがある (区切り文字、空配列等)')
  console.log('')
  console.log('次の一手: 該当 vote の生 SQL データを再取得して値を再確認')
}
