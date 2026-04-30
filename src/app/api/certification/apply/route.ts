import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { OPS_EMAIL } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * POST /api/certification/apply
 * REALPROOF認定（Lv.2 SPECIALIST）の申請を受け付ける
 */
export async function POST(req: NextRequest) {
  console.log('[CERT APPLY] start')
  const { userId } = await auth()
  console.log('[CERT APPLY] userId:', userId ? userId.substring(0, 12) + '...' : 'null')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const {
      professionalId,
      categorySlug,
      proofCount,
      topPersonality,
      fullNameKanji,
      fullNameRomaji,
      postalCode,
      prefecture,
      cityAddress,
      building,
      phone,
    } = body

    console.log('[CERT APPLY] professionalId from body:', professionalId)

    // バリデーション
    if (!professionalId || !categorySlug || !fullNameKanji || !fullNameRomaji || !postalCode || !prefecture || !cityAddress || !phone) {
      console.log('[CERT APPLY] validation failed:', { professionalId: !!professionalId, categorySlug: !!categorySlug, fullNameKanji: !!fullNameKanji, fullNameRomaji: !!fullNameRomaji, postalCode: !!postalCode, prefecture: !!prefecture, cityAddress: !!cityAddress, phone: !!phone })
      return NextResponse.json(
        { error: '必須項目が入力されていません' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    // プロ本人確認 + Clerkメール取得を並列実行
    const [proResult, clerkRes] = await Promise.all([
      supabase
        .from('professionals')
        .select('id, name, deactivated_at')
        .eq('user_id', userId)
        .maybeSingle(),
      fetch(`https://api.clerk.com/v1/users/${userId}`, {
        headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
      }).then(r => r.json()).catch(() => null),
    ])

    const { data: pro, error: proError } = proResult
    const proEmail = clerkRes?.email_addresses?.[0]?.email_address || ''

    console.log('[CERT APPLY] pro query:', pro ? `id=${pro.id}, deactivated=${pro.deactivated_at}` : 'null', 'error:', proError?.message || 'none', 'email:', proEmail ? 'found' : 'missing')

    // deactivated check in JS (matches dashboard API pattern)
    if (!pro || pro.deactivated_at) {
      console.log('[CERT APPLY] 403: pro not found or deactivated')
      return NextResponse.json({ error: 'Forbidden: professional not found' }, { status: 403 })
    }

    if (String(pro.id) !== String(professionalId)) {
      console.log('[CERT APPLY] 403: id mismatch. pro.id=', pro.id, 'body.professionalId=', professionalId)
      return NextResponse.json({ error: 'Forbidden: id mismatch' }, { status: 403 })
    }

    // 重複申請チェック + カテゴリ名取得を並列
    const [{ data: existing }, { data: proofItem }] = await Promise.all([
      supabase
        .from('certification_applications')
        .select('id')
        .eq('professional_id', professionalId)
        .eq('category_slug', categorySlug)
        .maybeSingle(),
      supabase
        .from('proof_items')
        .select('label')
        .eq('id', categorySlug)
        .maybeSingle(),
    ])
    const categoryName = proofItem?.label || categorySlug

    if (existing) {
      return NextResponse.json({ error: 'Already applied' }, { status: 409 })
    }

    // 認定番号の生成（COUNT+1 フォールバック方式）
    const year = new Date().getFullYear()
    const { count } = await supabase
      .from('certification_applications')
      .select('*', { count: 'exact', head: true })
    const seqNum = String((count || 0) + 1).padStart(4, '0')
    const certNumber = `RP-${year}-${seqNum}`

    // INSERT
    const { data: application, error } = await supabase
      .from('certification_applications')
      .insert({
        professional_id: professionalId,
        category_slug: categorySlug,
        proof_count_at_apply: proofCount || 30,
        top_personality: topPersonality || null,
        full_name_kanji: fullNameKanji,
        full_name_romaji: fullNameRomaji,
        postal_code: postalCode,
        prefecture,
        city_address: cityAddress,
        building: building || null,
        phone,
        certification_number: certNumber,
        status: 'pending',
      })
      .select()
      .maybeSingle()

    if (error) {
      console.error('[certification/apply] Insert failed:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Already applied' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
    }

    // 運営向けメール送信
    try {
      await sendOpsNotificationEmail({
        proName: pro.name,
        proEmail,
        fullNameKanji,
        fullNameRomaji,
        categoryName,
        proofCount: proofCount || 30,
        topPersonality: topPersonality || '—',
        cardUrl: `https://realproof.jp/card/${professionalId}`,
        postalCode,
        prefecture,
        cityAddress,
        building: building || '',
        phone,
        certNumber,
      })

      // email_sent フラグを更新
      if (application) {
        await supabase
          .from('certification_applications')
          .update({ email_sent: true })
          .eq('id', application.id)
      }
    } catch (err) {
      console.error('[certification/apply] Ops notification email failed:', err)
      // email_sent = false のまま。運営が後で確認可能。
    }

    // プロ本人への確認メール送信
    if (proEmail) {
      try {
        await sendProConfirmationEmail({
          proName: pro.name,
          proEmail,
          categoryName,
          proofCount: proofCount || 30,
          certNumber,
          postalCode,
          prefecture,
          cityAddress,
          building: building || '',
        })
      } catch (err) {
        console.error('[certification/apply] Pro confirmation email failed:', err)
        // プロへのメール失敗で申請をブロックしない
      }
    }

    return NextResponse.json({
      success: true,
      certificationNumber: certNumber,
    })
  } catch (err: any) {
    console.error('[certification/apply] error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

/**
 * 運営向けメール送信（リトライ付き最大3回）
 */
async function sendOpsNotificationEmail(params: {
  proName: string
  proEmail: string
  fullNameKanji: string
  fullNameRomaji: string
  categoryName: string
  proofCount: number
  topPersonality: string
  cardUrl: string
  postalCode: string
  prefecture: string
  cityAddress: string
  building: string
  phone: string
  certNumber: string
}) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.error('[certification/apply] RESEND_API_KEY not set')
    return
  }

  const { proName, categoryName, proofCount, certNumber } = params

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'REAL PROOF <noreply@realproof.jp>',
          to: OPS_EMAIL,
          subject: `REALPROOF認定申請 ${proName} / ${categoryName} / ${proofCount}proofs`,
          html: `
            <div style="font-family: 'Noto Sans JP', sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>REALPROOF認定申請が届きました。</h2>
              <hr/>
              <h3>■ 申請者情報</h3>
              <p>氏名（漢字）: ${params.fullNameKanji}<br/>
              氏名（ローマ字）: ${params.fullNameRomaji}<br/>
              メール: ${params.proEmail}</p>
              <hr/>
              <h3>■ 認定内容</h3>
              <p>認定カテゴリ: ${categoryName}<br/>
              プルーフ数: ${proofCount}<br/>
              最多人柄項目: ${params.topPersonality}<br/>
              カードページ: <a href="${params.cardUrl}">${params.cardUrl}</a></p>
              <hr/>
              <h3>■ 送付先</h3>
              <p>〒 ${params.postalCode}<br/>
              ${params.prefecture} ${params.cityAddress}<br/>
              ${params.building}<br/>
              TEL: ${params.phone}</p>
              <hr/>
              <h3>■ 賞状印字内容</h3>
              <p>認定名: REALPROOF認定 ${categoryName}スペシャリスト<br/>
              賞状氏名: ${params.fullNameKanji}<br/>
              カード氏名: ${params.fullNameRomaji}<br/>
              人柄追記: ${params.topPersonality}<br/>
              認定番号: ${certNumber}</p>
            </div>
          `
        }),
      })

      if (!res.ok) {
        throw new Error(`Resend API returned ${res.status}`)
      }

      console.log(`[certification/apply] Ops email sent (attempt ${attempt})`)
      return
    } catch (err) {
      console.error(`[certification/apply] Ops email attempt ${attempt} failed:`, err)
      if (attempt === 3) throw err
      await new Promise(r => setTimeout(r, 1000 * attempt))
    }
  }
}

/**
 * プロ本人への確認メール送信（リトライ付き最大3回）
 */
async function sendProConfirmationEmail(params: {
  proName: string
  proEmail: string
  categoryName: string
  proofCount: number
  certNumber: string
  postalCode: string
  prefecture: string
  cityAddress: string
  building: string
}) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return

  const { proName, proEmail, categoryName, proofCount, certNumber } = params

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'REAL PROOF <noreply@realproof.jp>',
          to: proEmail,
          subject: `🏆 REALPROOF認定申請を受け付けました`,
          html: `
            <div style="font-family: 'Noto Sans JP', sans-serif; max-width: 600px; margin: 0 auto; color: #1A1A2E;">
              <h2 style="color: #C4A35A;">${proName}様</h2>
              <p>REALPROOF認定の申請を受け付けました。</p>
              <hr style="border: none; border-top: 1px solid #E5E5E0; margin: 20px 0;"/>
              <h3>■ 認定内容</h3>
              <p>認定名: REALPROOF認定「${categoryName}」スペシャリスト<br/>
              プルーフ数: ${proofCount}<br/>
              認定番号: ${certNumber}</p>
              <hr style="border: none; border-top: 1px solid #E5E5E0; margin: 20px 0;"/>
              <h3>■ 送付先</h3>
              <p>〒 ${params.postalCode}<br/>
              ${params.prefecture} ${params.cityAddress}${params.building ? '<br/>' + params.building : ''}</p>
              <hr style="border: none; border-top: 1px solid #E5E5E0; margin: 20px 0;"/>
              <p>準備が整い次第、上記の住所に賞状と名前入りプルーフカードをお届けします。</p>
              <p style="color: #888; font-size: 14px; margin-top: 30px;">REALPROOF — 強みがあなたを定義する。</p>
            </div>
          `
        }),
      })

      if (!res.ok) {
        throw new Error(`Resend API returned ${res.status}`)
      }

      console.log(`[certification/apply] Pro confirmation email sent (attempt ${attempt})`)
      return
    } catch (err) {
      console.error(`[certification/apply] Pro email attempt ${attempt} failed:`, err)
      if (attempt === 3) throw err
      await new Promise(r => setTimeout(r, 1000 * attempt))
    }
  }
}
