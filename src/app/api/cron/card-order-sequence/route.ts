/**
 * NFCカード購入者メールシーケンス ②③ — Vercel Cron エントリーポイント
 *
 * GET /api/cron/card-order-sequence
 * 毎日 01:00 UTC = 10:00 JST に実行（vercel.json）。
 *
 * - ② 購入5日後: created_at <= now()-5日 かつ seq2_sent_at IS NULL → 送信 → seq2_sent_at=now()
 * - ③ 購入7日後: created_at <= now()-7日 かつ seq3_sent_at IS NULL → 送信 → seq3_sent_at=now()
 *
 * 冪等: seqN_sent_at で二重送信防止（送信成功時のみ IS NULL 条件付きで記録）。
 * 各送信は個別 try/catch（1件の失敗が全体を止めない）。email 空はスキップ。
 * ① は購入直後に webhooks/card-order で送信済み（本Cronは②③のみ）。
 *
 * 認証: Authorization: Bearer ${CRON_SECRET}（既存Cronと同方式）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { buildSeq2Email, buildSeq3Email, type CardOrderEmail } from '@/lib/card-order-emails'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000

interface CardOrderRow {
  id: string
  email: string | null
  customer_name: string | null
  created_at: string
  seq2_sent_at: string | null
  seq3_sent_at: string | null
}

// Resend 送信（既存メール実装と同一パターン）。成功したら true。
async function sendMail(resendKey: string, to: string, mail: CardOrderEmail): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'REAL PROOF <noreply@realproof.jp>',
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  })
  if (!res.ok) {
    const errBody = await res.text()
    console.error('[card-order-sequence] send failed:', res.status, errBody)
    return false
  }
  return true
}

export async function GET(req: NextRequest) {
  // Vercel Cron の認証（既存Cronと同方式）
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
  }

  const supabase = getSupabaseAdmin()

  const now = Date.now()
  const fiveDaysAgo = new Date(now - 5 * DAY_MS).toISOString()
  const sevenDaysAgo = new Date(now - 7 * DAY_MS).toISOString()

  // 対象候補を先に全件収集（読み取り中は更新しない→ offset ページングでも取りこぼさない）。
  // created_at <= 5日前 かつ (seq2 or seq3 が未送信) の行のみ。
  // 1000件キャップ対策で .range() + .order('id') ページング。
  const candidates: CardOrderRow[] = []
  const pageSize = 1000
  let from = 0
  try {
    while (true) {
      const { data, error } = await supabase
        .from('card_orders')
        .select('id, email, customer_name, created_at, seq2_sent_at, seq3_sent_at')
        .lte('created_at', fiveDaysAgo)
        .or('seq2_sent_at.is.null,seq3_sent_at.is.null')
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)

      if (error) {
        console.error('[card-order-sequence] query failed:', error.message)
        return NextResponse.json({ error: 'query failed' }, { status: 500 })
      }
      if (!data || data.length === 0) break
      candidates.push(...(data as CardOrderRow[]))
      if (data.length < pageSize) break
      from += pageSize
    }
  } catch (err) {
    console.error('[card-order-sequence] query exception:', err)
    return NextResponse.json({ error: 'query exception' }, { status: 500 })
  }

  let seq2Sent = 0
  let seq3Sent = 0
  let skipped = 0
  let failed = 0

  for (const row of candidates) {
    const to = (row.email ?? '').trim()
    if (!to) {
      skipped++
      continue
    }

    // ② 購入5日後（クエリで created_at <= 5日前は担保済み）
    if (row.seq2_sent_at === null && row.created_at <= fiveDaysAgo) {
      try {
        const ok = await sendMail(resendKey, to, buildSeq2Email({ name: row.customer_name }))
        if (ok) {
          const { error: upErr } = await supabase
            .from('card_orders')
            .update({ seq2_sent_at: new Date().toISOString() })
            .eq('id', row.id)
            .is('seq2_sent_at', null)
          if (upErr) console.error('[card-order-sequence] seq2_sent_at update failed:', row.id, upErr.message)
          else seq2Sent++
        } else {
          failed++
        }
      } catch (err) {
        failed++
        console.error('[card-order-sequence] seq2 error:', row.id, err)
      }
    }

    // ③ 購入7日後
    if (row.seq3_sent_at === null && row.created_at <= sevenDaysAgo) {
      try {
        const ok = await sendMail(resendKey, to, buildSeq3Email({ name: row.customer_name }))
        if (ok) {
          const { error: upErr } = await supabase
            .from('card_orders')
            .update({ seq3_sent_at: new Date().toISOString() })
            .eq('id', row.id)
            .is('seq3_sent_at', null)
          if (upErr) console.error('[card-order-sequence] seq3_sent_at update failed:', row.id, upErr.message)
          else seq3Sent++
        } else {
          failed++
        }
      } catch (err) {
        failed++
        console.error('[card-order-sequence] seq3 error:', row.id, err)
      }
    }
  }

  console.log(
    `[card-order-sequence] done: candidates=${candidates.length} seq2=${seq2Sent} seq3=${seq3Sent} skipped=${skipped} failed=${failed}`
  )
  return NextResponse.json({
    success: true,
    candidates: candidates.length,
    seq2Sent,
    seq3Sent,
    skipped,
    failed,
  })
}
