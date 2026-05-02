/**
 * R-3 連鎖修正前の votes テーブル全件 READ ONLY バックアップ
 * 実行: npx tsx scripts/backup-votes-before-r3.ts
 *
 * - 全 votes 行を取得 (R-3 範囲外も含めて完全保護)
 * - backups/ ディレクトリに JSON 保存 (PII 含むため .gitignore 済)
 * - ファイル名: votes-pre-r3-YYYYMMDD-HHMM.json
 *
 * !!! READ ONLY !!!
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { writeFileSync, mkdirSync, existsSync, statSync } from 'fs'
import { join } from 'path'

dotenv.config({ path: '.env.local' })

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('❌ env var missing')
    process.exit(1)
  }
  const supabase = createClient(url, serviceKey)

  console.log('💾 votes 全件バックアップ開始 (READ ONLY)')

  // PostgREST のデフォルト 1000 行制限を回避するためチャンク取得
  const PAGE = 1000
  let from = 0
  const all: unknown[] = []
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('votes')
      .select('*')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('❌ fetch error:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  console.log(`Fetched ${all.length} rows`)

  const backupsDir = 'backups'
  if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true })

  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const filename = `votes-pre-r3-${yyyy}${mm}${dd}-${hh}${mi}.json`
  const fullpath = join(backupsDir, filename)

  writeFileSync(
    fullpath,
    JSON.stringify(
      {
        timestamp: now.toISOString(),
        purpose: 'pre-R3 chain repair backup',
        totalRows: all.length,
        votes: all,
      },
      null,
      2
    )
  )

  const size = statSync(fullpath).size
  console.log(`✅ Backup saved: ${fullpath}`)
  console.log(`   Size: ${(size / 1024 / 1024).toFixed(2)} MB`)
  console.log(`   Rows: ${all.length}`)
}

main().catch((err) => {
  console.error('❌ Unhandled:', err)
  process.exit(1)
})
