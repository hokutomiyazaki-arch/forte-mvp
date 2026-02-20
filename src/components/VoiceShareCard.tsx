'use client'

import { useState } from 'react'
import html2canvas from 'html2canvas'
import { createClient } from '@/lib/supabase'
import { COLORS, FONTS } from '@/lib/design-tokens'
import Logo from '@/components/Logo'

const T = { ...COLORS, font: FONTS.main, fontMono: FONTS.mono, fontSerif: FONTS.serif }

// ═══ Props ═══
interface VoiceShareModalProps {
  isOpen: boolean
  onClose: () => void
  voice: { id: string; comment: string; created_at: string }
  phraseId: number
  phraseText: string
  proId: string
  proName: string
  proTitle: string
  proPhotoUrl: string | null
  proPrefecture: string | null
  proAreaDescription: string | null
  totalProofs: number
  topStrengths: { label: string; count: number }[]
}

// ═══ Card B: Warm（クリーム背景のシェアカード） ═══
function VoiceCardWarm({ comment, phraseText }: { comment: string; phraseText: string }) {
  return (
    <div style={{
      background: 'linear-gradient(170deg, #FAF8F4, #F3EFE7)',
      border: `1px solid ${T.cardBorder}`,
      borderRadius: 18,
      padding: '32px 26px',
      aspectRatio: '4/5',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 上部アクセント線 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, #C4A35A99, transparent)',
      }} />

      <div>
        {/* 引用符 */}
        <div style={{ fontSize: 56, color: '#C4A35A4D', fontFamily: 'Georgia, serif', lineHeight: 1 }}>&ldquo;</div>

        {/* コメント */}
        <div style={{
          color: T.dark, fontSize: 24, fontFamily: T.fontSerif,
          fontWeight: 700, lineHeight: 2.0, marginTop: 8,
        }}>
          {comment}
        </div>
      </div>

      <div>
        {/* 区切り線 */}
        <div style={{ height: 1, background: `${T.gold}4D`, margin: '20px 0 12px' }} />

        {/* 感謝フレーズ */}
        <div style={{
          color: T.gold, fontSize: 11, fontStyle: 'italic', fontWeight: 700,
          marginBottom: 16,
        }}>
          ── {phraseText}
        </div>

        {/* Logo */}
        <Logo size={0.7} dark={false} showTagline={false} />
      </div>
    </div>
  )
}

// ═══ プロフィール ミニカード ═══
function MiniProfileCard({
  name, title, photoUrl, totalProofs, topStrengths, prefecture, areaDescription,
}: {
  name: string
  title: string
  photoUrl: string | null
  totalProofs: number
  topStrengths: { label: string; count: number }[]
  prefecture: string | null
  areaDescription: string | null
}) {
  const maxCount = Math.max(...topStrengths.map(s => s.count), 1)

  return (
    <div style={{
      background: '#FAF8F4', borderRadius: 16, padding: '20px 18px',
      border: `1px solid ${T.cardBorder}`,
    }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        {photoUrl ? (
          <img src={photoUrl} alt={name}
            style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: T.dark,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 20, fontWeight: 'bold', flexShrink: 0,
          }}>
            {name.charAt(0)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: T.dark }}>{name}</div>
          <div style={{ fontSize: 11, color: T.gold, fontWeight: 500 }}>{title}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 'bold', color: T.gold, fontFamily: T.fontMono }}>{totalProofs}</span>
          <span style={{ fontSize: 10, color: T.textSub, marginLeft: 4 }}>proofs</span>
        </div>
      </div>

      {/* Top強みバー */}
      {topStrengths.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {topStrengths.slice(0, 3).map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 12, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.label}
              </div>
              <div style={{ width: 100, height: 5, background: '#F0EDE6', borderRadius: 99, flexShrink: 0 }}>
                <div style={{
                  height: 5, borderRadius: 99, background: T.gold,
                  width: `${(s.count / maxCount) * 100}%`,
                }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 'bold', color: T.gold, fontFamily: T.fontMono, width: 24, textAlign: 'right' }}>
                {s.count}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 区切り + エリア */}
      <div style={{ height: 1, background: T.divider, marginBottom: 8 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: T.textMuted }}>
          {prefecture}{areaDescription ? ` · ${areaDescription}` : ''}
        </div>
        <div style={{ fontSize: 10, color: T.textMuted }}>realproof.jp</div>
      </div>
    </div>
  )
}

// ═══ シェアプレビューモーダル ═══
export default function VoiceShareModal({
  isOpen, onClose, voice, phraseId, phraseText,
  proId, proName, proTitle, proPhotoUrl,
  proPrefecture, proAreaDescription, totalProofs, topStrengths,
}: VoiceShareModalProps) {
  const [showMiniCard, setShowMiniCard] = useState(false)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  if (!isOpen) return null

  const handleSaveImage = async () => {
    const el = document.getElementById('voice-card-for-export')
    if (!el) return
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: null, useCORS: true })
    const link = document.createElement('a')
    link.download = `realproof-voice-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const handleShare = async () => {
    setSaving(true)
    const hash = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    await (supabase as any).from('voice_shares').insert({
      vote_id: voice.id,
      professional_id: proId,
      phrase_id: phraseId,
      include_profile: showMiniCard,
      hash,
    })
    await handleSaveImage()
    setSaving(false)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: '#000000CC',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 380, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* エクスポート対象 */}
        <div id="voice-card-for-export">
          <VoiceCardWarm comment={voice.comment} phraseText={phraseText} />
          {showMiniCard && (
            <div style={{ marginTop: 8 }}>
              <MiniProfileCard
                name={proName} title={proTitle} photoUrl={proPhotoUrl}
                totalProofs={totalProofs} topStrengths={topStrengths}
                prefecture={proPrefecture} areaDescription={proAreaDescription}
              />
            </div>
          )}
        </div>

        {/* トグル */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', color: '#fff', fontSize: 13,
        }}>
          <span>プロフィールカードも付ける</span>
          <button
            onClick={() => setShowMiniCard(!showMiniCard)}
            style={{
              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: showMiniCard ? T.gold : '#555',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              position: 'absolute', top: 2,
              left: showMiniCard ? 22 : 2,
              transition: 'left 0.2s',
            }} />
          </button>
        </div>

        {/* ボタン群 */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: 12, border: '1px solid #555', background: 'transparent',
              color: '#999', borderRadius: 12, fontSize: 13, cursor: 'pointer',
            }}
          >
            戻る
          </button>
          <button
            onClick={handleShare}
            disabled={saving}
            style={{
              flex: 2, padding: 12, border: 'none',
              background: T.gold, color: T.dark, borderRadius: 12,
              fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '保存中...' : '画像を保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
