'use client'

import { useState, useEffect, useCallback } from 'react'

// ============================================================
// 認定カード生成 管理画面
// フロー: プロ選択 → 編集プレビュー → 表裏PNGプレビュー → ダウンロード
// card_uid は本人の既存カードを再利用。無ければ §16 で mint（🛑承認後）。在庫プールは流用しない。
// DB書き込み（backfill/mint）はここでは実行しない（承認後に別途）。
// ============================================================

const C = {
  bg: '#0A0A0A',
  surface: '#1A1A2E',
  surfaceLight: '#222240',
  gold: '#C9A84C',
  cream: '#FAFAF7',
  green: '#22C55E',
  red: '#EF4444',
  amber: '#F59E0B',
  gray: '#6B7280',
}

type Tier = 'PROVEN' | 'SPECIALIST' | 'MASTER' | 'LEGEND' | null

type ApiItem = {
  proofId: string
  labelJa: string
  strengthJa: string
  strengthEn: string
  tab: string | null
  voteCount: number
  tier: Tier
  certNumber: string | null
}

type ApiCardData = {
  proId: string
  userId: string | null
  nameKanji: string
  nameRomaji: string
  organization: string
  orgFallbackUsed: boolean
  title: string | null
  storeName: string | null
  photoUrl: string | null
  usePhotoOnCard: boolean
  topPersonalityJa: string | null
  topPersonalityEn: string | null
  highestTier: Tier
  cardUid: string | null
  cardRegistered: boolean
  cardProfessionalIdMissing: boolean
  needsMint: boolean
  wantMetal: boolean
  wantShield: boolean
  payment: { hasUnpaid: boolean; unpaidAmount: number; anyPaid: boolean }
  cardOrderedAt: string | null
  items: ApiItem[]
}

type ProSummary = {
  proId: string
  nameKanji: string
  itemCount: number
  cardUid: string | null
  cardRegistered: boolean
  pending: boolean
  wantMetal: boolean
  hasUnpaid: boolean
  cardOrderedAt: string | null
}

type CertTier = 'SPECIALIST' | 'MASTER' | 'LEGEND' | 'IMMORTAL'
type ApiCertificate = {
  proofId: string
  categoryJa: string
  categoryEn: string
  voteCount: number
  tier: CertTier | null
  milestone: number | null
  certNumber: string | null
  dateText: string
  shipped: boolean
  shippedTier: CertTier | null
  levelUp: boolean
  fromApplication: boolean
}
type ApiCertificates = { proId: string; nameRomaji: string; entries: ApiCertificate[] }

// 賞状の編集状態（日付は行ごとに上書き可）
type EditCert = ApiCertificate & { dateEdit: string }

// 編集可能な項目状態
type EditItem = ApiItem & { visible: boolean }

// ISO日時 → "YYYY/M/D"（発注日の簡易表示）
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  return `${m[1]}/${Number(m[2])}/${Number(m[3])}`
}

// utf8-safe base64
function b64Payload(obj: unknown): string {
  const json = JSON.stringify(obj)
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

const TIER_RANK: Record<string, number> = { PROVEN: 1, SPECIALIST: 2, MASTER: 3, LEGEND: 4 }

export default function CertificationCardsPage() {
  const [pros, setPros] = useState<ProSummary[]>([])
  const [search, setSearch] = useState('')
  const [selectedProId, setSelectedProId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [nameKanji, setNameKanji] = useState('')
  const [nameRomaji, setNameRomaji] = useState('')
  const [organization, setOrganization] = useState('')
  const [orgFallbackUsed, setOrgFallbackUsed] = useState(false)
  const [personalityJa, setPersonalityJa] = useState<string | null>(null)
  const [personalityEn, setPersonalityEn] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [usePhoto, setUsePhoto] = useState(true)
  const [cardUid, setCardUid] = useState<string | null>(null)
  const [cardRegistered, setCardRegistered] = useState(false)
  const [cardProfessionalIdMissing, setCardProfessionalIdMissing] = useState(false)
  const [needsMint, setNeedsMint] = useState(false)
  const [items, setItems] = useState<EditItem[]>([])
  const [nextCertNumber, setNextCertNumber] = useState<string | null>(null)
  // カード材質: pvc（フルカラー・メダル・顔写真）/ metal（レーザー彫刻・単色ゴールド・写真なし）
  const [cardVariant, setCardVariant] = useState<'pvc' | 'metal'>('pvc')
  // 申請者が選んだ物理プロダクト（金属カード／盾）。材質トグルの初期化と発注の目安に使う。
  const [appliedMetal, setAppliedMetal] = useState(false)
  const [appliedShield, setAppliedShield] = useState(false)
  // 入金状況（Stripe Webhook で自動更新される payment_status 由来）
  const [payment, setPayment] = useState<{ hasUnpaid: boolean; unpaidAmount: number; anyPaid: boolean }>({ hasUnpaid: false, unpaidAmount: 0, anyPaid: false })
  // 業者へのカード発注が完了した日時（null=未発注）
  const [cardOrderedAt, setCardOrderedAt] = useState<string | null>(null)

  const [previewPayload, setPreviewPayload] = useState<string | null>(null)

  // タブ（カード / 賞状）
  const [tab, setTab] = useState<'card' | 'cert'>('card')
  // 賞状
  const [certNameRomaji, setCertNameRomaji] = useState('')
  const [certs, setCerts] = useState<EditCert[]>([])
  const [certPreview, setCertPreview] = useState<Record<string, string>>({}) // proofId -> payload

  // プロ一覧ロード
  useEffect(() => {
    fetch('/api/admin/certification-card/data', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setPros(j.pros ?? []))
      .catch(() => setError('プロ一覧の取得に失敗しました'))
  }, [])

  // プロ選択 → データロード
  const loadPro = useCallback((proId: string) => {
    setLoading(true)
    setError(null)
    setPreviewPayload(null)
    fetch(`/api/admin/certification-card/data?proId=${encodeURIComponent(proId)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) {
          setError(j.error === 'not_found' ? '認定申請が見つかりません' : j.error)
          return
        }
        const d = j.data as ApiCardData
        setNameKanji(d.nameKanji)
        setNameRomaji(d.nameRomaji)
        setOrganization(d.organization)
        setOrgFallbackUsed(d.orgFallbackUsed)
        setPersonalityJa(d.topPersonalityJa)
        setPersonalityEn(d.topPersonalityEn)
        setPhotoUrl(d.photoUrl)
        setUsePhoto(d.usePhotoOnCard !== false && !!d.photoUrl)
        setCardUid(d.cardUid)
        setCardRegistered(d.cardRegistered)
        setCardProfessionalIdMissing(d.cardProfessionalIdMissing)
        setNeedsMint(d.needsMint)
        // 申請で金属を選んでいれば材質トグルを金属で初期化（手動で切替可）
        setCardVariant(d.wantMetal ? 'metal' : 'pvc')
        setAppliedMetal(!!d.wantMetal)
        setAppliedShield(!!d.wantShield)
        setPayment(d.payment ?? { hasUnpaid: false, unpaidAmount: 0, anyPaid: false })
        setCardOrderedAt(d.cardOrderedAt ?? null)
        setItems(d.items.map((it) => ({ ...it, visible: true })))
        setNextCertNumber(j.nextCertNumber ?? null)
        const c = j.certificates as ApiCertificates | null
        setCertNameRomaji(c?.nameRomaji ?? '')
        setCerts((c?.entries ?? []).map((e) => ({ ...e, dateEdit: e.dateText })))
        setCertPreview({})
      })
      .catch(() => setError('データ取得に失敗しました'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (selectedProId) loadPro(selectedProId)
  }, [selectedProId, loadPro])

  // 表示中の項目（visible=true・最大6件）
  const visibleItems = items.filter((it) => it.visible).slice(0, 6)
  const visibleCount = items.filter((it) => it.visible).length

  const highestTier: Tier = visibleItems.reduce<Tier>((acc, it) => {
    if (!it.tier) return acc
    if (!acc || TIER_RANK[it.tier] > TIER_RANK[acc]) return it.tier
    return acc
  }, null)

  // プレビュー/生成用ペイロード
  const buildPayload = useCallback(() => {
    const uid = cardUid || 'RP-XXXX'
    const isMetal = cardVariant === 'metal'
    return b64Payload({
      nameKanji,
      nameRomaji,
      organization,
      cardUid: uid,
      highestTier,
      personalityJa,
      personalityEn,
      // 金属は彫刻不可のため顔写真を必ず OFF
      photoUrl: !isMetal && usePhoto ? photoUrl : null,
      variant: cardVariant,
      items: visibleItems.map((it) => ({
        strengthJa: it.strengthJa,
        strengthEn: it.strengthEn,
        tier: it.tier,
      })),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameKanji, nameRomaji, organization, cardUid, highestTier, personalityJa, personalityEn, photoUrl, usePhoto, items, cardVariant])

  const refreshPreview = () => setPreviewPayload(buildPayload())

  // 項目操作
  const move = (idx: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }
  const toggle = (idx: number) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, visible: !it.visible } : it)))
  }

  // ダウンロード
  const download = async (side: 'front' | 'back') => {
    const payload = buildPayload()
    const url = `/api/admin/certification-card/render/${side}?d=${encodeURIComponent(payload)}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      setError(`生成に失敗しました (${side}: ${res.status})`)
      return
    }
    const blob = await res.blob()
    const safeName = nameKanji.replace(/\s+/g, '')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `RP-${cardUid || 'XXXX'}_${safeName}_${cardVariant}_${side}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
  }

  // ===== 賞状 =====
  // 賞状レンダリング入力（単票URL・一括PDFで共通利用）
  const certObj = (c: EditCert) => ({
    nameRomaji: certNameRomaji,
    tier: c.tier ?? 'SPECIALIST',
    milestone: c.milestone ?? 30,
    categoryJa: c.categoryJa,
    categoryEn: c.categoryEn,
    certNumber: c.certNumber ?? '',
    dateText: c.dateEdit,
  })
  const certPayload = (c: EditCert): string => b64Payload(certObj(c))

  const certUrl = (c: EditCert) =>
    `/api/admin/certification-card/render/certificate?d=${encodeURIComponent(certPayload(c))}`

  const refreshCertPreview = (c: EditCert) =>
    setCertPreview((prev) => ({ ...prev, [c.proofId]: certPayload(c) }))

  const setCertDate = (proofId: string, v: string) =>
    setCerts((prev) => prev.map((c) => (c.proofId === proofId ? { ...c, dateEdit: v } : c)))

  const downloadCert = async (c: EditCert, format: 'png' | 'pdf' = 'png') => {
    const url = certUrl(c) + (format === 'pdf' ? '&format=pdf' : '')
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      setError(`賞状生成に失敗しました (${res.status})`)
      return
    }
    const blob = await res.blob()
    const safeName = certNameRomaji.replace(/\s+/g, '')
    const safeCat = c.categoryEn.replace(/[^A-Za-z0-9]+/g, '')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `RP-cert_${c.certNumber || 'X'}_${safeName}_${safeCat}.${format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
  }

  const downloadAllCerts = async (format: 'png' | 'pdf' = 'pdf') => {
    if (certs.length === 0) return
    // PDF は全カテゴリを1つの連続PDF（ページ続き）にまとめて1回でDL。PNGは性質上1枚ずつ。
    if (format === 'pdf') {
      const res = await fetch('/api/admin/certification-card/render/certificate-bundle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ certs: certs.map(certObj) }),
      })
      if (!res.ok) {
        setError(`賞状の一括PDF生成に失敗しました (${res.status})`)
        return
      }
      const blob = await res.blob()
      const safeName = certNameRomaji.replace(/\s+/g, '')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `RP-cert_${safeName}_${certs.length}枚.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
      return
    }
    for (const c of certs) await downloadCert(c, format)
  }

  // 送付済みトグル（採番はサーバー側で確定）
  const toggleShipped = async (c: EditCert, shipped: boolean) => {
    const res = await fetch('/api/admin/certification-card/ship', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ proId: selectedProId, proofId: c.proofId, shipped }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || '送付状態の更新に失敗しました'); return }
    setCerts((prev) => prev.map((x) => x.proofId === c.proofId ? {
      ...x,
      shipped: data.shipped,
      certNumber: data.certNumber ?? x.certNumber,
      shippedTier: data.shipped ? (data.tier ?? x.tier) : x.shippedTier,
      levelUp: false,
    } : x))
  }

  // 申請中フラグを消す
  const clearPending = async (proId: string) => {
    const res = await fetch('/api/admin/certification-card/pending', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ proId }),
    })
    if (res.ok) setPros((prev) => prev.map((p) => p.proId === proId ? { ...p, pending: false } : p))
  }

  // プロ一覧を再取得（mint/入金でバッジを更新するため）
  const reloadPros = () => {
    fetch('/api/admin/certification-card/data', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setPros(j.pros ?? []))
      .catch(() => {})
  }

  // 新規 card_uid を発番（mint）。ボタン1つで完結。確認ダイアログ付き。
  const [minting, setMinting] = useState(false)
  const doMint = async () => {
    if (!selectedProId || minting) return
    if (!window.confirm(
      'この人に新規 card_uid を1つ発番（mint）して nfc_cards に作成します。\n' +
      '在庫は流用せず本人専用の番号を作ります。miteca発注時のNFC欄にも同じ番号を入力してください。\n\nよろしいですか？'
    )) return
    setError(null)
    setMinting(true)
    try {
      const res = await fetch('/api/admin/certification-card/mint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ proId: selectedProId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'mint に失敗しました'); return }
      loadPro(selectedProId)
      reloadPros()
    } finally {
      setMinting(false)
    }
  }

  // 入金状況の手動切替（入金済み ⇄ 未入金）
  const setPaid = async (paid: boolean) => {
    if (!selectedProId) return
    if (!window.confirm(paid ? 'この申請を「入金済み」にします。よろしいですか？' : '「未入金」に戻します。よろしいですか？')) return
    setError(null)
    const res = await fetch('/api/admin/certification-card/payment', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ proId: selectedProId, paid }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || '入金状況の更新に失敗しました'); return }
    loadPro(selectedProId)
    reloadPros()
  }

  // カード発注完了の切替（チェックで日付記録・外すとクリア）
  const setCardOrdered = async (ordered: boolean) => {
    if (!selectedProId) return
    setError(null)
    const res = await fetch('/api/admin/certification-card/card-order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ proId: selectedProId, ordered }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || '発注状況の更新に失敗しました'); return }
    setCardOrderedAt(data.cardOrderedAt ?? null)
    setPros((prev) => prev.map((p) => p.proId === selectedProId ? { ...p, cardOrderedAt: data.cardOrderedAt ?? null } : p))
  }

  const filteredPros = pros.filter((p) => p.nameKanji.includes(search) || p.proId.includes(search))

  const previewUrl = (side: 'front' | 'back') =>
    previewPayload
      ? `/api/admin/certification-card/render/${side}?d=${encodeURIComponent(previewPayload)}`
      : null

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.cream, padding: 24, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <a href="/admin/dashboard" style={{ fontSize: 12, color: C.gray, textDecoration: 'none', border: `1px solid ${C.surfaceLight}`, borderRadius: 8, padding: '6px 12px' }}>← 管理トップ</a>
        <a href="/admin/certification-labels" style={{ fontSize: 12, color: '#1a1a1a', background: C.gold, textDecoration: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 700 }}>発送ラベル（認定申請者）→</a>
      </div>
      <h1 style={{ fontSize: 24, color: C.gold, marginBottom: 4 }}>認定カード・賞状 生成</h1>
      <p style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>
        プロを選択 → タブでカード / 賞状を切替 → 内容を確認・補正 → PNGをダウンロード。
      </p>

      {error && (
        <div style={{ background: '#3a1a1a', border: `1px solid ${C.red}`, padding: 12, borderRadius: 8, marginBottom: 16, color: '#ffb4b4' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* 左: プロ選択 */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="名前で検索"
            style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${C.surfaceLight}`, background: C.surface, color: C.cream, marginBottom: 10 }}
          />
          <div style={{ maxHeight: 520, overflowY: 'auto', border: `1px solid ${C.surfaceLight}`, borderRadius: 8 }}>
            {filteredPros.map((p) => (
              <div
                key={p.proId}
                onClick={() => setSelectedProId(p.proId)}
                style={{
                  padding: '10px 12px',
                  background: selectedProId === p.proId ? C.surfaceLight : 'transparent',
                  borderBottom: `1px solid ${C.surface}`, color: C.cream, cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, flex: 1 }}>{p.nameKanji}</span>
                  {p.wantMetal && (
                    <span style={{ fontSize: 10, color: '#1a1a1a', background: C.gold, borderRadius: 999, padding: '2px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>金属</span>
                  )}
                  {p.hasUnpaid && (
                    <span style={{ fontSize: 10, color: '#fff', background: C.red, borderRadius: 999, padding: '2px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>未入金</span>
                  )}
                  {p.cardOrderedAt && (
                    <span style={{ fontSize: 10, color: '#1a1a1a', background: C.green, borderRadius: 999, padding: '2px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>発注済 {fmtDate(p.cardOrderedAt)}</span>
                  )}
                  {p.pending && (
                    <>
                      <span style={{ fontSize: 10, color: '#1a1a1a', background: C.amber, borderRadius: 999, padding: '2px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>申請中</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); clearPending(p.proId) }}
                        style={{ fontSize: 10, color: C.gray, background: 'transparent', border: `1px solid ${C.surfaceLight}`, borderRadius: 6, padding: '2px 6px', cursor: 'pointer' }}
                      >消す</button>
                    </>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>
                  {p.itemCount}項目 ・ {p.cardRegistered ? `card ${p.cardUid}` : 'カードなし（要mint）'}
                </div>
              </div>
            ))}
            {filteredPros.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: C.gray }}>該当なし</div>
            )}
          </div>
        </div>

        {/* 右: 編集 + プレビュー */}
        <div style={{ flex: 1, minWidth: 480 }}>
          {loading && <div style={{ color: C.gray }}>読み込み中…</div>}

          {!loading && selectedProId && (
            <>
              {/* タブ切替（カード / 賞状） */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button onClick={() => setTab('card')} style={tabBtn(tab === 'card')}>認定カード</button>
                <button onClick={() => setTab('cert')} style={tabBtn(tab === 'cert')}>認定賞状（{certs.length}枚）</button>
              </div>

              {tab === 'card' && (
              <>
              {/* 材質切替（PVC / 金属）。金属は単色ゴールド・彫刻・顔写真なしの別系統 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: C.gray, marginRight: 4 }}>材質:</span>
                <button onClick={() => setCardVariant('pvc')} style={tabBtn(cardVariant === 'pvc')}>PVC（フルカラー）</button>
                <button onClick={() => setCardVariant('metal')} style={tabBtn(cardVariant === 'metal')}>金属（彫刻・単色ゴールド）</button>
              </div>
              {(appliedMetal || appliedShield) && (
                <div style={{ fontSize: 12, color: C.cream, background: 'rgba(201,168,76,0.12)', border: `1px solid ${C.gold}`, borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
                  申請者が選択した物理プロダクト:{' '}
                  {appliedMetal && <strong style={{ color: C.gold }}>金属カード</strong>}
                  {appliedMetal && appliedShield && ' ／ '}
                  {appliedShield && <strong style={{ color: C.gold }}>盾</strong>}
                  {appliedMetal && <span style={{ color: C.gray }}>（材質を金属で初期化済み）</span>}
                </div>
              )}
              {cardVariant === 'metal' && (
                <div style={{ fontSize: 12, color: C.gray, marginBottom: 16, lineHeight: 1.6 }}>
                  金属カードはレーザー彫刻のため、全要素を単色ゴールドで描画・顔写真は使いません。
                  ティアはメダル画像ではなく <span style={{ color: C.gold }}>SPECIALIST / MASTER / LEGEND</span> のテキストで彫ります（PROVEN/未達は非表示）。
                  背景は <code>public/card-assets/front-bg-metal.png</code> / <code>back-bg-metal.png</code> を配置すると反映されます（未配置時は暗色プレビュー）。
                </div>
              )}

              {/* 入金状況（Stripe Webhook で自動反映。制作・発送前の確認用） */}
              <div style={{ marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ color: C.gray }}>入金状況:</span>
                {payment.hasUnpaid ? (
                  <span style={{ color: '#fff', background: C.red, borderRadius: 6, padding: '3px 10px', fontWeight: 700 }}>
                    未入金 ¥{payment.unpaidAmount.toLocaleString()}
                  </span>
                ) : payment.anyPaid ? (
                  <span style={{ color: '#1a1a1a', background: C.green, borderRadius: 6, padding: '3px 10px', fontWeight: 700 }}>入金済み</span>
                ) : (
                  <span style={{ color: C.gray, border: `1px solid ${C.surfaceLight}`, borderRadius: 6, padding: '3px 10px' }}>無料（決済不要）</span>
                )}
                {payment.hasUnpaid && (
                  <button onClick={() => setPaid(true)} style={{ ...btnOutline, padding: '4px 12px', fontSize: 12, borderColor: C.green, color: C.green }}>
                    入金済みにする
                  </button>
                )}
                {/* 入金済みが1件でもあれば、いつでも取消可能（過去分・誤操作・Webup前の補正を戻せる） */}
                {payment.anyPaid && (
                  <button onClick={() => setPaid(false)} style={{ ...btnOutline, padding: '4px 12px', fontSize: 12, color: C.gray, borderColor: C.surfaceLight }}>
                    入金確認を消す（未入金に戻す）
                  </button>
                )}
                {payment.hasUnpaid && (
                  <span style={{ color: C.amber, fontSize: 12 }}>※ 入金確認まで制作・発送を保留してください</span>
                )}
              </div>

              {/* 業者へのカード発注 完了チェック（チェックで日付記録・発注済みか一目で確認） */}
              <div style={{ marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ color: C.gray }}>業者発注:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: cardOrderedAt ? C.green : C.cream }}>
                  <input type="checkbox" checked={!!cardOrderedAt} onChange={(e) => setCardOrdered(e.target.checked)} />
                  カード発注 完了
                </label>
                {cardOrderedAt ? (
                  <span style={{ color: '#1a1a1a', background: C.green, borderRadius: 6, padding: '3px 10px', fontWeight: 700 }}>
                    発注済み {fmtDate(cardOrderedAt)}
                  </span>
                ) : (
                  <span style={{ color: C.amber, fontSize: 12 }}>※ 未発注 — 業者への発注が済んだらチェック</span>
                )}
              </div>

              {/* card_uid 状態（再利用 / backfill / mint の3分岐。在庫プールは流用しない） */}
              {cardRegistered && !cardProfessionalIdMissing && (
                <div style={{ background: C.surface, padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                  カード番号（card_uid）: <strong style={{ color: C.gold, fontSize: 18 }}>{cardUid}</strong>
                  <span style={{ color: C.green, marginLeft: 10 }}>本人の既存カードを再利用</span>
                  <div style={{ color: C.gray, marginTop: 4, fontSize: 12 }}>
                    ※ miteca発注時のNFC欄にも同じ番号を入力してください。QR飛び先: https://realproof.jp/nfc/{cardUid}
                  </div>
                </div>
              )}
              {cardRegistered && cardProfessionalIdMissing && (
                <div style={{ background: '#2a2410', border: `1px solid ${C.amber}`, padding: 14, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                  <div style={{ color: C.amber, fontWeight: 700, marginBottom: 6 }}>
                    card_uid: <strong style={{ color: C.gold, fontSize: 18 }}>{cardUid}</strong>（本人の既存カードを再利用）
                  </div>
                  <div style={{ color: C.gray }}>
                    このカードは user_id で見つかりましたが <code>professional_id</code> が未設定です。
                    カード生成はこのまま可能ですが、紐付けを正すため professional_id を補完する小UPDATEを推奨します
                    （🛑 承認後・二重ガード付き）。在庫プールには触れません。
                  </div>
                </div>
              )}
              {needsMint && (
                <div style={{ background: '#2a2410', border: `1px solid ${C.amber}`, padding: 14, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                  <div style={{ color: C.amber, fontWeight: 700, marginBottom: 6 }}>⚠ 本人のカードが1枚もありません — 新規 mint が必要（🛑 §16・承認後）</div>
                  <div style={{ color: C.gray, marginBottom: 12 }}>
                    認定カードには本人専用の card_uid が必要です。<strong>在庫(unlinked)プールは物理カードが実在するため流用しません</strong>
                    （同一 uid の二枚化＝/nfc/ 衝突になる）。§16 の発番で新しい card_uid を1つ mint し nfc_cards に作成してから生成します。
                    mint はCEO承認後にのみ実行します。
                  </div>
                  <button onClick={doMint} disabled={minting}
                    style={{ ...btnGold, opacity: minting ? 0.5 : 1, cursor: minting ? 'not-allowed' : 'pointer' }}>
                    {minting ? '発番中…' : '新規 card_uid を発番（mint）してこの人に紐付け'}
                  </button>
                </div>
              )}

              {/* 編集フォーム */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: C.gray }}>
                  氏名（漢字）
                  <input value={nameKanji} onChange={(e) => setNameKanji(e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${C.surfaceLight}`, background: C.surface, color: C.cream, marginTop: 4 }} />
                </label>
                <label style={{ fontSize: 12, color: C.gray }}>
                  氏名（ローマ字）
                  <input value={nameRomaji} onChange={(e) => setNameRomaji(e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${C.surfaceLight}`, background: C.surface, color: C.cream, marginTop: 4 }} />
                </label>
                <label style={{ fontSize: 12, color: C.gray, gridColumn: '1 / 3' }}>
                  肩書・所属 {orgFallbackUsed && <span style={{ color: C.amber }}>（DB未設定のため title/store_name で補完）</span>}
                  <input value={organization} onChange={(e) => setOrganization(e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${C.surfaceLight}`, background: C.surface, color: C.cream, marginTop: 4 }} />
                </label>
              </div>

              {/* 人柄 */}
              <div style={{ fontSize: 13, color: C.gray, marginBottom: 12 }}>
                人柄: <span style={{ color: C.cream }}>{personalityJa || '—'}</span>
                {personalityEn && <span style={{ color: C.gray }}> / {personalityEn}</span>}
                <span style={{ marginLeft: 16 }}>最高ティア: <span style={{ color: C.gold }}>{highestTier || '—'}</span></span>
              </div>

              {/* 項目リスト（並び替え・ON/OFF・最大6） */}
              <div style={{ marginBottom: 8, fontSize: 13, color: C.gray }}>
                SPECIALTY項目（表示 {Math.min(visibleCount, 6)} / {items.length}件、最大6件・上から順に表示）
                {visibleCount > 6 && <span style={{ color: C.amber }}> ※7件目以降は非表示になります</span>}
              </div>
              <div style={{ border: `1px solid ${C.surfaceLight}`, borderRadius: 8, marginBottom: 20 }}>
                {items.map((it, idx) => {
                  const overflow = it.visible && items.filter((x, i) => x.visible && i <= idx).length > 6
                  return (
                    <div key={it.proofId}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${C.surface}`, opacity: it.visible && !overflow ? 1 : 0.4 }}>
                      <input type="checkbox" checked={it.visible} onChange={() => toggle(idx)} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14 }}>{it.strengthJa}
                          <span style={{ color: C.gray, fontSize: 12, marginLeft: 8 }}>{it.strengthEn}</span>
                        </div>
                        <div style={{ fontSize: 11, color: C.gray }}>
                          {it.voteCount}票 ・ <span style={{ color: C.gold }}>{it.tier || '—'}</span>
                          {it.certNumber && <span> ・ 認定番号 {it.certNumber}</span>}
                        </div>
                      </div>
                      <button onClick={() => move(idx, -1)} style={arrowBtn}>↑</button>
                      <button onClick={() => move(idx, 1)} style={arrowBtn}>↓</button>
                    </div>
                  )
                })}
              </div>

              {/* 顔写真トグル（申請時の選択で初期化。写真未設定のプロ・金属材質では非表示） */}
              {photoUrl && cardVariant !== 'metal' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: C.cream }}>
                  <input type="checkbox" checked={usePhoto} onChange={(e) => setUsePhoto(e.target.checked)} />
                  表に顔写真を使う（申請者の選択で初期化・金属選択者はOFF。ここで上書き可）
                </label>
              )}

              {/* アクション */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <button onClick={refreshPreview} style={btnGold}>プレビュー更新</button>
                <button onClick={() => download('front')} disabled={needsMint}
                  style={{ ...btnOutline, opacity: needsMint ? 0.4 : 1, cursor: needsMint ? 'not-allowed' : 'pointer' }}>
                  表PNGをダウンロード
                </button>
                <button onClick={() => download('back')} disabled={needsMint}
                  style={{ ...btnOutline, opacity: needsMint ? 0.4 : 1, cursor: needsMint ? 'not-allowed' : 'pointer' }}>
                  裏PNGをダウンロード
                </button>
              </div>
              {needsMint && (
                <div style={{ fontSize: 12, color: C.amber, marginBottom: 12 }}>
                  ※ card_uid が未 mint のためダウンロードは無効です（プレビューは仮値 RP-XXXX）。§16 で mint 後に本番QR/番号で生成できます。
                </div>
              )}

              {/* プレビュー画像 */}
              {previewPayload && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>表 (front)</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl('front')!} alt="front" style={{ width: '100%', maxWidth: 700, border: `1px solid ${C.surfaceLight}`, borderRadius: 8 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: C.gray, marginBottom: 6 }}>裏 (back)</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl('back')!} alt="back" style={{ width: '100%', maxWidth: 700, border: `1px solid ${C.surfaceLight}`, borderRadius: 8 }} />
                  </div>
                </div>
              )}
              </>
              )}

              {tab === 'cert' && (
              <>
                <div style={{ background: C.surface, padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                  <div style={{ color: C.gray, marginBottom: 8 }}>
                    賞状は1カテゴリ=1枚。SPECIALIST以上(30票)の達成項目を全て自動表示（新達成も随時反映）。
                    認定番号は「送付済み」チェック時に確定採番（未確定はプレビュー）。ティアは実績票数(30/50/100/500)で背景自動。
                    送付後にレベルアップすると <span style={{ color: C.amber }}>⬆レベルアップ未送付</span> が付きます（要再送）。日付は上書き可。
                  </div>
                  <label style={{ fontSize: 12, color: C.gray }}>
                    氏名（ローマ字・全カテゴリ共通・標準表記に自動整形済み）
                    <input value={certNameRomaji} onChange={(e) => setCertNameRomaji(e.target.value)}
                      style={{ display: 'block', width: '100%', maxWidth: 420, padding: 8, borderRadius: 6, border: `1px solid ${C.surfaceLight}`, background: C.bg, color: C.cream, marginTop: 4 }} />
                  </label>
                </div>

                {certs.length === 0 && (
                  <div style={{ color: C.gray, fontSize: 13 }}>認定申請（カテゴリ）がありません。</div>
                )}

                {certs.length > 0 && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                    <button onClick={() => downloadAllCerts('pdf')} style={btnGold}>全カテゴリの賞状をPDFでDL（{certs.length}枚）</button>
                    <button onClick={() => downloadAllCerts('png')} style={btnOutline}>全カテゴリPNG</button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {certs.map((c) => (
                    <div key={c.proofId} style={{
                      border: `1px solid ${c.levelUp ? C.amber : C.surfaceLight}`, borderRadius: 10, padding: 14,
                      background: c.shipped && !c.levelUp ? 'rgba(34,197,94,0.06)' : 'transparent',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {c.categoryJa} <span style={{ color: C.gray, fontSize: 12 }}>{c.categoryEn}</span>
                            {c.levelUp && (
                              <span style={{ fontSize: 10, color: '#1a1a1a', background: C.amber, borderRadius: 999, padding: '2px 8px', fontWeight: 700 }}>
                                ⬆ レベルアップ未送付
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: C.gray }}>
                            <span style={{ color: C.gold }}>{c.tier ?? '—'}</span> ・ {c.milestone}+ ・ 認定番号 {c.certNumber ?? 'プレビュー(未確定)'} ・ {c.voteCount}票
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <label style={{ fontSize: 12, color: c.shipped ? C.green : C.cream, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                            <input type="checkbox" checked={c.shipped} onChange={(e) => toggleShipped(c, e.target.checked)} />
                            送付済み
                          </label>
                          <label style={{ fontSize: 11, color: C.gray }}>日付
                            <input value={c.dateEdit} onChange={(e) => setCertDate(c.proofId, e.target.value)}
                              style={{ width: 130, padding: 6, borderRadius: 6, border: `1px solid ${C.surfaceLight}`, background: C.bg, color: C.cream, marginLeft: 6 }} />
                          </label>
                          <button onClick={() => refreshCertPreview(c)} style={btnGold}>プレビュー</button>
                          <button onClick={() => downloadCert(c, 'pdf')} style={btnGold}>PDF</button>
                          <button onClick={() => downloadCert(c, 'png')} style={btnOutline}>PNG</button>
                        </div>
                      </div>
                      {certPreview[c.proofId] && (
                        <div style={{ marginTop: 12 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={certUrl(c)} alt={c.categoryEn} style={{ width: '100%', maxWidth: 640, border: `1px solid ${C.surfaceLight}`, borderRadius: 8 }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
    border: `1px solid ${C.gold}`,
    background: active ? C.gold : 'transparent',
    color: active ? '#1a1a1a' : C.gold,
  }
}

const arrowBtn: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.surfaceLight}`, background: C.surface, color: C.cream, cursor: 'pointer',
}
const btnGold: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 8, border: 'none', background: C.gold, color: '#1a1a1a', fontWeight: 700, cursor: 'pointer',
}
const btnOutline: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 8, border: `1px solid ${C.gold}`, background: 'transparent', color: C.gold, cursor: 'pointer',
}
