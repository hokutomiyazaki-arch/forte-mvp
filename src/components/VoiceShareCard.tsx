'use client'

import { useState } from 'react'
import html2canvas from 'html2canvas'
import { createClient } from '@/lib/supabase'
import { VoiceCardTheme, hexToRgba } from '@/lib/voiceCardThemes'

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
  theme: VoiceCardTheme
  showProof: boolean
  showProInfo: boolean
}

// ═══ シェアプレビューモーダル ═══
export default function VoiceShareModal({
  isOpen, onClose, voice, phraseId, phraseText,
  proId, proName, proTitle, proPhotoUrl,
  totalProofs, topStrengths,
  theme, showProof, showProInfo,
}: VoiceShareModalProps) {
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  if (!isOpen) return null

  // トッププルーフ: 最も票数が多い項目
  const topProof = topStrengths.length > 0 ? topStrengths[0] : null

  const handleShare = async () => {
    setSaving(true)
    const el = document.getElementById('voice-card-for-export')
    if (!el) { setSaving(false); return }

    // キャプチャ前にスタイル調整
    const originalStyle = el.style.cssText
    el.style.margin = '0'
    el.style.boxShadow = 'none'

    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: null,
      useCORS: true,
      width: el.offsetWidth,
      height: el.offsetHeight,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      windowWidth: el.offsetWidth,
      windowHeight: el.offsetHeight,
    })

    // スタイルを元に戻す
    el.style.cssText = originalStyle

    // 角丸マスク
    const roundedCanvas = document.createElement('canvas')
    roundedCanvas.width = canvas.width
    roundedCanvas.height = canvas.height
    const ctx = roundedCanvas.getContext('2d')
    if (ctx) {
      const radius = 36 // borderRadius: 18 × scale 2
      ctx.beginPath()
      ctx.moveTo(radius, 0)
      ctx.lineTo(canvas.width - radius, 0)
      ctx.quadraticCurveTo(canvas.width, 0, canvas.width, radius)
      ctx.lineTo(canvas.width, canvas.height - radius)
      ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height)
      ctx.lineTo(radius, canvas.height)
      ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius)
      ctx.lineTo(0, radius)
      ctx.quadraticCurveTo(0, 0, radius, 0)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(canvas, 0, 0)
    }

    const blob = await new Promise<Blob>((resolve) => {
      roundedCanvas.toBlob((b) => resolve(b!), 'image/png')
    })

    const file = new File([blob], 'realproof-voice.png', { type: 'image/png' })

    // Web Share API
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
          include_profile: showProInfo,
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

    // フォールバック: ダウンロード
    const link = document.createElement('a')
    link.download = `realproof-voice-${Date.now()}.png`
    link.href = roundedCanvas.toDataURL('image/png')
    link.click()

    // DB保存
    const hash = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    await (supabase as any).from('voice_shares').insert({
      vote_id: voice.id,
      professional_id: proId,
      phrase_id: phraseId,
      include_profile: showProInfo,
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
        {/* カードプレビュー */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 0' }}>
          <div id="voice-card-for-export" style={{
            background: `linear-gradient(170deg, ${theme.bg} 0%, ${theme.bg2} 100%)`,
            borderRadius: 18,
            padding: '32px 26px',
            width: 340,
            fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* 引用符 */}
            <div style={{ fontSize: 56, color: hexToRgba(theme.accent, 0.22), fontFamily: 'Georgia, serif', lineHeight: 1 }}>&ldquo;</div>

            {/* コメント */}
            <div style={{
              color: theme.text,
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1.9,
              marginTop: 8,
              marginBottom: 16,
            }}>
              {voice.comment}
            </div>

            {/* 区切り線 */}
            <div style={{ height: 1, background: hexToRgba(theme.accent, 0.12), margin: '4px 0 12px' }} />

            {/* 感謝フレーズ */}
            <div style={{
              color: theme.accent, fontSize: 12, fontWeight: 500,
              marginBottom: 20,
            }}>
              ── {phraseText}
            </div>

            {/* プロ情報 (showProInfo ON時のみ) */}
            {showProInfo && (
              <>
                <div style={{ height: 1, background: hexToRgba(theme.accent, 0.12), margin: '0 0 14px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                  {proPhotoUrl ? (
                    <img src={proPhotoUrl} alt={proName}
                      style={{
                        width: 48, height: 48, borderRadius: '50%', objectFit: 'cover',
                        border: `2px solid ${hexToRgba(theme.accent, 0.2)}`, flexShrink: 0,
                      }} />
                  ) : (
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%',
                      background: hexToRgba(theme.accent, 0.15),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: theme.accent, fontSize: 20, fontWeight: 'bold', flexShrink: 0,
                    }}>
                      {proName.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: theme.text,
                    }}>
                      {proName}
                    </div>
                    <div style={{
                      fontSize: 10, fontWeight: 500, color: theme.sub,
                      marginTop: 2,
                    }}>
                      {proTitle}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* トッププルーフバッジ (showProof ON + データあり) */}
            {showProof && topProof && (
              <div style={{
                background: hexToRgba(theme.accent, 0.08),
                border: `1px solid ${hexToRgba(theme.accent, 0.2)}`,
                borderRadius: 8,
                padding: '8px 12px',
                marginBottom: 16,
                textAlign: 'center',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.accent }}>
                  ◆ {topProof.count}人が「{topProof.label}」と証明
                </span>
              </div>
            )}

            {/* 区切り線 + フッター */}
            <div style={{ height: 1, background: hexToRgba(theme.accent, 0.12), margin: '0 0 12px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: theme.sub }}>
                強みが、あなたを定義する。
              </span>
              <span style={{ fontSize: 9, color: theme.sub, fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                realproof.jp
              </span>
            </div>
          </div>
        </div>

        {/* シェアボタン */}
        <button
          onClick={handleShare}
          disabled={saving}
          style={{
            width: '100%',
            maxWidth: 340,
            margin: '16px auto 0',
            display: 'block',
            padding: '18px 24px',
            background: '#C4A35A',
            color: '#FFFFFF',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 800,
            fontSize: 15,
            borderRadius: 14,
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            letterSpacing: 0.5,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'シェア中...' : 'このコメントをシェアする'}
        </button>

        {/* 戻るボタン */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            maxWidth: 340,
            margin: '12px auto 0',
            display: 'block',
            padding: 14,
            background: 'transparent',
            color: '#888',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: 13,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          戻る
        </button>
      </div>
    </div>
  )
}
