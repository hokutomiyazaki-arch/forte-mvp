'use client'

// ============================================================
// NFCカード注文 — 発送ラベル出力 管理画面
// フロー: 注文一覧 → 注文選択 → ハガキ横サイズのラベルをプレビュー → PNG ダウンロード
// PNG はシール台紙に等倍で貼れば発送シールが完成する（フチなし全面デザイン）。
//
// 画像化はクライアント側 html2canvas（voice-share と同方式）。任意の顧客氏名・住所を
// 扱うため、サーバ側 next/og + subset フォントでは豆腐になる → OS のシステムフォントで描く。
// ============================================================

import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import html2canvas from 'html2canvas'
import { LABEL_SENDER, parseRecipient, type ParsedRecipient } from '@/lib/shipping-label'

// 高級感のあるライトパレット（印刷ラベル向け・インク量と可読性を両立）
const C = {
  ivory: '#FAF8F2',
  navy: '#1A1A2E',
  gold: '#C9A84C',
  navySoft: 'rgba(26,26,46,0.62)',
  goldSoft: 'rgba(201,168,76,0.55)',
  // 管理画面自体のダーク UI（既存 admin と同系統）
  pageBg: '#0A0A0A',
  panel: '#1A1A2E',
  panelLine: '#2A2A44',
  gray: '#8A8AA0',
  red: '#EF4444',
}

// ラベル原寸（px）。148:100 ハガキ横 ≒ 1.478。出力は width 1748px（≒300dpi）に scale up。
const LABEL_W = 760
const LABEL_H = 514
const EXPORT_W = 1748

type Order = {
  id: string
  created_at: string | null
  customer_name: string | null
  email: string | null
  shipping_address: unknown
  amount: number | null
  status: string | null
  professional_id: string | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[1]}/${Number(m[2])}/${Number(m[3])}` : ''
}

// ── ラベル本体（原寸 760×514）。プレビューと出力で同一マークアップを共有 ──
function LabelInner({
  r,
  innerRef,
}: {
  r: ParsedRecipient
  innerRef?: Ref<HTMLDivElement>
}) {
  const gothic = '"Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Noto Sans JP", sans-serif'
  const mincho = '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP", serif'
  const serifLatin = 'Georgia, "Times New Roman", serif'

  return (
    <div
      ref={innerRef}
      style={{
        width: LABEL_W,
        height: LABEL_H,
        background: C.ivory,
        color: C.navy,
        fontFamily: gothic,
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* 二重の金細フレーム */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          right: 20,
          bottom: 20,
          border: `1.5px solid ${C.gold}`,
          boxSizing: 'border-box',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 25,
          left: 25,
          right: 25,
          bottom: 25,
          border: `0.5px solid ${C.goldSoft}`,
          boxSizing: 'border-box',
        }}
      />

      {/* コンテンツ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: '44px 50px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 上段: 発送元 ／ ブランド */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ maxWidth: 400 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: C.gold, fontWeight: 700, marginBottom: 6 }}>
              FROM ／ 発送元
            </div>
            <div style={{ fontSize: 15, fontFamily: serifLatin, fontWeight: 600, color: C.navy, marginBottom: 3 }}>
              {LABEL_SENDER.office}
            </div>
            <div style={{ fontSize: 11, color: C.navySoft, lineHeight: 1.55 }}>
              {LABEL_SENDER.company}
              <br />〒{LABEL_SENDER.postalCode}　{LABEL_SENDER.address}
            </div>
          </div>
          <div style={{ textAlign: 'right', paddingTop: 2 }}>
            <div style={{ fontSize: 17, letterSpacing: 4, fontFamily: serifLatin, color: C.navy, fontWeight: 600 }}>
              REAL PROOF
            </div>
            <div style={{ fontSize: 8, letterSpacing: 3, color: C.gold, marginTop: 3 }}>
              CERTIFICATION OFFICE
            </div>
          </div>
        </div>

        {/* 区切りの金線 */}
        <div style={{ height: 1, background: C.goldSoft, margin: '20px 0 0' }} />

        {/* 主役: 送付先 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingLeft: 24,
          }}
        >
          <div style={{ fontSize: 22, letterSpacing: 4, color: C.navy, fontWeight: 500, marginBottom: 14 }}>
            〒 {r.postalCode || '　　　-　　　　'}
          </div>
          <div style={{ fontSize: 27, fontWeight: 600, color: C.navy, lineHeight: 1.45, letterSpacing: 1 }}>
            {r.addressMain || '（住所情報なし）'}
          </div>
          {r.addressBuilding && (
            <div style={{ fontSize: 20, color: C.navy, lineHeight: 1.4, letterSpacing: 1, marginTop: 4 }}>
              {r.addressBuilding}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 30 }}>
            <span style={{ fontSize: 46, fontFamily: mincho, letterSpacing: 6, color: C.navy }}>
              {r.name || '　　　　'}
            </span>
            <span style={{ fontSize: 30, fontFamily: mincho, letterSpacing: 2, color: C.navy, marginLeft: 14 }}>
              様
            </span>
          </div>
          <div style={{ width: 220, height: 1, background: C.gold, marginTop: 12 }} />
        </div>
      </div>
    </div>
  )
}

export default function CardOrdersLabelPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const captureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/admin/card-orders', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) {
          setError('未ログインです。/admin/login からログインしてください。')
          return null
        }
        return r.json()
      })
      .then((j) => {
        if (j) setOrders(j.orders ?? [])
      })
      .catch(() => setError('注文一覧の取得に失敗しました'))
      .finally(() => setLoading(false))
  }, [])

  const selected = useMemo(() => orders.find((o) => o.id === selectedId) ?? null, [orders, selectedId])
  const recipient = useMemo<ParsedRecipient>(
    () => parseRecipient(selected?.shipping_address, selected?.customer_name),
    [selected]
  )

  const download = async () => {
    if (!captureRef.current || !selected) return
    setDownloading(true)
    try {
      const el = captureRef.current
      const scale = EXPORT_W / el.offsetWidth
      const canvas = await html2canvas(el, {
        scale,
        backgroundColor: C.ivory,
        useCORS: true,
        width: el.offsetWidth,
        height: el.offsetHeight,
      })
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
      const safeName = (recipient.name || 'noname').replace(/\s+/g, '')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `RP-label_${safeName}_${selected.id.slice(0, 8)}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
    } catch {
      setError('ラベル画像の生成に失敗しました')
    } finally {
      setDownloading(false)
    }
  }

  const previewScale = 0.62

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, color: '#fff', padding: '32px 24px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>NFCカード注文 — 発送ラベル</h1>
        <p style={{ fontSize: 13, color: C.gray, marginBottom: 24 }}>
          注文を選ぶとハガキ横サイズ（148×100mm）のラベルをプレビューします。PNG をハガキ大のシール台紙に等倍で貼れば発送シールになります。
        </p>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: `1px solid ${C.red}`, color: '#FCA5A5', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* 注文一覧 */}
          <div style={{ flex: '1 1 420px', minWidth: 340 }}>
            <div style={{ background: C.panel, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.panelLine}` }}>
              <div style={{ padding: '12px 16px', fontSize: 12, color: C.gray, borderBottom: `1px solid ${C.panelLine}` }}>
                {loading ? '読み込み中…' : `注文 ${orders.length} 件`}
              </div>
              {!loading && orders.length === 0 && !error && (
                <div style={{ padding: 20, fontSize: 13, color: C.gray }}>注文はまだありません。</div>
              )}
              {orders.map((o) => {
                const r = parseRecipient(o.shipping_address, o.customer_name)
                const active = o.id === selectedId
                return (
                  <button
                    key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '14px 16px',
                      background: active ? '#222240' : 'transparent',
                      border: 'none',
                      borderLeft: active ? `3px solid ${C.gold}` : '3px solid transparent',
                      borderBottom: `1px solid ${C.panelLine}`,
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{r.name || o.customer_name || '（宛名なし）'}</span>
                      <span style={{ fontSize: 11, color: C.gray, whiteSpace: 'nowrap' }}>{fmtDate(o.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.gray, marginTop: 4, lineHeight: 1.5 }}>
                      〒{r.postalCode || '—'}　{r.oneLine || '（住所情報なし）'}
                    </div>
                    {r.incomplete && (
                      <div style={{ fontSize: 11, color: C.gold, marginTop: 4 }}>⚠ 宛先情報が不足しています（要確認）</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* プレビュー + 出力 */}
          <div style={{ flex: '1 1 480px', minWidth: 340 }}>
            {!selected ? (
              <div style={{ background: C.panel, border: `1px dashed ${C.panelLine}`, borderRadius: 12, padding: 40, textAlign: 'center', color: C.gray, fontSize: 13 }}>
                左の一覧から注文を選択してください。
              </div>
            ) : (
              <div>
                <div
                  style={{
                    width: LABEL_W * previewScale,
                    height: LABEL_H * previewScale,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                    borderRadius: 4,
                    overflow: 'hidden',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                    <LabelInner r={recipient} />
                  </div>
                </div>

                <button
                  onClick={download}
                  disabled={downloading}
                  style={{
                    background: C.gold,
                    color: C.navy,
                    border: 'none',
                    borderRadius: 8,
                    padding: '12px 22px',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: downloading ? 'default' : 'pointer',
                    opacity: downloading ? 0.6 : 1,
                  }}
                >
                  {downloading ? '生成中…' : 'PNG をダウンロード（148×100mm / 高解像度）'}
                </button>
                <div style={{ fontSize: 11, color: C.gray, marginTop: 10, lineHeight: 1.6 }}>
                  宛名: {recipient.name || '—'}／メール: {selected.email || '—'}
                  <br />
                  ※ 印刷は「等倍・フチなし・実際のサイズ」設定で。ハガキ大シール台紙推奨。
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* html2canvas 用の原寸オフスクリーンノード（キャプチャ対象） */}
      <div style={{ position: 'fixed', top: 0, left: -10000, pointerEvents: 'none' }} aria-hidden>
        {selected && <LabelInner r={recipient} innerRef={captureRef} />}
      </div>
    </div>
  )
}
