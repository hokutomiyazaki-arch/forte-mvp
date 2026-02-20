'use client'

import { useState } from 'react'
import html2canvas from 'html2canvas'
import { createClient } from '@/lib/supabase'
import { COLORS, FONTS } from '@/lib/design-tokens'

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

// ═══ 1枚統合カード（プロ情報込み） ═══
function VoiceCardIntegrated({
  comment, phraseText, proName, proTitle, proPhotoUrl,
}: {
  comment: string
  phraseText: string
  proName: string
  proTitle: string
  proPhotoUrl: string | null
}) {
  return (
    <div style={{
      background: 'linear-gradient(170deg, #FAF8F4, #F3EFE7)',
      border: '1px solid #E8E4DC',
      borderRadius: 18,
      padding: '32px 26px',
      width: 340,
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
        <div style={{ fontSize: 48, color: 'rgba(196, 163, 90, 0.3)', fontFamily: 'Georgia, serif', lineHeight: 1 }}>&ldquo;</div>

        {/* コメント */}
        <div style={{
          color: '#1A1A2E', fontSize: 22, fontFamily: T.fontSerif,
          fontWeight: 700, lineHeight: 1.9, marginTop: 8,
        }}>
          {comment}
        </div>
      </div>

      <div>
        {/* 区切り線 */}
        <div style={{ height: 1, background: 'rgba(196, 163, 90, 0.3)', margin: '20px 0 12px' }} />

        {/* 感謝フレーズ */}
        <div style={{
          color: T.gold, fontSize: 11, fontStyle: 'italic', fontWeight: 700,
          marginBottom: 20,
        }}>
          ── {phraseText}
        </div>

        {/* プロ情報 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          {proPhotoUrl ? (
            <img src={proPhotoUrl} alt={proName}
              style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: '#1A1A2E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 22, fontWeight: 'bold', flexShrink: 0,
            }}>
              {proName.charAt(0)}
            </div>
          )}
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#1A1A2E' }}>{proName}</div>
            <div style={{ fontSize: 11, color: T.gold, fontWeight: 600, marginTop: 2 }}>{proTitle}</div>
          </div>
        </div>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 300, color: '#1A1A2E', letterSpacing: '3px', fontFamily: "'DM Sans', sans-serif" }}>REAL</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#C4A35A', letterSpacing: '3px', fontFamily: "'DM Sans', sans-serif" }}>PROOF</span>
        </div>
      </div>
    </div>
  )
}

// ═══ シェアプレビューモーダル ═══
export default function VoiceShareModal({
  isOpen, onClose, voice, phraseId, phraseText,
  proId, proName, proTitle, proPhotoUrl,
}: VoiceShareModalProps) {
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  if (!isOpen) return null

  const handleShare = async () => {
    setSaving(true)
    const el = document.getElementById('voice-card-for-export')
    if (!el) { setSaving(false); return }

    const canvas = await html2canvas(el, { scale: 2, backgroundColor: null, useCORS: true })

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png')
    })

    const file = new File([blob], 'realproof-voice.png', { type: 'image/png' })

    // モバイル: 直接シェア
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'REALPROOF',
          text: '強みが、あなたを定義する。',
        })

        // シェア成功 → DB保存
        const hash = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        await (supabase as any).from('voice_shares').insert({
          vote_id: voice.id,
          professional_id: proId,
          phrase_id: phraseId,
          include_profile: false,
          hash,
        })
        setSaving(false)
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          setSaving(false)
          return
        }
      }
    }

    // PC: 画像ダウンロード
    const link = document.createElement('a')
    link.download = `realproof-voice-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()

    // DB保存
    const hash = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    await (supabase as any).from('voice_shares').insert({
      vote_id: voice.id,
      professional_id: proId,
      phrase_id: phraseId,
      include_profile: false,
      hash,
    })
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
          <VoiceCardIntegrated
            comment={voice.comment}
            phraseText={phraseText}
            proName={proName}
            proTitle={proTitle}
            proPhotoUrl={proPhotoUrl}
          />
        </div>

        {/* ボタン群 */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
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
            {saving ? 'シェア中...' : 'シェアする'}
          </button>
        </div>
      </div>
    </div>
  )
}
