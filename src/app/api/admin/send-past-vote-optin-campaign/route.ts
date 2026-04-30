import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/send-past-vote-optin-campaign
 *
 * Phase 4: 過去票オプトインメール一斉配信 — Step 1 スケルトン (dry_run のみ)
 * 詳細仕様: phase4-past-vote-optin-instructions.md
 *
 * モード:
 *   - ?dry_run=true            … 対象抽出 + 件数 + 先頭5件サンプルを返す
 *   - ?test_only=true (Step 6) … 1通だけテスト送信 (未実装)
 *   - 無指定 = production (Step 6) … 一斉配信 (未実装)
 *
 * 認証: ?key=<ADMIN_API_KEY>
 *
 * 注意: 環境変数の値は console.log にも response にも絶対に含めない。
 */
export async function GET(req: NextRequest) {
  // ADMIN_API_KEY 未設定チェック (env 値そのものは出力しない)
  if (!process.env.ADMIN_API_KEY) {
    return NextResponse.json(
      { error: 'ADMIN_API_KEY env var not set' },
      { status: 500 }
    )
  }

  // 認証: key クエリパラメータが ADMIN_API_KEY と一致するか
  const key = req.nextUrl.searchParams.get('key')
  if (key !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dryRun = req.nextUrl.searchParams.get('dry_run') === 'true'

  // Step 1 では dry_run 以外は未実装。誤って production を叩く事故を防ぐため
  // test_only / 無指定 (= production) は明示的に 400 で拒否する。
  if (!dryRun) {
    return NextResponse.json(
      {
        error: 'Not implemented yet, see Step 6',
        code: 'NOT_IMPLEMENTED',
        hint: 'Use ?dry_run=true to preview targets while Step 1 only',
      },
      { status: 400 }
    )
  }

  const supabase = getSupabaseAdmin()

  // 対象抽出 (仕様書 §2.1):
  //   - auth_method がメール系認証 (sms / sms_fallback / hopeful は除外)
  //   - normalized_email が NOT NULL かつ '+' 始まりでない (SMS番号フォールバック除外)
  //   - reward_optin = false (まだ承認していない)
  //   - status = confirmed
  // PostgREST DISTINCT が扱いづらいため重複は JS 側で除去。
  const { data, count, error } = await supabase
    .from('votes')
    .select('normalized_email, auth_display_name', { count: 'exact', head: false })
    .in('auth_method', ['email', 'line', 'email_code', 'google', 'nfc_legacy'])
    .not('normalized_email', 'is', null)
    .not('normalized_email', 'like', '+%')
    .eq('reward_optin', false)
    .eq('status', 'confirmed')

  if (error) {
    console.error('[past-vote-optin-campaign] votes query error:', error)
    return NextResponse.json(
      { error: 'votes query failed', details: error.message },
      { status: 500 }
    )
  }

  // normalized_email で重複除去 (同一メールが複数票投じている場合を1件にまとめる)
  // Map なら最初に現れた auth_display_name を保持する (最新優先にしたい場合は order が必要だが、
  // 表示名は通知本文の呼びかけに使うだけで重複可。最初値で十分)
  const dedupMap = new Map<string, string | null>()
  for (const row of data || []) {
    if (!row.normalized_email) continue
    if (!dedupMap.has(row.normalized_email)) {
      dedupMap.set(row.normalized_email, row.auth_display_name ?? null)
    }
  }

  const targetCount = dedupMap.size
  const sampleRecipients = Array.from(dedupMap.entries())
    .slice(0, 5)
    .map(([email, name]) => ({ email, name }))

  console.log(
    `[past-vote-optin-campaign] dry_run: rows=${count ?? '?'} dedup=${targetCount}`
  )

  return NextResponse.json({
    mode: 'dry_run',
    target_count: targetCount,
    sample_recipients: sampleRecipients,
    estimated_send_time_seconds: Math.max(1, Math.ceil(targetCount / 100)),
    note: 'Email template and send logic not implemented yet (Step 1 scope: dry_run only)',
  })
}
