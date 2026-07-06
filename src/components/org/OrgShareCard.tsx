'use client'

import { useState } from 'react'
import { executeVoiceShare } from '@/lib/voice-share'

/**
 * 団体シェアカード（顔なし・匿名の客観素材のみ・賞状風）
 *
 * ★思想: 団体は個人を上から選ばない。カードに顔写真・個人名は一切出さない。
 *   出せるのは「クライアントの声に由来する数字」と「匿名の人数（tier別メダル / バッジ別人数）」だけ。
 *   個人の露出は本人の Voice シェア（既存）に任せる。
 *
 * データ源:
 *   ① サマリー: org-dashboard の aggregate（OG画像と同じ active_member_count / total_org_votes）
 *   ② 強み+メダル: /api/org/[org_id]/top-strengths（vote_type='proof' 集計・medals 内訳）
 *   ③ バッジ構成: org-dashboard の badges(credential_levels) + badgeHolderCounts
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
  orgName: string
  memberCount: number
  totalVotes: number
  strengths: OrgStrength[]
  badges: OrgBadge[]
  badgeHolderCounts: Record<string, number>
}

// メダル画像（public/ 配下＝同一オリジン＝CORS安全）。immortal / proven は画像なし。
const MEDAL_IMG: Record<string, string | null> = {
  immortal: null, // 画像未作成（閾値未確定）。個数ぶん描くが 0 なので何も出ない
  legend: '/medals/legend-64.png',
  master: '/medals/master-64.png',
  specialist: '/medals/specialist-64.png',
}
// 上位ティアから並べる
const MEDAL_ORDER: Array<keyof OrgStrength['medals']> = ['immortal', 'legend', 'master', 'specialist']
const SPECIALIST_CAP = 8

const GOLD = '#C4A35A'
const INK = '#1A1A2E'
const PAPER = '#FAF8F1'

const STRENGTH_CANDIDATES = 20 // チェックボックスに出す上限
const INITIAL_SELECTED = 8

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
  orgName, memberCount, totalVotes, strengths, badges, badgeHolderCounts,
}: Props) {
  const [blockSummary, setBlockSummary] = useState(true)
  const [blockStrengths, setBlockStrengths] = useState(true)
  const [blockBadges, setBlockBadges] = useState(true)
  const [exportMode, setExportMode] = useState<'feed' | 'stories'>('feed')
  const [saving, setSaving] = useState(false)
  // 初期は上位8件ON（strengths は totalCount 降順で渡ってくる前提）
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => strengths.slice(0, INITIAL_SELECTED).map(s => s.proofItemId)
  )

  const candidateStrengths = strengths.slice(0, STRENGTH_CANDIDATES)
  const shownStrengths = strengths.filter(s => selectedIds.includes(s.proofItemId))
  const shownBadges = badges
    .map(b => ({ ...b, count: badgeHolderCounts[b.id] || 0 }))
    .filter(b => b.count > 0)

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
      voteId: '',
      professionalId: '',
      phraseId: 0,
      includeProfile: false,
      source: 'org',
    })
    setSaving(false)
  }

  // ─── メダル列（1つの強み分）───
  function renderMedals(m: OrgStrength['medals'], u: number) {
    const imgs: JSX.Element[] = []
    let key = 0
    for (const tier of MEDAL_ORDER) {
      const src = MEDAL_IMG[tier]
      if (!src) continue // immortal: 画像なし→描かない（個数0前提）
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
            style={{ width: 20 * u, height: 20 * u, objectFit: 'contain', display: 'block' }} />
        )
      }
      if (extra > 0) {
        imgs.push(
          <span key={`spec-extra-${key++}`} style={{ fontSize: 12 * u, fontWeight: 700, color: GOLD, alignSelf: 'center' }}>
            +{extra}
          </span>
        )
      }
    }
    // フォールバック: specialist以上が0 かつ proven>0 のときだけ PROVEN をテキスト表示
    const specPlus = m.legend + m.master + m.specialist + m.immortal
    if (specPlus === 0 && m.proven > 0) {
      imgs.push(
        <span key={`proven-${key++}`} style={{ fontSize: 11 * u, fontWeight: 700, color: '#8A7A50', alignSelf: 'center' }}>
          🛡 PROVEN {m.proven}名
        </span>
      )
    }
    if (imgs.length === 0) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 * u, alignItems: 'center', marginTop: 4 * u }}>
        {imgs}
      </div>
    )
  }

  // ─── 賞状本体（u = サイズ倍率。プレビュー=1 / エクスポート=大きめ）───
  function CertBody({ u }: { u: number }) {
    return (
      <div style={{
        width: 360 * u,
        background: `linear-gradient(170deg, ${PAPER} 0%, #F3EEE0 100%)`,
        border: `${2 * u}px solid ${GOLD}`,
        borderRadius: 8 * u,
        padding: `${28 * u}px ${24 * u}px`,
        boxSizing: 'border-box',
        fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
        color: INK,
      }}>
        {/* 内側の細フレーム */}
        <div style={{ border: `${1 * u}px solid rgba(196,163,90,0.45)`, padding: `${20 * u}px ${18 * u}px` }}>

          {/* ヘッダー */}
          <div style={{ textAlign: 'center', marginBottom: 18 * u }}>
            <div style={{ fontSize: 11 * u, letterSpacing: 3 * u, fontWeight: 700, color: GOLD }}>
              CERTIFICATE OF PROOF
            </div>
            <div style={{ fontSize: 22 * u, fontWeight: 700, marginTop: 8 * u, lineHeight: 1.2 }}>
              {orgName}
            </div>
            {blockSummary && (
              <div style={{ fontSize: 12 * u, color: '#6B5B38', marginTop: 8 * u, lineHeight: 1.6 }}>
                {orgName}に届いた <b style={{ color: GOLD }}>{totalVotes.toLocaleString()}</b> の声<br />
                <b>{memberCount}</b>名が在籍
              </div>
            )}
            <div style={{ height: 1 * u, background: 'rgba(196,163,90,0.4)', margin: `${16 * u}px auto 0`, width: '70%' }} />
          </div>

          {/* ② 強み + メダル */}
          {blockStrengths && shownStrengths.length > 0 && (
            <div style={{ marginBottom: 18 * u }}>
              <div style={{ fontSize: 10 * u, letterSpacing: 2 * u, fontWeight: 700, color: '#8A7A50', marginBottom: 10 * u }}>
                本当の声で証明された強み
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 * u }}>
                {shownStrengths.map(s => (
                  <div key={s.proofItemId} style={{ borderBottom: `${1 * u}px solid rgba(26,26,46,0.08)`, paddingBottom: 8 * u }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 * u }}>
                      <span style={{ fontSize: 13 * u, fontWeight: 600, lineHeight: 1.4, flex: 1 }}>{s.label}</span>
                      <span style={{ fontSize: 20 * u, fontWeight: 800, color: GOLD, whiteSpace: 'nowrap' }}>
                        {s.totalCount.toLocaleString()}<span style={{ fontSize: 11 * u, fontWeight: 600 }}> 件</span>
                      </span>
                    </div>
                    {renderMedals(s.medals, u)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ③ 認定を持つプロ（バッジ実画像 + 匿名の人数） */}
          {blockBadges && shownBadges.length > 0 && (
            <div style={{ marginBottom: 14 * u }}>
              <div style={{ fontSize: 10 * u, letterSpacing: 2 * u, fontWeight: 700, color: '#8A7A50', marginBottom: 10 * u }}>
                認定を持つプロ
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 * u, justifyContent: 'center' }}>
                {shownBadges.map(b => (
                  <div key={b.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 92 * u }}>
                    {b.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={b.image_url} alt={b.name} crossOrigin="anonymous"
                        style={{ width: 44 * u, height: 44 * u, objectFit: 'contain', display: 'block' }} />
                    ) : (
                      <div style={{ width: 44 * u, height: 44 * u, borderRadius: '50%', background: 'rgba(196,163,90,0.15)' }} />
                    )}
                    <div style={{ fontSize: 11 * u, fontWeight: 600, textAlign: 'center', marginTop: 4 * u, lineHeight: 1.3 }}>
                      {b.name}
                    </div>
                    <div style={{ fontSize: 11 * u, fontWeight: 700, color: GOLD }}>{b.count}名</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* フッター */}
          <div style={{ textAlign: 'center', marginTop: 16 * u, paddingTop: 12 * u, borderTop: `${1 * u}px solid rgba(196,163,90,0.4)` }}>
            <span style={{ fontSize: 10 * u, letterSpacing: 2 * u, fontWeight: 700, color: '#8A7A50' }}>
              VERIFIED BY REALPROOF
            </span>
          </div>
        </div>
      </div>
    )
  }

  const EXPORT_U = 3

  return (
    <div>
      {/* ─── プレビュー ─── */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <CertBody u={1} />
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
            強みの表示（初期：上位{INITIAL_SELECTED}件）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {candidateStrengths.map(s => {
              const checked = selectedIds.includes(s.proofItemId)
              return (
                <label key={s.proofItemId} style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  fontSize: 12, color: INK,
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

      {/* ─── エクスポート用DOM（画面外・高解像度）─── */}
      <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }}>
        {exportMode === 'stories' ? (
          <div
            id="org-card-for-export"
            style={{
              width: 1080, height: 1920, background: INK,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxSizing: 'border-box', padding: '0 40px',
            }}
          >
            <CertBody u={EXPORT_U} />
          </div>
        ) : (
          <div id="org-card-for-export" style={{ display: 'inline-block', background: INK, padding: 24 }}>
            <CertBody u={EXPORT_U} />
          </div>
        )}
      </div>
    </div>
  )
}
