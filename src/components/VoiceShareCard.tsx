'use client'

import { useState } from 'react'
import html2canvas from 'html2canvas'
import { createClient } from '@/lib/supabase'

// ═══ Color schemes ═══
const cardColors = [
  { id: 'cream', label: 'クリーム', bg: 'linear-gradient(170deg, #FAF8F4 0%, #F3EFE7 100%)', border: '#E8E4DC', text: '#1A1A2E', sub: '#888888', gold: '#C4A35A' },
  { id: 'white', label: 'ホワイト', bg: '#FFFFFF', border: '#E8E4DC', text: '#1A1A2E', sub: '#888888', gold: '#C4A35A' },
  { id: 'dark', label: 'ダーク', bg: '#1A1A2E', border: '#2A2A3E', text: '#FFFFFF', sub: '#AAAAAA', gold: '#C4A35A' },
  { id: 'navy', label: 'ネイビー', bg: '#1B2838', border: '#2A3848', text: '#FFFFFF', sub: '#AAAAAA', gold: '#C4A35A' },
  { id: 'sage', label: 'セージ', bg: '#E8EDE4', border: '#D0D8CC', text: '#2D3A2D', sub: '#6B756B', gold: '#8B7B3A' },
]

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

// ═══ シェアプレビューモーダル ═══
export default function VoiceShareModal({
  isOpen, onClose, voice, phraseId, phraseText,
  proId, proName, proTitle, proPhotoUrl,
}: VoiceShareModalProps) {
  const [saving, setSaving] = useState(false)
  const [selectedColor, setSelectedColor] = useState('cream')
  const supabase = createClient()

  if (!isOpen) return null

  const colorScheme = cardColors.find(c => c.id === selectedColor) || cardColors[0]

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
        {/* カラーピッカー */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ccc', marginBottom: 8, fontFamily: "'Inter', sans-serif" }}>
            カードの色
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {cardColors.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedColor(c.id)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: c.bg,
                  border: selectedColor === c.id
                    ? '3px solid #C4A35A'
                    : '2px solid #555',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>

        {/* カードプレビュー */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 0' }}>
          <div id="voice-card-for-export" style={{
            background: colorScheme.bg,
            border: `1px solid ${colorScheme.border}`,
            borderRadius: 18,
            padding: '32px 26px',
            width: 340,
            fontFamily: "'Inter', sans-serif",
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* THANK YOU header */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{
                fontSize: 22,
                fontWeight: 800,
                color: colorScheme.text,
                letterSpacing: 1,
              }}>
                THANK YOU
              </div>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: colorScheme.sub,
                marginTop: 4,
              }}>
                クライアントからの嬉しいコメント!!
              </div>
            </div>

            {/* 引用符 */}
            <div style={{ fontSize: 48, color: `${colorScheme.gold}4D`, fontFamily: 'Georgia, serif', lineHeight: 1 }}>&ldquo;</div>

            {/* コメント */}
            <div style={{
              color: colorScheme.text,
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1.9,
              marginTop: 8,
              marginBottom: 16,
            }}>
              {voice.comment}
            </div>

            {/* 区切り線 */}
            <div style={{ height: 1, background: `${colorScheme.gold}4D`, margin: '4px 0 12px' }} />

            {/* 感謝フレーズ */}
            <div style={{
              color: colorScheme.gold, fontSize: 11, fontStyle: 'italic', fontWeight: 700,
              marginBottom: 20,
            }}>
              ── {phraseText}
            </div>

            {/* プロ情報 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              {proPhotoUrl ? (
                <img src={proPhotoUrl} alt={proName}
                  style={{
                    width: 56, height: 56, borderRadius: '50%', objectFit: 'cover',
                    border: '2px solid rgba(0,0,0,0.08)', flexShrink: 0,
                  }} />
              ) : (
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: colorScheme.text === '#FFFFFF' ? '#333' : '#1A1A2E',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 22, fontWeight: 'bold', flexShrink: 0,
                }}>
                  {proName.charAt(0)}
                </div>
              )}
              <div>
                <div style={{
                  fontSize: 15, fontWeight: 800, color: colorScheme.text,
                  fontFamily: "'Inter', sans-serif",
                }}>
                  {proName}
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: colorScheme.gold,
                  fontFamily: "'Inter', sans-serif",
                  marginTop: 2,
                }}>
                  {proTitle}
                </div>
              </div>
            </div>

            {/* Logo */}
            <div style={{ fontFamily: "'Inter', sans-serif" }}>
              <span style={{ fontWeight: 400, letterSpacing: 2, color: colorScheme.text, fontSize: 13 }}>
                REAL
              </span>
              <span style={{ fontWeight: 800, letterSpacing: 2, color: colorScheme.text, fontSize: 13 }}>
                PROOF
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
