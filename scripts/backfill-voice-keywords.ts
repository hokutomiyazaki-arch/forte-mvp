/**
 * voice_keywords バックフィルスクリプト
 *
 * 既存の confirmed votes / アクティブ professionals を全件走査し、
 * 辞書とのマッチング結果を voice_keywords に投入する。
 *
 * 実行: npx tsx scripts/backfill-voice-keywords.ts [--force]
 *
 * Safety check:
 *   voice_keywords が既に空でない場合は abort (--force で続行)
 *   matchVoteComment / matchKeywordsAndStore はどちらも内部で
 *   deleteKeywordMatches を先行実行する設計なので、--force 続行でも
 *   既存の同 source_id 行は upsert/delete-then-insert で安全に置換される
 *   (破壊ではなく再構築)。
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import {
  fetchActiveKeywords,
  matchVoteComment,
  matchKeywordsAndStore,
} from '../src/lib/keyword-matcher'

dotenv.config({ path: '.env.local' })

const CONCURRENCY = 5
const PROGRESS_INTERVAL = 100

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const force = process.argv.includes('--force')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function parallelMap<T extends { id: string }>(
  items: T[],
  concurrency: number,
  label: string,
  fn: (item: T, idx: number) => Promise<void>
): Promise<{ ok: number; failed: number }> {
  let cursor = 0
  let ok = 0
  let failed = 0
  const total = items.length

  const worker = async () => {
    while (true) {
      const idx = cursor++
      if (idx >= total) return
      const item = items[idx]
      try {
        await fn(item, idx)
        ok++
      } catch (e) {
        failed++
        console.error(
          `[${label}] idx=${idx} id=${item.id} error:`,
          e instanceof Error ? e.message : e
        )
      }
      const done = ok + failed
      if (done % PROGRESS_INTERVAL === 0 || done === total) {
        console.log(`[${label}] ${done}/${total} (ok=${ok}, failed=${failed})`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return { ok, failed }
}

type VoteSlim = { id: string }
type ProSlim = { id: string; bio: string | null; title: string | null; store_name: string | null }

async function safetyCheck(): Promise<void> {
  const { count, error } = await supabase
    .from('voice_keywords')
    .select('*', { count: 'exact', head: true })

  if (error) {
    console.error('Safety check failed:', error.message)
    process.exit(1)
  }

  const existing = count ?? 0
  console.log(`[safety] voice_keywords existing rows: ${existing}`)

  if (existing > 0 && !force) {
    console.error('')
    console.error('⚠️  voice_keywords is not empty.')
    console.error('   Re-running would re-execute matching for every vote/pro.')
    console.error('   The matcher uses delete-then-insert (per source_id) so existing')
    console.error('   data is safely replaced, not duplicated. But re-run only if intentional.')
    console.error('   Pass --force to proceed anyway.')
    console.error('')
    process.exit(1)
  }

  if (existing > 0 && force) {
    console.warn(`⚠️  --force given. Proceeding despite ${existing} existing rows. Existing rows will be replaced per source_id during processing.`)
  }
}

async function loadVotes(): Promise<VoteSlim[]> {
  const all: VoteSlim[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('votes')
      .select('id')
      .eq('status', 'confirmed')
      .not('comment', 'is', null)
      .neq('comment', '')
      .neq('comment', '[deleted]')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as VoteSlim[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

async function loadProfessionals(): Promise<ProSlim[]> {
  const all: ProSlim[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('professionals')
      .select('id, bio, title, store_name')
      .is('deactivated_at', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as ProSlim[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

async function main() {
  const startedAt = Date.now()
  console.log(`[backfill] starting (force=${force})`)

  await safetyCheck()

  console.log('[backfill] fetching active keywords (cache)...')
  const keywordCache = await fetchActiveKeywords()
  console.log(`[backfill] keyword cache loaded: ${keywordCache.length} active keywords`)

  console.log('[backfill] loading votes...')
  const votes = await loadVotes()
  console.log(`[backfill] votes to process: ${votes.length}`)

  console.log('[backfill] loading professionals...')
  const pros = await loadProfessionals()
  console.log(`[backfill] professionals to process: ${pros.length}`)

  console.log('')
  console.log(`[backfill] processing votes (concurrency=${CONCURRENCY})...`)
  const voteResult = await parallelMap(votes, CONCURRENCY, 'votes', async (v) => {
    await matchVoteComment(v.id, keywordCache)
  })

  console.log('')
  console.log(`[backfill] processing professionals (concurrency=${CONCURRENCY})...`)
  const proResult = await parallelMap(pros, CONCURRENCY, 'pros', async (p) => {
    const text = [p.bio, p.title, p.store_name]
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
      .join(' ')
    if (!text) return
    await matchKeywordsAndStore(p.id, text, 'profile_method', p.id, keywordCache)
  })

  const { count: totalKeywordRows } = await supabase
    .from('voice_keywords')
    .select('*', { count: 'exact', head: true })

  const { data: catRows } = await supabase
    .from('keywords')
    .select('id, category')
    .eq('is_active', true)

  const keywordIdToCat = new Map<string, string>()
  for (const k of (catRows || []) as { id: string; category: string }[]) {
    keywordIdToCat.set(k.id, k.category)
  }

  const PAGE = 1000
  let cursor = 0
  const catCounts: Record<string, number> = {}
  for (;;) {
    const { data, error } = await supabase
      .from('voice_keywords')
      .select('keyword_id')
      .range(cursor, cursor + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const row of data as { keyword_id: string }[]) {
      const cat = keywordIdToCat.get(row.keyword_id) || 'unknown'
      catCounts[cat] = (catCounts[cat] || 0) + 1
    }
    if (data.length < PAGE) break
    cursor += PAGE
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)

  console.log('')
  console.log('======== Backfill Summary ========')
  console.log(`Votes:         ok=${voteResult.ok}, failed=${voteResult.failed}, total=${votes.length}`)
  console.log(`Professionals: ok=${proResult.ok}, failed=${proResult.failed}, total=${pros.length}`)
  console.log(`voice_keywords total rows: ${totalKeywordRows ?? 'n/a'}`)
  console.log('Category breakdown:')
  for (const cat of Object.keys(catCounts).sort()) {
    console.log(`  ${cat}: ${catCounts[cat]}`)
  }
  console.log(`Elapsed: ${elapsed}s`)
  console.log('==================================')
}

main().catch((err) => {
  console.error('[backfill] fatal:', err)
  process.exit(1)
})
