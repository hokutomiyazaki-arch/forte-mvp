import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { OPS_EMAIL, STRENGTH_ENGLISH_NAMES, PERSONALITY_ENGLISH_NAMES, SPECIALIST_THRESHOLD, getCertifiableTier, TIER_DISPLAY } from '@/lib/constants'

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
      organization,
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
        organization: organization || null,
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

    // ===========================================================
    // 認定メール用の拡張データを取得 (strength_label 単位で集計)
    // ===========================================================
    // 1. 直列処理 OK の指示なので順次取得
    const { data: allProofItems } = await supabase
      .from('proof_items')
      .select('id, label, strength_label')

    const { data: allVotes } = await supabase
      .from('votes')
      .select('id, created_at, selected_proof_ids')
      .eq('professional_id', professionalId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: true })

    const { data: nfcCard } = await supabase
      .from('nfc_cards')
      .select('card_uid, status')
      .eq('professional_id', professionalId)
      .eq('status', 'active')
      .maybeSingle()

    // 2. proof_id → strength_label マップ
    const proofToStrength = new Map<string, string>()
    for (const p of (allProofItems || []) as Array<{ id: string; strength_label: string | null }>) {
      if (p.strength_label) proofToStrength.set(p.id, p.strength_label)
    }

    // 3. strength_label 単位で投票時系列 (created_at[]) を構築
    //    同一投票内で複数 proof_id が同じ strength_label を指す場合は重複カウント回避
    const strengthVotes = new Map<string, string[]>()
    for (const v of (allVotes || []) as Array<{ created_at: string; selected_proof_ids: string[] | null }>) {
      const proofIds = (v.selected_proof_ids || []) as string[]
      const strengths = new Set<string>()
      for (const pid of proofIds) {
        const sl = proofToStrength.get(pid)
        if (sl) strengths.add(sl)
      }
      for (const sl of strengths) {
        if (!strengthVotes.has(sl)) strengthVotes.set(sl, [])
        strengthVotes.get(sl)!.push(v.created_at)
      }
    }

    // 4. 今回申請カテゴリの strength_label と 30 票目達成日
    const targetStrengthLabel = proofToStrength.get(categorySlug) || categoryName
    const targetDates = strengthVotes.get(targetStrengthLabel) || []
    const achievementDateRaw = targetDates[SPECIALIST_THRESHOLD - 1] || targetDates[targetDates.length - 1] || null
    const achievementDate = formatJpDate(achievementDateRaw)

    // 5. 全スペシャリスト項目 (>= SPECIALIST_THRESHOLD)
    const allSpecialistItems = Array.from(strengthVotes.entries())
      .filter(([, dates]) => dates.length >= SPECIALIST_THRESHOLD)
      .map(([sl, dates]) => ({
        label: sl,
        labelEnglish: STRENGTH_ENGLISH_NAMES[sl] || sl,
        voteCount: dates.length,
        achievementDate: formatJpDate(dates[SPECIALIST_THRESHOLD - 1] || ''),
      }))
      .sort((a, b) => a.achievementDate.localeCompare(b.achievementDate))

    // 6. 英語名解決
    const categoryEnglish = STRENGTH_ENGLISH_NAMES[targetStrengthLabel] || targetStrengthLabel
    const personalityEnglish = topPersonality
      ? (PERSONALITY_ENGLISH_NAMES[topPersonality] || topPersonality)
      : '—'

    // 7. NFC URL (紐付けなしなら null)
    const nfcCardUid = nfcCard?.card_uid || null
    const nfcUrl = nfcCardUid ? `https://realproof.jp/nfc/${nfcCardUid}` : null
    const cardUrl = `https://realproof.jp/card/${professionalId}`

    // 8. 申請ティア (今回申請カテゴリの票数からSPECIALIST/MASTER/LEGEND判定)
    const certTier = getCertifiableTier(proofCount || 30) || 'SPECIALIST'

    // 運営向けメール送信
    try {
      await sendOpsNotificationEmail({
        proName: pro.name,
        proEmail,
        fullNameKanji,
        fullNameRomaji,
        organization: organization || null,
        categoryName,
        categoryEnglish,
        proofCount: proofCount || 30,
        certTier,
        achievementDate,
        topPersonality: topPersonality || '—',
        personalityEnglish,
        allSpecialistItems,
        nfcCardUid,
        nfcUrl,
        cardUrl,
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

/** 'YYYY-MM-DDTHH:mm:ss...' / null → 'YYYY/MM/DD' or '—' */
function formatJpDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

/** HTML escape（メール本文の差し込み値用） */
function esc(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 運営向けメール送信（リトライ付き最大3回）
 *
 * カード/賞状制作に必要な以下を含む:
 *   - 申請者情報（所属/肩書を含む）
 *   - 今回認定内容（英語名・30票目達成日）
 *   - 全スペシャリスト項目（strength_label 単位 >= 30、各達成日）
 *   - NFC カード情報（card_uid, URL）
 *   - 賞状枚数とカード記載内容
 */
async function sendOpsNotificationEmail(params: {
  proName: string
  proEmail: string
  fullNameKanji: string
  fullNameRomaji: string
  organization: string | null
  categoryName: string
  categoryEnglish: string
  proofCount: number
  certTier: 'SPECIALIST' | 'MASTER' | 'LEGEND'
  achievementDate: string
  topPersonality: string
  personalityEnglish: string
  allSpecialistItems: Array<{ label: string; labelEnglish: string; voteCount: number; achievementDate: string }>
  nfcCardUid: string | null
  nfcUrl: string | null
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

  const { proName, categoryName, proofCount, certNumber, certTier } = params
  const tierMeta = TIER_DISPLAY[certTier]
  const orgDisplay = params.organization?.trim() || '未入力'
  const nfcUidDisplay = params.nfcCardUid || 'なし'
  const qrUrl = params.nfcUrl || params.cardUrl
  const certificateCount = params.allSpecialistItems.length

  // 賞状リスト（HTML）
  const specialistRows = params.allSpecialistItems
    .map((item, i) =>
      `<li>${i + 1}. ${esc(item.label)} / ${esc(item.labelEnglish)} / ${esc(item.achievementDate)}（${item.voteCount}票）</li>`
    )
    .join('')
  const specialistListHtml = specialistRows
    ? `<ul style="padding-left:20px;margin:8px 0;">${specialistRows}</ul>`
    : '<p style="color:#888;">（該当なし）</p>'

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
          subject: `REALPROOF認定申請（${tierMeta.label}）${proName} / ${categoryName} / ${proofCount}proofs`,
          html: `
            <div style="font-family: 'Noto Sans JP', sans-serif; max-width: 640px; margin: 0 auto; color: #1A1A2E; line-height: 1.7;">
              <h2 style="margin-bottom: 16px;">REALPROOF認定申請が届きました。</h2>

              <h3 style="border-bottom:2px solid #C4A35A;padding-bottom:4px;">■ 申請者情報</h3>
              <p>
                氏名（漢字）: ${esc(params.fullNameKanji)}<br/>
                氏名（ローマ字）: ${esc(params.fullNameRomaji)}<br/>
                メール: ${esc(params.proEmail)}<br/>
                所属/肩書: ${esc(orgDisplay)}
              </p>

              <h3 style="border-bottom:2px solid #C4A35A;padding-bottom:4px;">■ 今回の認定内容</h3>
              <p>
                認定ティア: ${esc(tierMeta.icon)} <strong>${esc(tierMeta.label)}</strong><br/>
                認定カテゴリ: ${esc(categoryName)}<br/>
                英語: ${esc(params.categoryEnglish)}<br/>
                プルーフ数: ${proofCount}<br/>
                30票目達成日: ${esc(params.achievementDate)}<br/>
                最多人柄項目: ${esc(params.topPersonality)}<br/>
                英語: ${esc(params.personalityEnglish)}
              </p>

              <h3 style="border-bottom:2px solid #C4A35A;padding-bottom:4px;">■ 全スペシャリスト項目（カード記載用）</h3>
              ${specialistListHtml}

              <h3 style="border-bottom:2px solid #C4A35A;padding-bottom:4px;">■ カード・賞状 制作情報</h3>
              <p>
                認定番号: ${esc(certNumber)}<br/>
                NFCカード番号: ${esc(nfcUidDisplay)}<br/>
                NFC URL: ${params.nfcUrl ? `<a href="${esc(params.nfcUrl)}">${esc(params.nfcUrl)}</a>` : 'なし'}<br/>
                QR生成用URL: <a href="${esc(qrUrl)}">${esc(qrUrl)}</a><br/>
                カードページ: <a href="${esc(params.cardUrl)}">${esc(params.cardUrl)}</a>
              </p>
              <p>賞状枚数: ${certificateCount}枚（スペシャリスト項目ごとに1枚）</p>
              ${specialistListHtml}
              <p>
                <strong>カード記載内容:</strong><br/>
                表面: ${esc(params.fullNameKanji)} / ${esc(params.fullNameRomaji)} / ${esc(orgDisplay)}<br/>
                裏面: 全スペシャリスト項目 + 人柄 + QRコード
              </p>

              <h3 style="border-bottom:2px solid #C4A35A;padding-bottom:4px;">■ 送付先</h3>
              <p>
                〒 ${esc(params.postalCode)}<br/>
                ${esc(params.prefecture)} ${esc(params.cityAddress)}<br/>
                ${esc(params.building)}<br/>
                TEL: ${esc(params.phone)}
              </p>
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
