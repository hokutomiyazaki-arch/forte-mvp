'use client'

import { useState } from 'react'
import { executeVoiceShare } from '@/lib/voice-share'

/**
 * 団体シェアカード（顔なし・匿名の客観素材のみ・背景フレームPNG）
 *
 * ★思想: 団体は個人を上から選ばない。カードに顔写真・個人名は一切出さない。
 *   出せるのは「クライアントの声に由来する数字」と「匿名の人数（tier別メダル / バッジ別人数）」だけ。
 *
 * レイアウト:
 *   背景に card-assets/org-share-bg-{feed|stories}.png（同一オリジン=CORS安全）を敷き、
 *   その外周ゴールド枠の内側にコンテンツを中央配置する。html2canvas は backgroundColor:null のまま
 *   （背景は DOM 側 backgroundImage で描く）。
 *   ★「切れない」ことを最優先し、強み件数を stories=3 / feed=2 に固定上限。
 */

export interface OrgStrength {
  proofItemId: string
  label: string
  totalCount: number
  medals: { immortal: number; legend: number; master: number; specialist: number; proven: number }
}
export interface OrgBadge {
  id: string
  name: string
  image_url: string | null
}

interface Props {
  orgId: string
  orgName: string
  memberCount: number
  totalVotes: number
  strengths: OrgStrength[]
  badges: OrgBadge[]
  badgeHolderCounts: Record<string, number>
}

// メダル画像（public/ 配下＝同一オリジン＝CORS安全）。proven は画像なし。
const MEDAL_IMG: Record<string, string | null> = {
  immortal: '/medals/immortal-64.png',
  legend: '/medals/legend-64.png',
  master: '/medals/master-64.png',
  specialist: '/medals/specialist-64.png',
}
const MEDAL_ORDER: Array<keyof OrgStrength['medals']> = ['immortal', 'legend', 'master', 'specialist']
const SPECIALIST_CAP = 8

// 背景PNGの実寸（同梱アセット）
const BG = {
  feed: { src: '/card-assets/org-share-bg-feed.png', w: 1080, h: 1350, padX: 130, padY: 150, strengthMax: 2 },
  stories: { src: '/card-assets/org-share-bg-stories.png', w: 1080, h: 1920, padX: 140, padY: 220, strengthMax: 3 },
} as const

const BADGE_IMG_MAX = 3 // 実画像で出すバッジ種の上限（残りは「他N種」に畳む）
const STRENGTH_CANDIDATES = 12

const GOLD = '#C4A35A'
const INK = '#1A1A2E'
const PAPER = '#F3EEE0'

// 団体名の長さで縮小（枠内に収める）
function orgNameSize(name: string): number {
  const len = Array.from(name).length
  if (len <= 12) return 60
  if (len <= 20) return 48
  if (len <= 30) return 38
  return 30
}

// ─── トグル（VoiceShareCard パターン流用）───
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{label}</span>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, flexShrink: 0,
          background: value ? GOLD : '#ccc',
          position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 2, left: value ? 22 : 2,
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </label>
  )
}

export default function OrgShareCard({
  orgId, orgName, memberCount, totalVotes, strengths, badges, badgeHolderCounts,
}: Props) {
  const [blockSummary, setBlockSummary] = useState(true)
  const [blockStrengths, setBlockStrengths] = useState(true)
  const [blockBadges, setBlockBadges] = useState(true)
  const [exportMode, setExportMode] = useState<'feed' | 'stories'>('feed')
  const [saving, setSaving] = useState(false)
  // 初期は上位3件ON（stories上限=3に合わせる。strengths は totalCount 降順で渡る前提）
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => strengths.slice(0, 3).map(s => s.proofItemId)
  )

  const candidateStrengths = strengths.slice(0, STRENGTH_CANDIDATES)

  // バッジ: 人数降順、0人除外
  const sortedBadges = badges
    .map(b => ({ id: b.id, name: b.name, image_url: b.image_url, count: badgeHolderCounts[b.id] || 0 }))
    .filter(b => b.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  function toggleStrength(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleShare() {
    setSaving(true)
    const el = document.getElementById('org-card-for-export')
    if (!el) { setSaving(false); return }
    await executeVoiceShare({
      cardElement: el,
      exportMode,
      // 団体シェアは vote/phrase に紐づかない。source==='org' で INSERT/tracking はスキップされる。
      voteId: '', professionalId: '', phraseId: 0, includeProfile: false,
      source: 'org',
    })
    setSaving(false)
  }

  // ─── メダル列（1つの強み分）───
  function renderMedals(m: OrgStrength['medals']) {
    const imgs: JSX.Element[] = []
    let key = 0
    for (const tier of MEDAL_ORDER) {
      const src = MEDAL_IMG[tier]
      if (!src) continue
      let count = m[tier]
      let extra = 0
      if (tier === 'specialist' && count > SPECIALIST_CAP) {
        extra = count - SPECIALIST_CAP
        count = SPECIALIST_CAP
      }
      for (let i = 0; i < count; i++) {
        imgs.push(
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${tier}-${key++}`} src={src} alt={tier}
            style={{ width: 52, height: 52, objectFit: 'contain', display: 'block' }} />
        )
      }
      if (extra > 0) {
        imgs.push(
          <span key={`spec-extra-${key++}`} style={{ fontSize: 30, fontWeight: 700, color: GOLD, alignSelf: 'center' }}>
            +{extra}
          </span>
        )
      }
    }
    // フォールバック: specialist以上(immortal含む)が0 かつ proven>0 のときだけ PROVEN をテキスト表示
    const specPlus = m.immortal + m.legend + m.master + m.specialist
    if (specPlus === 0 && m.proven > 0) {
      imgs.push(
        <span key={`proven-${key++}`} style={{ fontSize: 28, fontWeight: 700, color: '#8A7A50', alignSelf: 'center' }}>
          🛡 PROVEN {m.proven}名
        </span>
      )
    }
    if (imgs.length === 0) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 10, justifyContent: 'center' }}>
        {imgs}
      </div>
    )
  }

  // ─── カード本体（背景PNG + 中央コンテンツ・実寸1080ベース）───
  // preview は transform:scale で縮小表示し、export と完全一致させる。
  function CardFull({ mode }: { mode: 'feed' | 'stories' }) {
    const dim = BG[mode]
    const shownStrengths = strengths
      .filter(s => selectedIds.includes(s.proofItemId))
      .slice(0, dim.strengthMax)
    const imgBadges = sortedBadges.slice(0, BADGE_IMG_MAX)
    const foldedCount = sortedBadges.length - imgBadges.length

    return (
      <div style={{
        width: dim.w, height: dim.h,
        backgroundImage: `url('${dim.src}')`,
        backgroundSize: 'cover', backgroundPosition: 'center',
        boxSizing: 'border-box',
        padding: `${dim.padY}px ${dim.padX}px`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Inter', 'Noto Sans JP', sans-serif", color: INK,
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: mode === 'stories' ? 44 : 30, width: '100%' }}>

          {/* ① サマリー */}
          {blockSummary && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, letterSpacing: 8, fontWeight: 700, color: GOLD }}>
                CERTIFICATE OF PROOF
              </div>
              <div style={{ fontSize: orgNameSize(orgName), fontWeight: 700, marginTop: 16, lineHeight: 1.15 }}>
                {orgName}
              </div>
              <div style={{ fontSize: 32, color: '#6B5B38', marginTop: 16, lineHeight: 1.6 }}>
                <b style={{ color: GOLD }}>{totalVotes.toLocaleString()}</b> の声 ／ <b>{memberCount}</b>名在籍
              </div>
            </div>
          )}

          {/* ② 強み + メダル */}
          {blockStrengths && shownStrengths.length > 0 && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: mode === 'stories' ? 28 : 20 }}>
              {shownStrengths.map(s => (
                <div key={s.proofItemId} style={{
                  background: `${PAPER}CC`, borderRadius: 20, padding: '22px 26px',
                  border: `1px solid rgba(196,163,90,0.4)`, textAlign: 'center',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 38, fontWeight: 600, lineHeight: 1.3 }}>{s.label}</span>
                    <span style={{ fontSize: 52, fontWeight: 800, color: GOLD, whiteSpace: 'nowrap' }}>
                      {s.totalCount.toLocaleString()}<span style={{ fontSize: 26, fontWeight: 600 }}> 件</span>
                    </span>
                  </div>
                  {renderMedals(s.medals)}
                </div>
              ))}
            </div>
          )}

          {/* ③ バッジB（上位N種を実画像 + 残りは畳む）*/}
          {blockBadges && sortedBadges.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, justifyContent: 'center', alignItems: 'flex-start' }}>
              {imgBadges.map(b => (
                <div key={b.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 200 }}>
                  {b.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.image_url} alt={b.name} crossOrigin="anonymous"
                      style={{ width: 108, height: 108, objectFit: 'contain', display: 'block' }} />
                  ) : (
                    <div style={{ width: 108, height: 108, borderRadius: '50%', background: 'rgba(196,163,90,0.15)' }} />
                  )}
                  <div style={{ fontSize: 26, fontWeight: 600, textAlign: 'center', marginTop: 8, lineHeight: 1.3 }}>{b.name}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: GOLD }}>{b.count}名</div>
                </div>
              ))}
              {foldedCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 26, fontWeight: 600, color: '#6B5B38', minHeight: 108 }}>
                  他 {foldedCount} 種
                </div>
              )}
            </div>
          )}

          {/* 誘導行 */}
          <div style={{ fontSize: 30, fontWeight: 700, color: INK }}>
            ▶ realproof.jp/org/{orgId}
          </div>

          {/* フッター */}
          <div style={{ fontSize: 24, letterSpacing: 4, fontWeight: 700, color: '#8A7A50' }}>
            VERIFIED BY REALPROOF
          </div>
        </div>
      </div>
    )
  }

  // プレビュー縮小率
  const dim = BG[exportMode]
  const PREVIEW_W = 320
  const scale = PREVIEW_W / dim.w

  return (
    <div>
      {/* ─── プレビュー（export と同一DOMを縮小表示）─── */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <div style={{ width: PREVIEW_W, height: dim.h * scale, overflow: 'hidden' }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <CardFull mode={exportMode} />
          </div>
        </div>
      </div>

      {/* ─── ブロック ON/OFF ─── */}
      <div style={{ maxWidth: 360, margin: '0 auto 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#8A7A50', letterSpacing: 1 }}>表示ブロック</div>
        <Toggle label="① サマリー（声の数・在籍数）" value={blockSummary} onChange={setBlockSummary} />
        <Toggle label="② 証明された強み" value={blockStrengths} onChange={setBlockStrengths} />
        <Toggle label="③ 認定を持つプロ" value={blockBadges} onChange={setBlockBadges} />
      </div>

      {/* ─── 強みの表示項目選択（②ON時のみ）─── */}
      {blockStrengths && candidateStrengths.length > 0 && (
        <div style={{ maxWidth: 360, margin: '0 auto 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8A7A50', letterSpacing: 1, marginBottom: 8 }}>
            強みの表示（{exportMode === 'stories' ? '最大3件' : '最大2件'}・上位から採用）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
            {candidateStrengths.map(s => {
              const checked = selectedIds.includes(s.proofItemId)
              return (
                <label key={s.proofItemId} style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: INK,
                }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleStrength(s.proofItemId)} />
                  <span style={{ flex: 1 }}>{s.label}</span>
                  <span style={{ color: GOLD, fontWeight: 700 }}>{s.totalCount}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── フォーマット切替 ─── */}
      <div style={{ maxWidth: 360, margin: '0 auto 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#8A7A50', letterSpacing: 1, marginBottom: 8 }}>サイズ</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([
            { key: 'feed' as const, label: 'フィード（4:5）' },
            { key: 'stories' as const, label: 'ストーリーズ（9:16）' },
          ]).map(({ key, label }) => (
            <button key={key} onClick={() => setExportMode(key)}
              style={{
                flex: 1, padding: '10px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                border: exportMode === key ? `1px solid ${GOLD}` : '1px solid #E5E7EB',
                background: exportMode === key ? 'rgba(196,163,90,0.12)' : '#fff',
                color: exportMode === key ? GOLD : '#6B7280', cursor: 'pointer',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── シェアボタン ─── */}
      <button onClick={handleShare} disabled={saving}
        style={{
          display: 'block', width: '100%', maxWidth: 360, margin: '0 auto',
          padding: '16px 24px', background: GOLD, color: '#fff', fontWeight: 800, fontSize: 15,
          borderRadius: 14, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>
        {saving ? '生成中...' : 'この団体カードをシェアする'}
      </button>

      {/* ─── エクスポート用DOM（画面外・実寸）─── */}
      <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
        <div id="org-card-for-export">
          <CardFull mode={exportMode} />
        </div>
      </div>
    </div>
  )
}
