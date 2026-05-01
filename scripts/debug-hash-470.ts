/**
 * 不一致 vote #470 の created_at format 仮説検証
 * 実行: npx tsx scripts/debug-hash-470.ts
 */
import { createHash } from 'crypto'

const VOTER_EMAIL = 'u9999uzu@yahoo.co.jp'
const PROFESSIONAL_ID = '1b72b4fb-4c3a-409f-a5d6-9c20af825219'
const VOTE_TYPE = 'proof'
const SELECTED_PROOF_IDS = [
  '908f99bd-16b7-44a6-8c13-fd6863db8c97',
  'a65a324a-d088-4a2e-9c68-4b115ae9cca6',
  'd4961506-2c38-4687-85a5-37e9e4d36bbc',
]
const COMMENT = ''
const NONCE = '8eada15f-dd47-4a5b-b6b9-5ef5884c9b72'
const PREV_HASH =
  'd3e8cefe91f9b50fb2845df5ca8e6283723e0a6cae36967290f2c15f2db21059'

const EXPECTED_HASH =
  'c3cfe98977c7ebe121e1b43cb6f93d6fb2c6d11bac9dc1c1a25a492ed4885ca5'

const PATTERNS = [
  { label: 'DB 返却値 (ms +00:00)        ', ts: '2026-04-03T01:26:19.143+00:00' },
  { label: 'JS toISOString (ms Z)        ', ts: '2026-04-03T01:26:19.143Z' },
  { label: 'μs +00:00 (paddied)          ', ts: '2026-04-03T01:26:19.143000+00:00' },
  { label: 'μs Z (paddied)               ', ts: '2026-04-03T01:26:19.143000Z' },
  { label: 'Postgres "T" 無し            ', ts: '2026-04-03 01:26:19.143+00' },
  { label: 'Postgres μs                  ', ts: '2026-04-03 01:26:19.143000+00' },
]

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

console.log('=== #470 不一致 created_at format 仮説検証 ===')
console.log(`期待 hash: ${EXPECTED_HASH}`)
console.log('')

let matched: string | null = null
for (const { label, ts } of PATTERNS) {
  const c = computeHash(ts)
  const match = c === EXPECTED_HASH
  console.log(`${match ? '✅ MATCH!' : '❌'} ${label} '${ts}'`)
  console.log(`   ${c}`)
  if (match) matched = label.trim()
}

console.log('')
console.log(matched ? `✅ 一致: ${matched}` : '❌ 全 format 外れ → 別仮説 (フィールド差) 要検討')
