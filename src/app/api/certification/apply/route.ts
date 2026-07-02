import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { OPS_EMAIL, STRENGTH_ENGLISH_NAMES, PERSONALITY_ENGLISH_NAMES, SPECIALIST_THRESHOLD, getCertifiableTier, TIER_DISPLAY, CERTIFICATION_PRODUCT_PRICING, type CertifiableTier } from '@/lib/constants'
import { setCertPending } from '@/lib/certification-card'

export const dynamic = 'force-dynamic'

/**
 * POST /api/certification/apply
 * REALPROOF認定の申請を受け付ける（複数カテゴリ一括対応）。
 *
 * 課金モデル（CEO確定 2026-07-02・物理プロダクト単位／一律価格／カテゴリ数非依存）:
 * - PVC名入りカード: 初回グループ（application_group_id 付き過去申請が無い）は無料、2回目以降は課金
 * - 金属カード(Master以上・任意) / 盾(Legend以上・任意): wantMetal / wantShield 選択時のみ一律課金。両方選ぶと加算
 * - 賞状は常に申請カテゴリ数分（無料付属）
 *
 * データ: 1回の申請で選んだ複数カテゴリを同一 application_group_id の複数行として INSERT。
 * 課金はグループ単位で代表行(先頭)に合計を載せる。
 * 採番: COUNT+1 廃止 → 既存max+1、UNIQUE違反(23505)なら再取得してリトライ（重複根絶）。
 *
 * 後方互換: body.categorySlug 単一指定も受理（categories 配列が優先）。
 */
export async function POST(req: NextRequest) {
  console.log('[CERT APPLY] start')
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const {
      professionalId,
      topPersonality,
      fullNameKanji,
      fullNameRomaji,
      organization,
      postalCode,
      prefecture,
      cityAddress,
      building,
      phone,
      wantMetal,
      wantShield,
    } = body

    // カテゴリ入力の正規化（配列優先・単一は後方互換）
    type InCat = { categorySlug: string; proofCount?: number }
    let inputCategories: InCat[] = []
    if (Array.isArray(body.categories) && body.categories.length > 0) {
      inputCategories = body.categories
        .filter((c: InCat) => c && typeof c.categorySlug === 'string')
        .map((c: InCat) => ({ categorySlug: c.categorySlug, proofCount: c.proofCount }))
    } else if (typeof body.categorySlug === 'string') {
      inputCategories = [{ categorySlug: body.categorySlug, proofCount: body.proofCount }]
    }
    // 重複スラッグを除去
    const seenSlug = new Set<string>()
    inputCategories = inputCategories.filter((c) => {
      if (seenSlug.has(c.categorySlug)) return false
      seenSlug.add(c.categorySlug)
      return true
    })

    // バリデーション
    if (!professionalId || inputCategories.length === 0 || !fullNameKanji || !fullNameRomaji || !postalCode || !prefecture || !cityAddress || !phone) {
      return NextResponse.json({ error: '必須項目が入力されていません' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // プロ本人確認 + Clerkメール取得
    const [proResult, clerkRes] = await Promise.all([
      supabase.from('professionals').select('id, name, deactivated_at').eq('user_id', userId).maybeSingle(),
      fetch(`https://api.clerk.com/v1/users/${userId}`, {
        headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
      }).then((r) => r.json()).catch(() => null),
    ])
    const { data: pro } = proResult
    const proEmail = clerkRes?.email_addresses?.[0]?.email_address || ''

    if (!pro || pro.deactivated_at) {
      return NextResponse.json({ error: 'Forbidden: professional not found' }, { status: 403 })
    }
    if (String(pro.id) !== String(professionalId)) {
      return NextResponse.json({ error: 'Forbidden: id mismatch' }, { status: 403 })
    }

    // このプロの既存申請（グループ判定 + 既申請カテゴリ）
    const { data: existingApps } = await supabase
      .from('certification_applications')
      .select('category_slug, application_group_id')
      .eq('professional_id', professionalId)
    const appliedSlugs = new Set((existingApps || []).map((a) => a.category_slug))
    const priorGroupIds = new Set((existingApps || []).map((a) => a.application_group_id).filter(Boolean))
    const isFirstGroup = priorGroupIds.size === 0

    // 既に申請済みのカテゴリを選んでいたら弾く（cert_app_unique_pro_category 準拠）
    const dupSelected = inputCategories.filter((c) => appliedSlugs.has(c.categorySlug))
    if (dupSelected.length > 0) {
      return NextResponse.json(
        { error: 'Already applied', categories: dupSelected.map((c) => c.categorySlug) },
        { status: 409 }
      )
    }

    // 生proof票数（vote_summary）とカテゴリラベルを取得
    const slugs = inputCategories.map((c) => c.categorySlug)
    const [{ data: vs }, { data: pis }] = await Promise.all([
      supabase.from('vote_summary').select('proof_id, vote_count').eq('professional_id', professionalId),
      supabase.from('proof_items').select('id, label, strength_label').in('id', slugs),
    ])
    const vcMap = new Map((vs || []).map((r) => [r.proof_id, r.vote_count ?? 0]))
    const piMap = new Map((pis || []).map((p) => [p.id, p]))

    // 閾値検証（30票以上）＋ ティア確定
    type Prepared = { categorySlug: string; tier: CertifiableTier; voteCount: number; label: string }
    const prepared: Prepared[] = []
    for (const c of inputCategories) {
      const live = vcMap.get(c.categorySlug) ?? 0
      if (live < SPECIALIST_THRESHOLD) {
        return NextResponse.json(
          { error: `認定閾値(30票)未満のカテゴリが含まれています`, categorySlug: c.categorySlug, voteCount: live },
          { status: 400 }
        )
      }
      prepared.push({
        categorySlug: c.categorySlug,
        tier: getCertifiableTier(live) || 'SPECIALIST',
        voteCount: live,
        label: (piMap.get(c.categorySlug) as { label?: string } | undefined)?.label || c.categorySlug,
      })
    }

    const hasLegend = prepared.some((p) => p.tier === 'LEGEND')
    const hasMaster = prepared.some((p) => p.tier === 'MASTER')

    // ===== グループ単位の課金判定（物理プロダクト・一律価格・カテゴリ数非依存）=====
    // - PVC名入りカード: 初回グループ無料 / 2回目以降は課金
    // - 金属カード(Master以上・任意) / 盾(Legend以上・任意): 選択時のみ一律課金。両方選ぶと加算。
    // - 賞状は常に申請カテゴリ数分（無料付属）。
    const groupId = randomUUID()
    type Row = Prepared & { paymentStatus: 'free' | 'pending'; paymentAmount: number }

    const wantMetalEff = !!wantMetal && hasMaster
    const wantShieldEff = !!wantShield && hasLegend
    const pvcCost = isFirstGroup ? 0 : CERTIFICATION_PRODUCT_PRICING.pvc
    const metalCost = wantMetalEff ? CERTIFICATION_PRODUCT_PRICING.metal : 0
    const shieldCost = wantShieldEff ? CERTIFICATION_PRODUCT_PRICING.shield : 0
    const groupTotal = pvcCost + metalCost + shieldCost
    const groupPaymentStatus: 'free' | 'pending' = groupTotal > 0 ? 'pending' : 'free'
    const groupStripeUrl: string | null = null // 新プロダクト料金の決済リンクは運営が別途送付

    // グループ課金はグループ単位。代表行(先頭)に合計を載せ、他行は0。status は全行でグループ状態を共有。
    const rows: Row[] = prepared.map((p, i) => ({
      ...p,
      paymentStatus: groupPaymentStatus,
      paymentAmount: i === 0 ? groupTotal : 0,
    }))

    // ===== 安全採番（max+1・23505リトライ）＋ 複数行INSERT（同一group_id）=====
    const year = new Date().getFullYear()
    const numPrefix = `RP-${year}-`
    const getMaxCertNum = async (): Promise<number> => {
      const { data } = await supabase.from('certification_applications').select('certification_number')
      let max = 0
      for (const r of (data || []) as { certification_number: string | null }[]) {
        const cn = r.certification_number || ''
        if (cn.startsWith(numPrefix)) {
          const n = parseInt(cn.slice(numPrefix.length), 10)
          if (!Number.isNaN(n) && n > max) max = n
        }
      }
      return max
    }

    let curMax = await getMaxCertNum()
    const inserted: Array<Row & { certNumber: string; id: string }> = []

    for (const r of rows) {
      let done = false
      let terminalError: { code?: string; message?: string } | null = null
      for (let attempt = 0; attempt < 12 && !done; attempt++) {
        const candidate = `${numPrefix}${String(curMax + 1).padStart(4, '0')}`
        const { data: ins, error } = await supabase
          .from('certification_applications')
          .insert({
            professional_id: professionalId,
            category_slug: r.categorySlug,
            application_group_id: groupId,
            proof_count_at_apply: r.voteCount,
            top_personality: topPersonality || null,
            full_name_kanji: fullNameKanji,
            full_name_romaji: fullNameRomaji,
            organization: organization || null,
            postal_code: postalCode,
            prefecture,
            city_address: cityAddress,
            building: building || null,
            phone,
            certification_number: candidate,
            status: 'pending',
            payment_status: r.paymentStatus,
            payment_tier: r.tier,
            payment_amount: r.paymentAmount,
          })
          .select('id, certification_number')
          .maybeSingle()

        if (!error && ins) {
          curMax = curMax + 1
          inserted.push({ ...r, certNumber: candidate, id: ins.id })
          done = true
          break
        }
        if (error && error.code === '23505') {
          const msg = error.message || ''
          // 認定番号の衝突（並行申請） → max再取得してリトライ
          if (msg.includes('cert_number') || msg.includes('certification_number')) {
            curMax = await getMaxCertNum()
            continue
          }
          // (professional_id, category_slug) 重複は事前チェック済み → このカテゴリはスキップ
          terminalError = error
          break
        }
        terminalError = error
        break
      }
      if (!done && terminalError && terminalError.code !== '23505') {
        console.error('[certification/apply] Insert failed:', terminalError)
        return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
      }
    }

    if (inserted.length === 0) {
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
    }

    // 「申請中」フラグを点灯（管理画面の賞状ツールで運営が消せる。新規申請で再点灯）
    try {
      await setCertPending(supabase, professionalId)
    } catch (err) {
      console.error('[certification/apply] setCertPending failed:', err)
    }

    // ===== 認定メール用の集計（全スペシャリスト項目・達成日） =====
    const { data: allProofItems } = await supabase.from('proof_items').select('id, label, strength_label')
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

    const proofToStrength = new Map<string, string>()
    for (const p of (allProofItems || []) as Array<{ id: string; strength_label: string | null }>) {
      if (p.strength_label) proofToStrength.set(p.id, p.strength_label)
    }
    const strengthVotes = new Map<string, string[]>()
    for (const v of (allVotes || []) as Array<{ created_at: string; selected_proof_ids: string[] | null }>) {
      const strengths = new Set<string>()
      for (const pid of (v.selected_proof_ids || []) as string[]) {
        const sl = proofToStrength.get(pid)
        if (sl) strengths.add(sl)
      }
      for (const sl of Array.from(strengths)) {
        if (!strengthVotes.has(sl)) strengthVotes.set(sl, [])
        strengthVotes.get(sl)!.push(v.created_at)
      }
    }
    const allSpecialistItems = Array.from(strengthVotes.entries())
      .filter(([, dates]) => dates.length >= SPECIALIST_THRESHOLD)
      .map(([sl, dates]) => ({
        label: sl,
        labelEnglish: STRENGTH_ENGLISH_NAMES[sl] || sl,
        voteCount: dates.length,
        achievementDate: formatJpDate(dates[SPECIALIST_THRESHOLD - 1] || ''),
      }))
      .sort((a, b) => a.achievementDate.localeCompare(b.achievementDate))

    // グループ代表値（メール表示用）
    const groupCertNumbers = inserted.map((r) => r.certNumber)
    const groupCategoryNames = inserted.map((r) => r.label)
    const groupCategoryEnglish = inserted.map((r) => {
      const sl = (piMap.get(r.categorySlug) as { strength_label?: string } | undefined)?.strength_label || ''
      return STRENGTH_ENGLISH_NAMES[sl] || r.label
    })
    const repTier: CertifiableTier = hasLegend ? 'LEGEND' : hasMaster ? 'MASTER' : 'SPECIALIST'
    const maxProofCount = Math.max(...inserted.map((r) => r.voteCount))
    const targetStrengthLabel = (piMap.get(inserted[0].categorySlug) as { strength_label?: string } | undefined)?.strength_label || inserted[0].label
    const achievementDate = formatJpDate((strengthVotes.get(targetStrengthLabel) || [])[SPECIALIST_THRESHOLD - 1] || null)
    const personalityEnglish = topPersonality ? (PERSONALITY_ENGLISH_NAMES[topPersonality] || topPersonality) : '—'
    const nfcCardUid = nfcCard?.card_uid || null
    const nfcUrl = nfcCardUid ? `https://realproof.jp/nfc/${nfcCardUid}` : null
    const cardUrl = `https://realproof.jp/card/${professionalId}`

    // 運営向けメール（グループ1通）
    try {
      await sendOpsNotificationEmail({
        proName: pro.name,
        proEmail,
        fullNameKanji,
        fullNameRomaji,
        organization: organization || null,
        categoryName: groupCategoryNames.join(' / '),
        categoryEnglish: groupCategoryEnglish.join(' / '),
        proofCount: maxProofCount,
        certTier: repTier,
        isFirstApplication: isFirstGroup,
        applicationCount: priorGroupIds.size + 1,
        paymentStatus: groupPaymentStatus,
        paymentAmount: groupTotal,
        stripePaymentUrl: groupStripeUrl,
        productBreakdown: { pvc: pvcCost, metal: metalCost, shield: shieldCost },
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
        certNumber: groupCertNumbers.join(', '),
      })
      await supabase.from('certification_applications').update({ email_sent: true }).eq('application_group_id', groupId)
    } catch (err) {
      console.error('[certification/apply] Ops notification email failed:', err)
    }

    // プロ本人への確認メール（グループ1通）
    if (proEmail) {
      try {
        await sendProConfirmationEmail({
          proName: pro.name,
          proEmail,
          categoryName: groupCategoryNames.join(' / '),
          proofCount: maxProofCount,
          certNumber: groupCertNumbers.join(', '),
          postalCode,
          prefecture,
          cityAddress,
          building: building || '',
        })
      } catch (err) {
        console.error('[certification/apply] Pro confirmation email failed:', err)
      }
    }

    return NextResponse.json({
      success: true,
      applicationGroupId: groupId,
      certificationNumbers: groupCertNumbers,
      isFirstApplication: isFirstGroup,
      paymentStatus: groupPaymentStatus,
      paymentAmount: groupTotal,
      stripePaymentUrl: groupStripeUrl,
      breakdown: { pvc: pvcCost, metal: metalCost, shield: shieldCost },
      certificateCount: inserted.length,
      categories: inserted.map((r) => ({
        categorySlug: r.categorySlug,
        tier: r.tier,
        certNumber: r.certNumber,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[certification/apply] error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
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
  isFirstApplication: boolean
  applicationCount: number
  paymentStatus: 'free' | 'pending'
  paymentAmount: number
  stripePaymentUrl: string | null
  productBreakdown: { pvc: number; metal: number; shield: number }
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

              <h3 style="border-bottom:2px solid #C4A35A;padding-bottom:4px;">■ 決済情報</h3>
              <p>
                申請回数: <strong>${params.isFirstApplication ? '初回（無料）' : `${params.applicationCount}回目（有料）`}</strong><br/>
                認定ティア: <strong>${esc(tierMeta.label)}</strong><br/>
                決済状況: <strong>${params.paymentStatus === 'free' ? '無料' : '決済待ち'}</strong><br/>
                内訳: PVC名入りカード ${params.productBreakdown.pvc === 0 ? '無料' : `¥${params.productBreakdown.pvc.toLocaleString()}`}${params.productBreakdown.metal > 0 ? ` ／ 金属カード ¥${params.productBreakdown.metal.toLocaleString()}` : ''}${params.productBreakdown.shield > 0 ? ` ／ 盾 ¥${params.productBreakdown.shield.toLocaleString()}` : ''}<br/>
                合計金額: <strong>${params.paymentAmount === 0 ? '無料' : `¥${params.paymentAmount.toLocaleString()}`}</strong>
                ${params.paymentAmount > 0
                  ? '<br/>※ 決済リンクは運営から別途送付。制作開始は決済完了後。'
                  : '<br/>初回PVCのため無料。即時制作可能。'
                }
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
      await new Promise((r) => setTimeout(r, 1000 * attempt))
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
              <p>認定カテゴリ: ${categoryName}<br/>
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
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}
