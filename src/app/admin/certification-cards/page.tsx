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

  const filteredPros = pros.filter((p) => p.nameKanji.includes(search) || p.proId.includes(search))

  const previewUrl = (side: 'front' | 'back') =>
    previewPayload
      ? `/api/admin/certification-card/render/${side}?d=${encodeURIComponent(previewPayload)}`
      : null

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.cream, padding: 24, fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 24, color: C.gold, marginBottom: 4 }}>認定カード生成</h1>
      <p style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>
        プロを選択 → 内容を確認・補正 → 表裏PNG（2035×1300）をダウンロード。
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
        </div>
      </div>
    </div>
  )
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
