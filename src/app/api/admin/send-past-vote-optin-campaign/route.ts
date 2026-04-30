import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import {
  generateSubject,
  generateTextBody,
  generateHtmlBody,
} from '@/lib/email-templates/past-vote-optin-email'
import { generateOptinToken } from '@/lib/optin-token'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/send-past-vote-optin-campaign
 *
 * Phase 4: 過去票オプトインメール一斉配信
 * 詳細仕様: phase4-past-vote-optin-instructions.md
 *
 * モード (優先順位: dry_run > test_only > production):
 *   - ?dry_run=true                                                     … 対象抽出 + 件数 + 先頭5件サンプルを返す (Step 1 実装、変更禁止)
 *   - ?test_only=true&test_email=xxx@example.com                        … 1通だけテスト送信、DBは触らない、displayName='テスト' 固定
 *   - ?confirm=YES_I_REALLY_WANT_TO_SEND_TO_735                          … 一斉配信。confirm 完全一致必須
 *
 * 認証: ?key=<ADMIN_API_KEY>
 *
 * 注意:
 *   - 環境変数の値は console.log にも response にも絶対に含めない
 *   - メアドの生値は console.log / errors[] に出さない (maskEmail 経由)
 *   - DB UPDATE は本ルートで一切行わない (オプトイン UPDATE は受付API側 = /api/past-vote-optin)
 */

const FROM_EMAIL = 'REAL PROOF <noreply@realproof.jp>'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://realproof.jp'

type SendResult = {
  ok: boolean
  messageId: string | null
  error: string | null
}

async function sendOptinEmail(params: {
  to: string
  normalizedEmail: string
  displayName: string | null
  resendKey: string
}): Promise<SendResult> {
  try {
    const token = generateOptinToken(params.normalizedEmail)
    const optinUrl = `${SITE_URL}/api/past-vote-optin?token=${token}&email=${encodeURIComponent(params.normalizedEmail)}`

    const subject = generateSubject()
    const text = generateTextBody(params.displayName, optinUrl)
    const html = generateHtmlBody(params.displayName, optinUrl)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.resendKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: params.to,
        subject,
        text,
        html,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return {
        ok: false,
        messageId: null,
        error: `Resend ${res.status}: ${body.slice(0, 200) || 'no body'}`,
      }
    }

    const data: any = await res.json().catch(() => ({}))
    if (!data?.id) {
      return { ok: false, messageId: null, error: 'no message id returned' }
    }
    return { ok: true, messageId: String(data.id), error: null }
  } catch (e) {
    return {
      ok: false,
      messageId: null,
      error: e instanceof Error ? e.message : 'unknown error',
    }
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  const visible = local.slice(0, 4)
  return `${visible}***@${domain}`
}

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
  const testOnly = req.nextUrl.searchParams.get('test_only') === 'true'
  const testEmail = req.nextUrl.searchParams.get('test_email')
  const confirm = req.nextUrl.searchParams.get('confirm')

  // モード優先順位: dry_run > test_only > production
  // dry_run が true なら他のフラグは全て無視 (production 誤爆事故対策)
  if (!dryRun) {
    // RESEND_API_KEY は test_only / production 共通で必須
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      return NextResponse.json(
        { error: 'RESEND_API_KEY env var not set' },
        { status: 500 }
      )
    }

    // OPTIN_SECRET は HMAC token 生成に必須 (generateOptinToken が throw する前にここで弾く)
    if (!process.env.OPTIN_SECRET) {
      return NextResponse.json(
        { error: 'OPTIN_SECRET env var not set' },
        { status: 500 }
      )
    }

    // === test_only モード ===
    if (testOnly) {
      if (!testEmail || typeof testEmail !== 'string' || testEmail.trim() === '') {
        return NextResponse.json(
          { error: 'test_only mode requires test_email parameter' },
          { status: 400 }
        )
      }

      const normalized = testEmail.toLowerCase().trim()
      const masked = maskEmail(normalized)

      const result = await sendOptinEmail({
        to: normalized,
        normalizedEmail: normalized,
        displayName: 'テスト',
        resendKey,
      })

      if (result.ok) {
        console.log(
          `[past-vote-optin-campaign] test_only ${masked} → ✓ (${result.messageId ?? 'unknown'})`
        )
        return NextResponse.json({
          mode: 'test_only',
          to: normalized,
          sent: true,
          message_id: result.messageId ?? 'unknown',
        })
      } else {
        console.error(
          `[past-vote-optin-campaign] test_only ${masked} → ✗ ${result.error ?? 'unknown'}`
        )
        return NextResponse.json(
          {
            mode: 'test_only',
            to: normalized,
            sent: false,
            error: result.error ?? 'unknown',
          },
          { status: 502 }
        )
      }
    }

    // === production モード ===
    // confirm の完全一致チェック (大文字小文字 / 空白も含めて厳密に)
    if (confirm !== 'YES_I_REALLY_WANT_TO_SEND_TO_735') {
      return NextResponse.json(
        {
          error:
            'production mode requires confirm=YES_I_REALLY_WANT_TO_SEND_TO_735',
        },
        { status: 400 }
      )
    }

    // 対象抽出 (dry_run と同じ抽出条件)
    const supabaseProd = getSupabaseAdmin()
    const { data: rows, error: queryError } = await supabaseProd
      .from('votes')
      .select('normalized_email, auth_display_name')
      .in('auth_method', ['email', 'line', 'email_code', 'google', 'nfc_legacy'])
      .not('normalized_email', 'is', null)
      .not('normalized_email', 'like', '+%')
      .not('normalized_email', 'like', '%@line.realproof.jp')
      .eq('reward_optin', false)
      .eq('status', 'confirmed')

    if (queryError) {
      console.error(
        '[past-vote-optin-campaign] production query error:',
        queryError.message
      )
      return NextResponse.json(
        { error: 'votes query failed', details: queryError.message },
        { status: 500 }
      )
    }

    // 重複除去 (normalized_email 単位、初出の auth_display_name を保持)
    const uniqueMap = new Map<
      string,
      { email: string; name: string | null }
    >()
    for (const row of rows ?? []) {
      if (!row.normalized_email) continue
      if (!uniqueMap.has(row.normalized_email)) {
        uniqueMap.set(row.normalized_email, {
          email: row.normalized_email,
          name: row.auth_display_name ?? null,
        })
      }
    }
    const targets = Array.from(uniqueMap.values())

    // プロ自身を配信対象から除外 (professionals.contact_email との一致)
    const { data: proRows, error: proErr } = await supabaseProd
      .from('professionals')
      .select('contact_email')
      .is('deactivated_at', null)
      .not('contact_email', 'is', null)

    if (proErr) {
      console.error(
        '[past-vote-optin-campaign] failed to load professionals for exclusion',
        proErr.message
      )
      return NextResponse.json(
        {
          error: 'failed to load professionals for exclusion',
          details: proErr.message,
        },
        { status: 500 }
      )
    }

    const proEmails = new Set(
      (proRows ?? [])
        .map((r: any) => r.contact_email?.toLowerCase())
        .filter((e: string | undefined): e is string => !!e)
    )

    const excludedProCount = targets.filter((t) =>
      proEmails.has(t.email.toLowerCase())
    ).length
    const filteredTargets = targets.filter(
      (t) => !proEmails.has(t.email.toLowerCase())
    )

    console.log(
      `[past-vote-optin-campaign] excluded ${excludedProCount} pro voters from targets`
    )
    console.log(
      `[past-vote-optin-campaign] production START: ${filteredTargets.length} targets`
    )

    const startTime = Date.now()
    const errors: Array<{ email: string; reason: string }> = []
    let sent = 0
    let failed = 0

    // 順次送信 (Promise.all 並列禁止: Resend 100req/sec 超過対策)
    for (let i = 0; i < filteredTargets.length; i++) {
      const target = filteredTargets[i]
      const masked = maskEmail(target.email)

      const result = await sendOptinEmail({
        to: target.email,
        normalizedEmail: target.email,
        displayName: target.name,
        resendKey,
      })

      if (result.ok) {
        sent++
        console.log(
          `[past-vote-optin-campaign] [${i + 1}/${filteredTargets.length}] ${masked} → ✓ (${result.messageId ?? 'unknown'})`
        )
      } else {
        failed++
        errors.push({ email: masked, reason: result.error ?? 'unknown' })
        console.error(
          `[past-vote-optin-campaign] [${i + 1}/${filteredTargets.length}] ${masked} → ✗ ${result.error ?? 'unknown'}`
        )
      }

      // Resend レート制限 (100req/sec) 対策で 15ms sleep (実効 ~66req/sec)
      await new Promise((r) => setTimeout(r, 15))
    }

    const duration = Math.round((Date.now() - startTime) / 1000)
    console.log(
      `[past-vote-optin-campaign] DONE. sent=${sent} failed=${failed} duration=${duration}s`
    )

    return NextResponse.json({
      mode: 'production',
      total: filteredTargets.length,
      excluded_pro_count: excludedProCount,
      sent,
      failed,
      duration_seconds: duration,
      errors,
    })
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
    .not('normalized_email', 'like', '%@line.realproof.jp')
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

  // dedupMap → 配列化してプロ自身を除外
  const dedupedTargets = Array.from(dedupMap.entries()).map(
    ([email, name]) => ({ email, name })
  )

  // プロ自身を配信対象から除外 (professionals.contact_email との一致)
  const { data: proRows, error: proErr } = await supabase
    .from('professionals')
    .select('contact_email')
    .is('deactivated_at', null)
    .not('contact_email', 'is', null)

  if (proErr) {
    console.error(
      '[past-vote-optin-campaign] failed to load professionals for exclusion',
      proErr.message
    )
    return NextResponse.json(
      {
        error: 'failed to load professionals for exclusion',
        details: proErr.message,
      },
      { status: 500 }
    )
  }

  const proEmails = new Set(
    (proRows ?? [])
      .map((r: any) => r.contact_email?.toLowerCase())
      .filter((e: string | undefined): e is string => !!e)
  )

  const excludedProCount = dedupedTargets.filter((t) =>
    proEmails.has(t.email.toLowerCase())
  ).length
  const filteredTargets = dedupedTargets.filter(
    (t) => !proEmails.has(t.email.toLowerCase())
  )

  const targetCount = filteredTargets.length
  const sampleRecipients = filteredTargets.slice(0, 5)

  console.log(
    `[past-vote-optin-campaign] dry_run: rows=${count ?? '?'} dedup=${dedupedTargets.length} excluded_pro=${excludedProCount} final=${targetCount}`
  )

  return NextResponse.json({
    mode: 'dry_run',
    target_count: targetCount,
    excluded_line_dummies: '43 (estimated)',
    excluded_pro_count: excludedProCount,
    sample_recipients: sampleRecipients,
    estimated_send_time_seconds: Math.max(1, Math.ceil(targetCount / 100)),
    note: 'Email template and send logic not implemented yet (Step 1 scope: dry_run only)',
  })
}
