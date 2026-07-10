'use client'

// ============================================================
// 認定申請者 — 発送ラベル出力 管理画面
// 対象: certification_applications（認定申請者）。NFCカード購入者(card_orders)は別系統。
//
// フロー:
//   1) 申請者一覧から選択 → 単票プレビュー → PNG ダウンロード（ハガキ横 148×100mm 相当）
//   2) A4・4面ラベル台紙（92×131mm×4・角丸／A-one 28447 相当）に最大4枚を配置 → PDF 出力
//      ・セルは縦長なのでラベル（横デザイン）を 90°回転してセルにフィットさせる。
//      ・余ったマスは空白。どのマスに置くかはグリッドで自由に選べる（台紙の使い回し対応）。
//
// 画像化はクライアント側 html2canvas + pdf-lib（既存依存）。任意の申請者氏名・住所を扱うため、
// サーバ側 next/og + subset フォントでは豆腐になる → OS のシステムフォント（Mac のヒラギノ等）で描く。
// ============================================================

import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import html2canvas from 'html2canvas'
import { PDFDocument } from 'pdf-lib'
import { LABEL_SENDER, recipientFromApplication, type ParsedRecipient } from '@/lib/shipping-label'

// 高級感のあるライトパレット（印刷ラベル向け・インク量と可読性を両立）
const C = {
  ivory: '#FAF8F2',
  navy: '#1A1A2E',
  gold: '#C9A84C',
  navySoft: 'rgba(26,26,46,0.62)',
  goldSoft: 'rgba(201,168,76,0.55)',
  pageBg: '#0A0A0A',
  panel: '#1A1A2E',
  panelLine: '#2A2A44',
  gray: '#8A8AA0',
  red: '#EF4444',
}

// 単票 PNG 用の原寸（px）。148:100 ハガキ横 ≒ 1.478。width 1748px（≒300dpi）に scale up。
const SINGLE_W = 760
const SINGLE_H = 514
const SINGLE_EXPORT_W = 1748

// ── A4・4面台紙の実測レイアウト（mm）── 出典: 製品パッケージ寸法図（92×131・4面・角丸／A-one 28447 相当）
// 横: 左余白15 + 92 + 列間6 + 92 → 右余白5 ／ 縦: 上余白18 + 131 + 131 + 下余白17（行間0・導出値）
const MM_TO_PT = 72 / 25.4
const PAGE_W_MM = 210
const PAGE_H_MM = 297
const CELL_W_MM = 92
const CELL_H_MM = 131
const BLEED_MM = 1
const CELLS = [
  { x: 15, y: 18 },
  { x: 113, y: 18 },
  { x: 15, y: 149 },
  { x: 113, y: 149 },
]
const CELL_MARK = ['①', '②', '③', '④']

// PDF 用ラベル原寸（px）。回転後にセル比 131:92 へフィットさせるため、回転前は横向きで比 131/92≒1.424。
const PDF_BASE_W = 760
const PDF_BASE_H = Math.round(PDF_BASE_W * (CELL_W_MM / CELL_H_MM))
const PDF_EXPORT_W = Math.round((CELL_H_MM / 25.4) * 300)

type AppGroup = {
  key: string
  professional_id: string | null
  full_name_kanji: string | null
  full_name_romaji: string | null
  postal_code: string | null
  prefecture: string | null
  city_address: string | null
  building: string | null
  phone: string | null
  organization: string | null
  applied_at: string | null
  categories: string[]
  anyUnpaid: boolean
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[1]}/${Number(m[2])}/${Number(m[3])}` : ''
}

// 横向き canvas を時計回りに 90°回転して縦向き canvas を返す（PDF セルにフィットさせるため）
function rotateCanvasCW(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = src.height
  out.height = src.width
  const ctx = out.getContext('2d')
  if (ctx) {
    ctx.translate(out.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(src, 0, 0)
  }
  return out
}

// ── ラベル本体。プレビュー・単票 PNG・PDF で同一マークアップを共有（比だけ props で変える）──
function LabelInner({
  r,
  baseW = SINGLE_W,
  baseH = SINGLE_H,
  innerRef,
}: {
  r: ParsedRecipient
  baseW?: number
  baseH?: number
  innerRef?: Ref<HTMLDivElement>
}) {
  const gothic = '"Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Noto Sans JP", sans-serif'
  const mincho = '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP", serif'
  const serifLatin = 'Georgia, "Times New Roman", serif'

  return (
    <div
      ref={innerRef}
      style={{
        width: baseW,
        height: baseH,
        background: C.ivory,
        color: C.navy,
        fontFamily: gothic,
        position: 'relative',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 20, left: 20, right: 20, bottom: 20, border: `1.5px solid ${C.gold}`, boxSizing: 'border-box' }} />
      <div style={{ position: 'absolute', top: 25, left: 25, right: 25, bottom: 25, border: `0.5px solid ${C.goldSoft}`, boxSizing: 'border-box' }} />

      <div style={{ position: 'absolute', inset: 0, padding: '44px 50px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ maxWidth: 400 }}>
            <div style={{ fontSize: 9, letterSpacing: 3, color: C.gold, fontWeight: 700, marginBottom: 6 }}>FROM ／ 発送元</div>
            <div style={{ fontSize: 15, fontFamily: serifLatin, fontWeight: 600, color: C.navy, marginBottom: 3 }}>{LABEL_SENDER.office}</div>
            <div style={{ fontSize: 11, color: C.navySoft, lineHeight: 1.55 }}>
              {LABEL_SENDER.company}
              <br />〒{LABEL_SENDER.postalCode}　{LABEL_SENDER.address}
            </div>
          </div>
          <div style={{ textAlign: 'right', paddingTop: 2 }}>
            <div style={{ fontSize: 17, letterSpacing: 4, fontFamily: serifLatin, color: C.navy, fontWeight: 600 }}>REAL PROOF</div>
            <div style={{ fontSize: 8, letterSpacing: 3, color: C.gold, marginTop: 3 }}>CERTIFICATION OFFICE</div>
          </div>
        </div>

        <div style={{ height: 1, background: C.goldSoft, margin: '20px 0 0' }} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 24 }}>
          <div style={{ fontSize: 22, letterSpacing: 4, color: C.navy, fontWeight: 500, marginBottom: 14 }}>〒 {r.postalCode || '　　　-　　　　'}</div>
          <div style={{ fontSize: 27, fontWeight: 600, color: C.navy, lineHeight: 1.45, letterSpacing: 1 }}>{r.addressMain || '（住所情報なし）'}</div>
          {r.addressBuilding && (
            <div style={{ fontSize: 20, color: C.navy, lineHeight: 1.4, letterSpacing: 1, marginTop: 4 }}>{r.addressBuilding}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 30 }}>
            <span style={{ fontSize: 46, fontFamily: mincho, letterSpacing: 6, color: C.navy }}>{r.name || '　　　　'}</span>
            <span style={{ fontSize: 30, fontFamily: mincho, letterSpacing: 2, color: C.navy, marginLeft: 14 }}>様</span>
          </div>
          <div style={{ width: 220, height: 1, background: C.gold, marginTop: 12 }} />
        </div>
      </div>
    </div>
  )
}

export default function CertificationLabelsPage() {
  const [groups, setGroups] = useState<AppGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const [cells, setCells] = useState<(string | null)[]>([null, null, null, null])
  const [generatingPdf, setGeneratingPdf] = useState(false)

  const captureRef = useRef<HTMLDivElement>(null)
  const pdfRefs = useRef<Record<number, HTMLDivElement | null>>({})

  useEffect(() => {
    fetch('/api/admin/certification-labels', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) {
          setError('未ログインです。/admin/login からログインしてください。')
          return null
        }
        return r.json()
      })
      .then((j) => {
        if (j) setGroups(j.groups ?? [])
      })
      .catch(() => setError('申請者一覧の取得に失敗しました'))
      .finally(() => setLoading(false))
  }, [])

  const groupByKey = useMemo(() => {
    const m: Record<string, AppGroup> = {}
    for (const g of groups) m[g.key] = g
    return m
  }, [groups])

  const selected = selectedKey ? groupByKey[selectedKey] ?? null : null
  const recipient = useMemo<ParsedRecipient>(
    () => recipientFromApplication(selected ?? {}),
    [selected]
  )

  const placedCount = cells.filter(Boolean).length

  const toggleCell = (i: number) => {
    setCells((prev) => {
      if (prev[i]) {
        const n = [...prev]
        n[i] = null
        return n
      }
      if (!selectedKey) return prev
      const n = prev.map((c) => (c === selectedKey ? null : c))
      n[i] = selectedKey
      return n
    })
  }

  const downloadPng = async () => {
    if (!captureRef.current || !selected) return
    setDownloading(true)
    try {
      const el = captureRef.current
      const scale = SINGLE_EXPORT_W / el.offsetWidth
      const canvas = await html2canvas(el, { scale, backgroundColor: C.ivory, useCORS: true, width: el.offsetWidth, height: el.offsetHeight })
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
      const safeName = (recipient.name || 'noname').replace(/\s+/g, '')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `RP-label_${safeName}.png`
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

  const downloadPdf = async () => {
    const assigned = cells
      .map((key, i) => ({ i, group: key ? groupByKey[key] ?? null : null }))
      .filter((a): a is { i: number; group: AppGroup } => a.group !== null)
    if (assigned.length === 0) return
    setGeneratingPdf(true)
    try {
      const pdf = await PDFDocument.create()
      const page = pdf.addPage([PAGE_W_MM * MM_TO_PT, PAGE_H_MM * MM_TO_PT])
      for (const { i } of assigned) {
        const node = pdfRefs.current[i]
        if (!node) continue
        const scale = PDF_EXPORT_W / node.offsetWidth
        const canvas = await html2canvas(node, { scale, backgroundColor: C.ivory, useCORS: true, width: node.offsetWidth, height: node.offsetHeight })
        const rotated = rotateCanvasCW(canvas)
        const blob = await new Promise<Blob>((resolve) => rotated.toBlob((b) => resolve(b!), 'image/png'))
        const bytes = new Uint8Array(await blob.arrayBuffer())
        const png = await pdf.embedPng(bytes)
        const cell = CELLS[i]
        page.drawImage(png, {
          x: (cell.x - BLEED_MM) * MM_TO_PT,
          y: (PAGE_H_MM - (cell.y + CELL_H_MM + BLEED_MM)) * MM_TO_PT,
          width: (CELL_W_MM + 2 * BLEED_MM) * MM_TO_PT,
          height: (CELL_H_MM + 2 * BLEED_MM) * MM_TO_PT,
        })
      }
      const pdfBytes = await pdf.save()
      // pdf.save() は Uint8Array<ArrayBufferLike>。Blob は ArrayBuffer を要求するので実体コピー。
      const ab = new ArrayBuffer(pdfBytes.byteLength)
      new Uint8Array(ab).set(pdfBytes)
      const blob = new Blob([ab], { type: 'application/pdf' })
      const now = new Date()
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `RP-認定ラベル_A4-4面_${assigned.length}枚_${stamp}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(a.href)
    } catch {
      setError('PDF の生成に失敗しました')
    } finally {
      setGeneratingPdf(false)
    }
  }

  const previewScale = 0.6
  const sheetScale = 240 / PAGE_W_MM

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, color: '#fff', padding: '32px 24px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <a href="/admin/dashboard" style={{ fontSize: 12, color: C.gray, textDecoration: 'none', border: `1px solid ${C.panelLine}`, borderRadius: 8, padding: '6px 12px' }}>← 管理トップ</a>
          <a href="/admin/certification-cards" style={{ fontSize: 12, color: C.gray, textDecoration: 'none', border: `1px solid ${C.panelLine}`, borderRadius: 8, padding: '6px 12px' }}>認定カード生成へ</a>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>認定申請者 — 発送ラベル</h1>
        <p style={{ fontSize: 13, color: C.gray, marginBottom: 24 }}>
          認定申請者（certification_applications）向けの発送ラベルです。単票 PNG（ハガキ大シール用）と、A4・4面ラベル台紙（92×131mm×4・角丸）用の PDF を出力できます。
          <br />※ NFCカード購入者の発送ラベルはこのページの対象外です。
        </p>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: `1px solid ${C.red}`, color: '#FCA5A5', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* 申請者一覧 */}
          <div style={{ flex: '1 1 380px', minWidth: 320 }}>
            <div style={{ background: C.panel, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.panelLine}` }}>
              <div style={{ padding: '12px 16px', fontSize: 12, color: C.gray, borderBottom: `1px solid ${C.panelLine}` }}>
                {loading ? '読み込み中…' : `申請 ${groups.length} 件`}
              </div>
              {!loading && groups.length === 0 && !error && (
                <div style={{ padding: 20, fontSize: 13, color: C.gray }}>認定申請はまだありません。</div>
              )}
              {groups.map((g) => {
                const r = recipientFromApplication(g)
                const active = g.key === selectedKey
                const cellIdx = cells.indexOf(g.key)
                return (
                  <button
                    key={g.key}
                    onClick={() => setSelectedKey(g.key)}
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
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        {cellIdx >= 0 && <span style={{ color: C.gold, marginRight: 6 }}>{CELL_MARK[cellIdx]}</span>}
                        {r.name || '（宛名なし）'}
                      </span>
                      <span style={{ fontSize: 11, color: C.gray, whiteSpace: 'nowrap' }}>{fmtDate(g.applied_at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.gray, marginTop: 4, lineHeight: 1.5 }}>
                      〒{r.postalCode || '—'}　{r.oneLine || '（住所情報なし）'}
                    </div>
                    {g.categories.length > 0 && (
                      <div style={{ fontSize: 11, color: '#9AA', marginTop: 4 }}>{g.categories.join(' / ')}</div>
                    )}
                    <div style={{ marginTop: 4, display: 'flex', gap: 10 }}>
                      {r.incomplete && <span style={{ fontSize: 11, color: C.gold }}>⚠ 宛先情報が不足</span>}
                      {g.anyUnpaid && <span style={{ fontSize: 11, color: C.red }}>未入金あり</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 右カラム */}
          <div style={{ flex: '1 1 560px', minWidth: 340 }}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: C.gold }}>1枚だけ（PNG・ハガキ大シール用）</div>
              {!selected ? (
                <div style={{ background: C.panel, border: `1px dashed ${C.panelLine}`, borderRadius: 12, padding: 32, textAlign: 'center', color: C.gray, fontSize: 13 }}>
                  左の一覧から申請者を選択してください。
                </div>
              ) : (
                <div>
                  <div style={{ width: SINGLE_W * previewScale, height: SINGLE_H * previewScale, boxShadow: '0 8px 30px rgba(0,0,0,0.5)', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
                    <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                      <LabelInner r={recipient} />
                    </div>
                  </div>
                  <button
                    onClick={downloadPng}
                    disabled={downloading}
                    style={{ background: C.gold, color: C.navy, border: 'none', borderRadius: 8, padding: '11px 20px', fontSize: 14, fontWeight: 700, cursor: downloading ? 'default' : 'pointer', opacity: downloading ? 0.6 : 1 }}
                  >
                    {downloading ? '生成中…' : 'PNG をダウンロード（148×100mm）'}
                  </button>
                </div>
              )}
            </div>

            <div style={{ borderTop: `1px solid ${C.panelLine}`, paddingTop: 22 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: C.gold }}>A4・4面ラベル台紙（PDF・最大4枚）</div>
              <div style={{ fontSize: 12, color: C.gray, marginBottom: 14, lineHeight: 1.6 }}>
                一覧で申請者を選び、置きたいマスをクリックで配置（もう一度クリックで解除）。余ったマスは空白のまま印刷されます。
              </div>

              <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div
                  style={{
                    position: 'relative',
                    width: PAGE_W_MM * sheetScale,
                    height: PAGE_H_MM * sheetScale,
                    background: '#fff',
                    borderRadius: 4,
                    flexShrink: 0,
                    boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
                  }}
                >
                  {CELLS.map((cell, i) => {
                    const key = cells[i]
                    const g = key ? groupByKey[key] ?? null : null
                    const r = g ? recipientFromApplication(g) : null
                    return (
                      <button
                        key={i}
                        onClick={() => toggleCell(i)}
                        title={g ? 'クリックで解除' : '選択中の申請者をここへ配置'}
                        style={{
                          position: 'absolute',
                          left: cell.x * sheetScale,
                          top: cell.y * sheetScale,
                          width: CELL_W_MM * sheetScale,
                          height: CELL_H_MM * sheetScale,
                          border: g ? `1.5px solid ${C.gold}` : `1px dashed #C9C9C9`,
                          borderRadius: 6,
                          background: g ? C.ivory : '#F7F7F5',
                          color: C.navy,
                          cursor: 'pointer',
                          padding: 6,
                          boxSizing: 'border-box',
                          textAlign: 'center',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                          alignItems: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        <span style={{ position: 'absolute', top: 3, left: 5, fontSize: 11, color: g ? C.gold : '#B0B0B0', fontWeight: 700 }}>{CELL_MARK[i]}</span>
                        {g && r ? (
                          <>
                            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{r.name || '（宛名なし）'}</span>
                            <span style={{ fontSize: 9, color: C.navySoft, marginTop: 4 }}>〒{r.postalCode || '—'}</span>
                          </>
                        ) : (
                          <span style={{ fontSize: 11, color: '#B0B0B0' }}>空き</span>
                        )}
                      </button>
                    )
                  })}
                </div>

                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 12, color: C.gray, marginBottom: 14 }}>
                    配置済み: <span style={{ color: '#fff', fontWeight: 700 }}>{placedCount}</span> / 4
                    {!selectedKey && <div style={{ marginTop: 6, color: C.gold }}>先に一覧で申請者を選んでください。</div>}
                  </div>
                  <button
                    onClick={downloadPdf}
                    disabled={generatingPdf || placedCount === 0}
                    style={{
                      display: 'block',
                      width: '100%',
                      background: placedCount === 0 ? '#3A3A3A' : C.gold,
                      color: placedCount === 0 ? '#777' : C.navy,
                      border: 'none',
                      borderRadius: 8,
                      padding: '12px 20px',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: generatingPdf || placedCount === 0 ? 'default' : 'pointer',
                      opacity: generatingPdf ? 0.6 : 1,
                      marginBottom: 10,
                    }}
                  >
                    {generatingPdf ? '生成中…' : `PDF を出力（${placedCount}枚）`}
                  </button>
                  <button
                    onClick={() => setCells([null, null, null, null])}
                    disabled={placedCount === 0}
                    style={{ background: 'transparent', color: C.gray, border: `1px solid ${C.panelLine}`, borderRadius: 8, padding: '8px 16px', fontSize: 12, cursor: placedCount === 0 ? 'default' : 'pointer' }}
                  >
                    配置をクリア
                  </button>
                  <div style={{ fontSize: 11, color: C.gray, marginTop: 14, lineHeight: 1.6 }}>
                    ※ 印刷は「実際のサイズ・倍率100%・フチなし」設定で。用紙: A4・4面（92×131mm・角丸）。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* html2canvas 用の原寸オフスクリーンノード（キャプチャ対象） */}
      <div style={{ position: 'fixed', top: 0, left: -10000, pointerEvents: 'none' }} aria-hidden>
        {selected && <LabelInner r={recipient} innerRef={captureRef} />}
        {cells.map((key, i) => {
          if (!key) return null
          const g = groupByKey[key]
          if (!g) return null
          const r = recipientFromApplication(g)
          return (
            <LabelInner
              key={`pdf-${i}-${key}`}
              r={r}
              baseW={PDF_BASE_W}
              baseH={PDF_BASE_H}
              innerRef={(el) => {
                pdfRefs.current[i] = el
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
