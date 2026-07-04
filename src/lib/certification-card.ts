/**
 * 認定カード生成 — 共有データ層（サーバー専用）
 *
 * プロを1人選ぶ → 認定申請(certification_applications)を起点に、カード表裏に必要な
 * 全データを組み立てる。データ取得APIとレンダリング両方から使う単一の真実。
 *
 * 設計判断（CEO承認済み・STOP 1）:
 * - 認定番号は certification_applications.certification_number を単一の真実として継続。
 *   新テーブルは作らない。未採番の申請にだけ「既存max+1（>=0013）」で採番。
 * - メダルのティアは §9 の生proof票数（15/30/50/100）で判定。payment_tier は使わない。
 * - SPECIALTY項目は【実績ベース】(CEO変更 2026-07-01): vote_summary の生proof票数が
 *   15票以上(PROVEN_THRESHOLD)の proof_id を全て拾い、票数降順。表示は最大6件（UI/描画で上位6件に絞る）。
 *   ※以前は申請(category_slug)ベースだったが、申請1件のプロで獲得実績が反映されない問題があり変更。
 *   認定番号は申請の category_slug と一致する項目にのみ参考表示（カードには載せない）。
 * - 肩書: organization → 無ければ professionals.title ＋ store_name → 編集プレビューで最終補正。
 * - 既存カード解決: professional_id OR professionals.user_id の両方で探す。
 *
 * ⚠️ card_uid モデル（重要・CEO訂正 2026-07-01）:
 *   DB上の card_uid はすべて「物理カードが実在する番号」。status='unlinked' は
 *   「物理カードはあるが、まだタップ紐付けされていない在庫」を意味する。
 *   → unlinked 在庫プールを認定カードに流用してはいけない（同一 uid の物理カード2枚 =
 *     /nfc/{uid} 衝突）。認定カードの card_uid は次の2択のみ:
 *     (A) 本人が既に持っている card_uid を再利用（professional_id OR user_id で解決）
 *     (B) 本人が1枚も持っていない場合のみ §16 の発番で新規 mint（🛑承認後）
 *   在庫プール(unlinked)には一切触れない。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  STRENGTH_ENGLISH_NAMES,
  PERSONALITY_ENGLISH_NAMES,
  getCertificationTier,
  PROVEN_THRESHOLD,
  SPECIALIST_THRESHOLD,
  type CertificationTier,
} from '@/lib/constants'

// ===== 型定義 =====

export type CardItem = {
  /** proof_items.id (= certification_applications.category_slug) */
  proofId: string
  /** proof_items.label（長文・体験談調） */
  labelJa: string
  /** proof_items.strength_label（短語・カード見出し用） */
  strengthJa: string
  /** STRENGTH_ENGLISH_NAMES 由来。無ければ strengthJa にフォールバック */
  strengthEn: string
  /** proof_items.tab（カテゴリ値） */
  tab: string | null
  /** その項目の生proof票数（vote_summary） */
  voteCount: number
  /** §9 判定。認定は30票以上なので実質 SPECIALIST/MASTER/LEGEND */
  tier: CertificationTier | null
  /** この項目（カテゴリ）の既存認定番号（RP-2026-XXXX）。未採番なら null */
  certNumber: string | null
}

export type CardData = {
  proId: string
  userId: string | null
  nameKanji: string
  nameRomaji: string
  /** 肩書・所属（フォールバック解決済み） */
  organization: string
  /** organization がDBに無く title/store_name で補完したか */
  orgFallbackUsed: boolean
  title: string | null
  storeName: string | null
  photoUrl: string | null
  /** 申請時に選んだ「カードに顔写真を使う」か（最新申請の値・既定true）。管理UIのトグル初期値 */
  usePhotoOnCard: boolean
  topPersonalityJa: string | null
  topPersonalityEn: string | null
  /** 全項目の最高ティア（裏カード上部の語） */
  highestTier: CertificationTier | null
  /** 本人の既存 card_uid（再利用対象）。1枚も無ければ null */
  cardUid: string | null
  /** 本人のカードが存在するか（true=再利用 / false=§16でmintが必要） */
  cardRegistered: boolean
  /** カードは user_id で見つかったが professional_id が未設定（backfillの小UPDATE候補・🛑承認後） */
  cardProfessionalIdMissing: boolean
  /** 本人のカードが1枚も無い（§16で新規mintが必要・🛑承認後）。在庫プールは流用しない */
  needsMint: boolean
  items: CardItem[]
}

// ===== ティアランク（最高ティア算出用） =====

const TIER_RANK: Record<CertificationTier, number> = {
  PROVEN: 1,
  SPECIALIST: 2,
  MASTER: 3,
  LEGEND: 4,
}

function higherTier(
  a: CertificationTier | null,
  b: CertificationTier | null
): CertificationTier | null {
  if (!a) return b
  if (!b) return a
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b
}

// ===== 表示名ヘルパー =====

/**
 * カード表示用の氏名を「姓　名」（全角スペース区切り）に組む。
 * - full_name_kanji が last_name で始まれば そこで分割（例: 田中雄己 + 田中 → 田中　雄己）
 *   ※ full_name_kanji の漢字を尊重（professionals.first_name が仮名の場合でも崩れない）
 * - 既に空白入りなら全角スペースへ正規化
 * - それ以外は last_name＋first_name / proName / フォールバック
 */
function resolveNameKanji(
  appKanji: string | null | undefined,
  proName: string | null | undefined,
  last: string | null | undefined,
  first: string | null | undefined
): string {
  const a = (appKanji || '').trim()
  const l = (last || '').trim()
  const f = (first || '').trim()

  if (a) {
    if (l && a.startsWith(l)) {
      const rest = a.slice(l.length).trim()
      return rest ? `${l}　${rest}` : a
    }
    if (/\s/.test(a)) return a.replace(/\s+/, '　')
    if (l && f) return `${l}　${f}`
    return a
  }

  const n = (proName || '').trim()
  if (n) return /\s/.test(n) ? n.replace(/\s+/, '　') : n
  const combined = `${l}　${f}`.trim()
  return combined || 'REALPROOF Pro'
}

// ===== 既存カード解決（professional_id OR user_id） =====

type NfcCardRow = {
  card_uid: string
  professional_id: string | null
  user_id: string | null
  status: string | null
  linked_at: string | null
}

export async function resolveExistingCard(
  sb: SupabaseClient,
  proId: string,
  userId: string | null
): Promise<NfcCardRow | null> {
  const orParts = [`professional_id.eq.${proId}`]
  if (userId) orParts.push(`user_id.eq.${userId}`)

  const { data } = await sb
    .from('nfc_cards')
    .select('card_uid, professional_id, user_id, status, linked_at')
    .or(orParts.join(','))
    .order('linked_at', { ascending: false, nullsFirst: false })

  const rows = (data as NfcCardRow[] | null) ?? []
  if (rows.length === 0) return null
  // active を優先、無ければ先頭
  return rows.find((r) => r.status === 'active') ?? rows[0]
}

// ===== 認定番号の次番号（RP-2026-NNNN, >=0013） =====

/** 既存 certification_number の最大 +1。起点は最低 0013（0001〜0012は採番済み）。 */
export async function getNextCertNumber(sb: SupabaseClient): Promise<string> {
  const { data } = await sb
    .from('certification_applications')
    .select('certification_number')
    .not('certification_number', 'is', null)

  const year = 2026
  const prefix = `RP-${year}-`
  let max = 12 // 既存が0012まで採番済み → 次は最低0013
  for (const row of (data as { certification_number: string | null }[] | null) ?? []) {
    const cn = row.certification_number || ''
    if (cn.startsWith(prefix)) {
      const n = parseInt(cn.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

// ===== メインビルダー =====

type CertAppRow = {
  professional_id: string
  category_slug: string | null
  certification_number: string | null
  full_name_kanji: string | null
  full_name_romaji: string | null
  top_personality: string | null
  organization: string | null
  status: string | null
  use_photo_on_card: boolean | null
  applied_at: string | null
}

type ProRow = {
  id: string
  name: string | null
  last_name: string | null
  first_name: string | null
  title: string | null
  store_name: string | null
  photo_url: string | null
  user_id: string | null
}

/**
 * proId のカードデータを組み立てる。認定申請が1件も無ければ null。
 */
export async function buildCardData(
  sb: SupabaseClient,
  proId: string
): Promise<CardData | null> {
  // 1. 認定申請（このプロの全カテゴリ）
  const { data: appsRaw } = await sb
    .from('certification_applications')
    .select(
      'professional_id, category_slug, certification_number, full_name_kanji, full_name_romaji, top_personality, organization, status, use_photo_on_card, applied_at'
    )
    .eq('professional_id', proId)
  const apps = (appsRaw as CertAppRow[] | null) ?? []
  if (apps.length === 0) return null

  // 顔写真をカードに使うか：最新申請(applied_at)の値。既定 true（写真あり運用踏襲）。
  const latestApp = [...apps].sort((a, b) => (b.applied_at || '').localeCompare(a.applied_at || ''))[0]
  const usePhotoOnCard = latestApp?.use_photo_on_card !== false

  // 2. professionals 行
  const { data: proRaw } = await sb
    .from('professionals')
    .select('id, name, last_name, first_name, title, store_name, photo_url, user_id')
    .eq('id', proId)
    .is('deactivated_at', null)
    .maybeSingle()
  const pro = (proRaw as ProRow | null) ?? null

  // 3. 実績ベースの項目: vote_summary から 15票以上(PROVEN_THRESHOLD)の proof_id を全取得（票数降順）
  const { data: vsRaw } = await sb
    .from('vote_summary')
    .select('proof_id, vote_count')
    .eq('professional_id', proId)
  const achieved = ((vsRaw as { proof_id: string; vote_count: number | null }[] | null) ?? [])
    .map((r) => ({ proofId: r.proof_id, voteCount: r.vote_count ?? 0 }))
    .filter((r) => r.voteCount >= PROVEN_THRESHOLD)
    .sort((a, b) => b.voteCount - a.voteCount)

  // 4. proof_items ラベルを一括解決
  const proofIds = achieved.map((a) => a.proofId)
  const piMap = new Map<
    string,
    { id: string; label: string | null; strength_label: string | null; tab: string | null }
  >()
  if (proofIds.length > 0) {
    const { data: piRaw } = await sb
      .from('proof_items')
      .select('id, label, strength_label, tab')
      .in('id', proofIds)
    for (const p of (piRaw as { id: string; label: string | null; strength_label: string | null; tab: string | null }[] | null) ?? []) {
      piMap.set(p.id, p)
    }
  }

  // 4b. 申請の認定番号マップ（proof_id = category_slug に一致する項目にのみ参考付与）
  const appCertMap = new Map<string, string>()
  for (const a of apps) {
    if (a.category_slug && a.certification_number) appCertMap.set(a.category_slug, a.certification_number)
  }

  // 5. 項目組み立て（票数降順・実績ベース）
  const items: CardItem[] = achieved.map((a) => {
    const pi = piMap.get(a.proofId)
    const strengthJa = pi?.strength_label ?? ''
    return {
      proofId: a.proofId,
      labelJa: pi?.label ?? '',
      strengthJa,
      strengthEn: STRENGTH_ENGLISH_NAMES[strengthJa] ?? strengthJa,
      tab: pi?.tab ?? null,
      voteCount: a.voteCount,
      tier: getCertificationTier(a.voteCount),
      certNumber: appCertMap.get(a.proofId) ?? null,
    }
  })

  const highestTier = items.reduce<CertificationTier | null>(
    (acc, it) => higherTier(acc, it.tier),
    null
  )

  // 6. 肩書・所属フォールバック
  const appOrg = (apps[0].organization || '').trim()
  const fallbackOrg = [pro?.title, pro?.store_name]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(' ／ ')
  const organization = appOrg || fallbackOrg || ''
  const orgFallbackUsed = !appOrg && !!fallbackOrg

  // 7. 人柄
  const topPersonalityJa = apps[0].top_personality || null
  const topPersonalityEn = topPersonalityJa
    ? PERSONALITY_ENGLISH_NAMES[topPersonalityJa] ?? null
    : null

  // 8. 既存カード解決（再利用 or mint 判定）
  const userId = pro?.user_id ?? null
  const card = await resolveExistingCard(sb, proId, userId)
  const cardProfessionalIdMissing = !!card && !card.professional_id

  return {
    proId,
    userId,
    nameKanji: resolveNameKanji(
      apps[0].full_name_kanji,
      pro?.name,
      pro?.last_name,
      pro?.first_name
    ),
    nameRomaji: (apps[0].full_name_romaji || '').trim(),
    organization,
    orgFallbackUsed,
    title: pro?.title ?? null,
    storeName: pro?.store_name ?? null,
    photoUrl: pro?.photo_url ?? null,
    usePhotoOnCard,
    topPersonalityJa,
    topPersonalityEn,
    highestTier,
    cardUid: card?.card_uid ?? null,
    cardRegistered: !!card,
    cardProfessionalIdMissing,
    needsMint: !card,
    items,
  }
}

// ============================================================
// 認定賞状（Certificate）— 1カテゴリ=1枚
// ============================================================
//
// ⚠️ 賞状ティアのしきい値は【30/50/100/500】。カードのメダル判定(15/30/50/100・
//    getCertificationTier)とは別系列。混同禁止。賞状に PROVEN(15) は無い。

export type CertificateTier = 'SPECIALIST' | 'MASTER' | 'LEGEND' | 'IMMORTAL'

/** 賞状ティア判定（そのカテゴリの生proof票数）。30未満は null（認定対象外）。 */
export function getCertificateTier(voteCount: number): CertificateTier | null {
  if (voteCount >= 500) return 'IMMORTAL'
  if (voteCount >= 100) return 'LEGEND'
  if (voteCount >= 50) return 'MASTER'
  if (voteCount >= 30) return 'SPECIALIST'
  return null
}

/** 賞状ティア → 節目の数字（N+ 表示用。生票数は出さない）。 */
export const CERTIFICATE_TIER_MILESTONE: Record<CertificateTier, number> = {
  SPECIALIST: 30,
  MASTER: 50,
  LEGEND: 100,
  IMMORTAL: 500,
}

/** 賞状ティアの序列（レベルアップ判定用） */
const CERT_TIER_RANK: Record<CertificateTier, number> = {
  SPECIALIST: 1,
  MASTER: 2,
  LEGEND: 3,
  IMMORTAL: 4,
}

/**
 * ローマ字を標準表記に整形：各単語の先頭のみ大文字（Title Case）。
 * 例: "YURIKA OTA" → "Yurika Ota" / "Naohiro Okamoto" → "Naohiro Okamoto"
 * ※ 姓名の順序（名 姓）自動是正は行わない（判定困難なため）。最終は編集プレビューで確定。
 */
export function normalizeRomaji(s: string | null | undefined): string {
  return (s || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/** applied_at(ISO) → "YYYY.MM.DD" */
function formatCertDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[1]}.${m[2]}.${m[3]}` : ''
}

export type CertificateEntry = {
  /** proof_items.id (= category_slug) */
  proofId: string
  categoryJa: string
  categoryEn: string
  voteCount: number
  /** 賞状ティア（30/50/100/500）。認定済み前提だが、万一30未満なら null */
  tier: CertificateTier | null
  /** 節目 N+（30/50/100/500）。tier に対応 */
  milestone: number | null
  /** 表示用認定番号。申請があればその番号／送付採番済みなら certificates.cert_number／未確定は null（プレビュー） */
  certNumber: string | null
  /** applied_at 由来 "YYYY.MM.DD" */
  dateText: string
  /** 送付済み手動チェック（certificates.shipped） */
  shipped: boolean
  /** 送付チェック時のティア（certificates.shipped_tier） */
  shippedTier: CertificateTier | null
  /** 送付後にレベルアップ（現ティア > shippedTier）＝要再送 */
  levelUp: boolean
  /** このカテゴリが申請(certification_applications)由来か（番号が申請で確定済み） */
  fromApplication: boolean
}

export type CertificateData = {
  proId: string
  /** 標準整形済みローマ字（初期値。編集プレビューで確定） */
  nameRomaji: string
  entries: CertificateEntry[]
}

/**
 * proId の賞状データを【実績ベース】で組み立てる（CEO確定 2026-07-02）。
 * - 表示範囲＝vote_summary の 30票(SPECIALIST)以上 全カテゴリ（申請有無を問わず・自動反映）。
 * - 認定番号＝(1)申請があればその番号 (2)certificates 採番済みならそれ (3)どちらも無ければ null＝プレビュー。
 * - 送付済み(shipped)・shipped_tier は certificates テーブル由来。levelUp＝現ティア>shipped_tier。
 * 申請が1件も無いプロは対象外（null）。
 */
export async function buildCertificates(
  sb: SupabaseClient,
  proId: string
): Promise<CertificateData | null> {
  // 申請（名前・番号・申請日の参照元）
  const { data: appsRaw } = await sb
    .from('certification_applications')
    .select('category_slug, certification_number, full_name_romaji, applied_at')
    .eq('professional_id', proId)
  const apps =
    (appsRaw as {
      category_slug: string | null
      certification_number: string | null
      full_name_romaji: string | null
      applied_at: string | null
    }[] | null) ?? []
  if (apps.length === 0) return null
  const appByCat = new Map<string, { certification_number: string | null; applied_at: string | null }>()
  for (const a of apps) {
    if (a.category_slug) appByCat.set(a.category_slug, { certification_number: a.certification_number, applied_at: a.applied_at })
  }

  // 実績（30票以上の全カテゴリ）
  const { data: vsRaw } = await sb
    .from('vote_summary')
    .select('proof_id, vote_count')
    .eq('professional_id', proId)
  const achieved = ((vsRaw as { proof_id: string; vote_count: number | null }[] | null) ?? [])
    .map((r) => ({ proofId: r.proof_id, voteCount: r.vote_count ?? 0 }))
    .filter((r) => r.voteCount >= SPECIALIST_THRESHOLD)
    .sort((a, b) => b.voteCount - a.voteCount)

  // ラベル
  const proofIds = achieved.map((a) => a.proofId)
  const piMap = new Map<string, string>()
  if (proofIds.length > 0) {
    const { data: piRaw } = await sb.from('proof_items').select('id, strength_label').in('id', proofIds)
    for (const p of (piRaw as { id: string; strength_label: string | null }[] | null) ?? []) {
      if (p.strength_label) piMap.set(p.id, p.strength_label)
    }
  }

  // certificates 状態（送付済み・shipped_tier・採番済み番号）
  const { data: certRaw } = await sb
    .from('certificates')
    .select('proof_id, cert_number, shipped, shipped_tier')
    .eq('professional_id', proId)
  const certByProof = new Map<
    string,
    { cert_number: string | null; shipped: boolean; shipped_tier: string | null }
  >()
  for (const c of (certRaw as { proof_id: string; cert_number: string | null; shipped: boolean | null; shipped_tier: string | null }[] | null) ?? []) {
    certByProof.set(c.proof_id, { cert_number: c.cert_number, shipped: !!c.shipped, shipped_tier: c.shipped_tier })
  }

  const entries: CertificateEntry[] = achieved.map((a) => {
    const strengthJa = piMap.get(a.proofId) ?? ''
    const tier = getCertificateTier(a.voteCount)
    const app = appByCat.get(a.proofId)
    const cert = certByProof.get(a.proofId)
    const fromApplication = !!app
    // 番号解決: 申請 → certificates採番 → null(プレビュー)
    const certNumber = app?.certification_number ?? cert?.cert_number ?? null
    const shipped = cert?.shipped ?? false
    const shippedTier = (cert?.shipped_tier as CertificateTier | null) ?? null
    const levelUp =
      shipped && !!shippedTier && !!tier && CERT_TIER_RANK[tier] > CERT_TIER_RANK[shippedTier]
    return {
      proofId: a.proofId,
      categoryJa: strengthJa,
      categoryEn: STRENGTH_ENGLISH_NAMES[strengthJa] ?? strengthJa,
      voteCount: a.voteCount,
      tier,
      milestone: tier ? CERTIFICATE_TIER_MILESTONE[tier] : null,
      certNumber,
      dateText: formatCertDate(app?.applied_at ?? null),
      shipped,
      shippedTier,
      levelUp,
      fromApplication,
    }
  })

  return {
    proId,
    nameRomaji: normalizeRomaji(apps[0].full_name_romaji),
    entries,
  }
}

/** 認定番号の次番号を certification_applications + certificates 両テーブル横断で採番（max+1）。 */
async function getNextCertNumberAcross(sb: SupabaseClient): Promise<string> {
  const year = 2026
  const prefix = `RP-${year}-`
  let max = 0
  const [{ data: a }, { data: c }] = await Promise.all([
    sb.from('certification_applications').select('certification_number'),
    sb.from('certificates').select('cert_number'),
  ])
  const scan = (v: string | null) => {
    if (v && v.startsWith(prefix)) {
      const n = parseInt(v.slice(prefix.length), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  for (const r of (a as { certification_number: string | null }[] | null) ?? []) scan(r.certification_number)
  for (const r of (c as { cert_number: string | null }[] | null) ?? []) scan(r.cert_number)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

/**
 * 賞状の「送付済み」トグル（管理者操作）。
 * - shipped=true: certificates を upsert（shipped_tier=現ティア, shipped_at=now()）。
 *   申請由来でなく未採番なら、この時に認定番号を採番（両テーブル横断 max+1・UNIQUEリトライ）。
 * - shipped=false: shipped を落とすのみ（採番済み番号は保持＝再利用しない）。
 * 戻り値: 更新後の { proofId, shipped, certNumber, tier }。
 */
export async function setCertificateShipped(
  sb: SupabaseClient,
  proId: string,
  proofId: string,
  shipped: boolean
): Promise<{ ok: boolean; error?: string; proofId: string; shipped: boolean; certNumber: string | null; tier: CertificateTier | null }> {
  // 現ティア（ライブ票数）
  const { data: vs } = await sb
    .from('vote_summary')
    .select('vote_count')
    .eq('professional_id', proId)
    .eq('proof_id', proofId)
    .maybeSingle()
  const voteCount = (vs as { vote_count: number | null } | null)?.vote_count ?? 0
  const tier = getCertificateTier(voteCount)
  if (shipped && !tier) {
    return { ok: false, error: 'not_certified', proofId, shipped: false, certNumber: null, tier: null }
  }

  // 既存 certificates 行 / 申請の番号
  const [{ data: existing }, { data: app }] = await Promise.all([
    sb.from('certificates').select('cert_number, shipped_tier').eq('professional_id', proId).eq('proof_id', proofId).maybeSingle(),
    sb.from('certification_applications').select('certification_number').eq('professional_id', proId).eq('category_slug', proofId).maybeSingle(),
  ])
  const existingRow = existing as { cert_number: string | null; shipped_tier: string | null } | null
  const appNumber = (app as { certification_number: string | null } | null)?.certification_number ?? null

  // 保存する cert_number: 申請番号は certificates 側には持たない(表示時に解決)。
  // 未申請 & 送付 & 未採番 のときだけ新規採番。
  let certNumberToStore: string | null = existingRow?.cert_number ?? null
  if (shipped && !appNumber && !certNumberToStore) {
    // 採番（UNIQUE違反リトライ）
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidate = await getNextCertNumberAcross(sb)
      const { error } = await sb.from('certificates').upsert(
        {
          professional_id: proId,
          proof_id: proofId,
          cert_number: candidate,
          shipped: true,
          shipped_tier: tier,
          shipped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'professional_id,proof_id' }
      )
      if (!error) {
        return { ok: true, proofId, shipped: true, certNumber: candidate, tier }
      }
      if (error.code === '23505') continue // 番号衝突 → 採り直し
      return { ok: false, error: error.message, proofId, shipped: false, certNumber: null, tier }
    }
    return { ok: false, error: 'number_assign_failed', proofId, shipped: false, certNumber: null, tier }
  }

  // 通常 upsert（採番不要）
  const { error } = await sb.from('certificates').upsert(
    {
      professional_id: proId,
      proof_id: proofId,
      cert_number: certNumberToStore,
      shipped,
      shipped_tier: shipped ? tier : (existingRow?.shipped_tier ?? null),
      shipped_at: shipped ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'professional_id,proof_id' }
  )
  if (error) {
    return { ok: false, error: error.message, proofId, shipped: false, certNumber: certNumberToStore, tier }
  }
  return { ok: true, proofId, shipped, certNumber: appNumber ?? certNumberToStore, tier }
}

/** 「申請中」フラグを立てる（新規申請時。apply ルートから呼ぶ）。 */
export async function setCertPending(sb: SupabaseClient, proId: string): Promise<void> {
  await sb
    .from('certification_pending')
    .upsert({ professional_id: proId, pending: true, updated_at: new Date().toISOString() }, { onConflict: 'professional_id' })
}

/** 「申請中」フラグを消す（管理者操作）。 */
export async function clearCertPending(sb: SupabaseClient, proId: string): Promise<void> {
  await sb
    .from('certification_pending')
    .upsert({ professional_id: proId, pending: false, updated_at: new Date().toISOString() }, { onConflict: 'professional_id' })
}

// ===== 認定者一覧（プロ選択UI用） =====

export type CertifiableProSummary = {
  proId: string
  nameKanji: string
  itemCount: number
  cardUid: string | null
  cardRegistered: boolean
  /** 未処理の申請がある（申請中バッジ点灯） */
  pending: boolean
}

/**
 * 認定申請があるプロを一覧化（1プロ=複数カテゴリを集約）。
 * 選択UIのリスト表示に使う。
 */
export async function listCertifiablePros(
  sb: SupabaseClient
): Promise<CertifiableProSummary[]> {
  const { data: appsRaw } = await sb
    .from('certification_applications')
    .select('professional_id, full_name_kanji')
  const apps = (appsRaw as { professional_id: string; full_name_kanji: string | null }[] | null) ?? []

  const byPro = new Map<string, { nameKanji: string; count: number }>()
  for (const a of apps) {
    const cur = byPro.get(a.professional_id)
    if (cur) cur.count += 1
    else byPro.set(a.professional_id, { nameKanji: (a.full_name_kanji || '').trim(), count: 1 })
  }

  const proIds = Array.from(byPro.keys())
  if (proIds.length === 0) return []

  // professionals の user_id と、既存カードを一括解決
  const { data: prosRaw } = await sb
    .from('professionals')
    .select('id, user_id, name')
    .in('id', proIds)
  const proInfo = new Map(
    ((prosRaw as { id: string; user_id: string | null; name: string | null }[] | null) ?? []).map(
      (p) => [p.id, p]
    )
  )

  // カード一括解決（professional_id / user_id 両方）
  const userIds = Array.from(proInfo.values())
    .map((p) => p.user_id)
    .filter(Boolean) as string[]
  const { data: cardsRaw } = await sb
    .from('nfc_cards')
    .select('card_uid, professional_id, user_id, status, linked_at')
    .or(
      [
        proIds.length ? `professional_id.in.(${proIds.join(',')})` : '',
        userIds.length ? `user_id.in.(${userIds.join(',')})` : '',
      ]
        .filter(Boolean)
        .join(',')
    )
  const cards = (cardsRaw as NfcCardRow[] | null) ?? []

  // 「申請中」フラグ一括取得
  const { data: pendRaw } = await sb
    .from('certification_pending')
    .select('professional_id, pending')
    .in('professional_id', proIds)
  const pendingSet = new Set(
    ((pendRaw as { professional_id: string; pending: boolean | null }[] | null) ?? [])
      .filter((r) => r.pending)
      .map((r) => r.professional_id)
  )

  const result: CertifiableProSummary[] = []
  for (const [proId, info] of Array.from(byPro.entries())) {
    const pInfo = proInfo.get(proId)
    const uid = pInfo?.user_id ?? null
    const matches = cards.filter(
      (c) => c.professional_id === proId || (uid && c.user_id === uid)
    )
    const active = matches.find((c) => c.status === 'active') ?? matches[0] ?? null
    result.push({
      proId,
      nameKanji: info.nameKanji || (pInfo?.name || '').trim() || '(名前なし)',
      itemCount: info.count,
      cardUid: active?.card_uid ?? null,
      cardRegistered: !!active,
      pending: pendingSet.has(proId),
    })
  }
  return result.sort((a, b) => a.nameKanji.localeCompare(b.nameKanji, 'ja'))
}
