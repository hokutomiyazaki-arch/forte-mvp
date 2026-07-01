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
  topPersonalityJa: string | null
  topPersonalityEn: string | null
  highestTier: Tier
  cardUid: string | null
  cardRegistered: boolean
  cardProfessionalIdMissing: boolean
  needsMint: boolean
  items: ApiItem[]
}

type ProSummary = {
  proId: string
  nameKanji: string
  itemCount: number
  cardUid: string | null
  cardRegistered: boolean
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
}
type ApiCertificates = { proId: string; nameRomaji: string; entries: ApiCertificate[] }

// 賞状の編集状態（日付は行ごとに上書き可）
type EditCert = ApiCertificate & { dateEdit: string }

// 編集可能な項目状態
type EditItem = ApiItem & { visible: boolean }

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
  const [cardUid, setCardUid] = useState<string | null>(null)
  const [cardRegistered, setCardRegistered] = useState(false)
  const [cardProfessionalIdMissing, setCardProfessionalIdMissing] = useState(false)
  const [needsMint, setNeedsMint] = useState(false)
  const [items, setItems] = useState<EditItem[]>([])
  const [nextCertNumber, setNextCertNumber] = useState<string | null>(null)

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
        setCardUid(d.cardUid)
        setCardRegistered(d.cardRegistered)
        setCardProfessionalIdMissing(d.cardProfessionalIdMissing)
        setNeedsMint(d.needsMint)
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
    return b64Payload({
      nameKanji,
      nameRomaji,
      organization,
      cardUid: uid,
      highestTier,
      personalityJa,
      personalityEn,
      items: visibleItems.map((it) => ({
        strengthJa: it.strengthJa,
        strengthEn: it.strengthEn,
        tier: it.tier,
      })),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameKanji, nameRomaji, organization, cardUid, highestTier, personalityJa, personalityEn, items])

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
    a.download = `RP-${cardUid || 'XXXX'}_${safeName}_${side}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
  }

  // ===== 賞状 =====
  const certPayload = (c: EditCert): string =>
    b64Payload({
      nameRomaji: certNameRomaji,
      tier: c.tier ?? 'SPECIALIST',
      milestone: c.milestone ?? 30,
      categoryJa: c.categoryJa,
      categoryEn: c.categoryEn,
      certNumber: c.certNumber ?? '',
      dateText: c.dateEdit,
    })

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
    for (const c of certs) await downloadCert(c, format)
  }

  const filteredPros = pros.filter((p) => p.nameKanji.includes(search) || p.proId.includes(search))

  const previewUrl = (side: 'front' | 'back') =>
    previewPayload
      ? `/api/admin/certification-card/render/${side}?d=${encodeURIComponent(previewPayload)}`
      : null

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.cream, padding: 24, fontFamily: 'sans-serif' }}>
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
              <button
                key={p.proId}
                onClick={() => setSelectedProId(p.proId)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px',
                  background: selectedProId === p.proId ? C.surfaceLight : 'transparent',
                  border: 'none', borderBottom: `1px solid ${C.surface}`, color: C.cream, cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 14 }}>{p.nameKanji}</div>
                <div style={{ fontSize: 11, color: C.gray }}>
                  {p.itemCount}項目 ・ {p.cardRegistered ? `card ${p.cardUid}` : 'カードなし（要mint）'}
                </div>
              </button>
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
                  <div style={{ color: C.gray }}>
                    認定カードには本人専用の card_uid が必要です。<strong>在庫(unlinked)プールは物理カードが実在するため流用しません</strong>
                    （同一 uid の二枚化＝/nfc/ 衝突になる）。§16 の発番で新しい card_uid を1つ mint し nfc_cards に作成してから生成します。
                    mint はCEO承認後にのみ実行します。
                  </div>
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
                    賞状は1カテゴリ=1枚。認定番号は既存のものをそのまま表示（新規採番なし）。ティアは実績票数(30/50/100/500)で背景を自動出し分け。日付は申請日（上書き可）。
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
                    <div key={c.proofId} style={{ border: `1px solid ${C.surfaceLight}`, borderRadius: 10, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 15 }}>{c.categoryJa} <span style={{ color: C.gray, fontSize: 12 }}>{c.categoryEn}</span></div>
                          <div style={{ fontSize: 12, color: C.gray }}>
                            <span style={{ color: C.gold }}>{c.tier ?? '—'}</span> ・ {c.milestone}+ ・ 認定番号 {c.certNumber ?? '—'} ・ {c.voteCount}票
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
