import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { clerkClient } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

/**
 * 一括バックフィル: professionals.contact_email が null のレコードに
 * Clerk APIからメールアドレスを取得してUPDATE
 *
 * GET /api/admin/backfill-contact-email?key=ADMIN_SECRET
 */
export async function GET(req: NextRequest) {
  // 簡易認証
  const key = req.nextUrl.searchParams.get('key')
  if (key !== process.env.ADMIN_API_KEY && key !== process.env.ORG_REGISTER_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // contact_email が null のプロを取得
  const { data: pros, error: fetchError } = await supabase
    .from('professionals')
    .select('id, user_id, name')
    .is('contact_email', null)

  if (fetchError) {
    return NextResponse.json({ error: 'DB fetch failed', details: fetchError.message }, { status: 500 })
  }

  if (!pros || pros.length === 0) {
    return NextResponse.json({ message: 'No professionals with null contact_email', updated: 0, skipped: 0 })
  }

  const clerk = await clerkClient()
  const results = {
    total: pros.length,
    updated: 0,
    skipped: [] as { id: string; name: string; user_id: string; reason: string }[],
    errors: [] as { id: string; name: string; error: string }[],
  }

  // Clerk APIは100件ずつバッチ取得
  const prosWithUserId = pros.filter(p => p.user_id)
  const prosWithoutUserId = pros.filter(p => !p.user_id)

  // user_idがないプロはスキップ
  for (const p of prosWithoutUserId) {
    results.skipped.push({
      id: p.id,
      name: p.name || '(no name)',
      user_id: '',
      reason: 'No user_id',
    })
  }

  // Clerk一括取得 → メールマップ作成
  const emailMap = new Map<string, string>() // user_id → email

  for (let i = 0; i < prosWithUserId.length; i += 100) {
    const batch = prosWithUserId.slice(i, i + 100)
    const userIds = batch.map(p => p.user_id as string)

    try {
      const clerkUsers = await clerk.users.getUserList({
        userId: userIds,
        limit: 100,
      })
      for (const u of clerkUsers.data) {
        const email = u.emailAddresses?.[0]?.emailAddress
        if (email) {
          emailMap.set(u.id, email)
        }
      }
    } catch (err) {
      console.error('[backfill] Clerk API batch error:', err)
      for (const p of batch) {
        results.errors.push({
          id: p.id,
          name: p.name || '(no name)',
          error: 'Clerk API batch failed',
        })
      }
    }
  }

  // 各プロをUPDATE
  for (const p of prosWithUserId) {
    const email = emailMap.get(p.user_id)

    if (!email) {
      // LINEログインなどでメールがないケース
      results.skipped.push({
        id: p.id,
        name: p.name || '(no name)',
        user_id: p.user_id,
        reason: 'No email in Clerk (LINE login?)',
      })
      continue
    }

    const { error: updateError } = await supabase
      .from('professionals')
      .update({ contact_email: email })
      .eq('id', p.id)

    if (updateError) {
      results.errors.push({
        id: p.id,
        name: p.name || '(no name)',
        error: updateError.message,
      })
    } else {
      results.updated++
    }
  }

  console.log('[backfill-contact-email] Results:', JSON.stringify(results, null, 2))

  return NextResponse.json(results)
}
