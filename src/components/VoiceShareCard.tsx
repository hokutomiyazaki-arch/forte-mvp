'use client'

import { useState, useRef, useCallback } from 'react'
import html2canvas from 'html2canvas'
import { createClient } from '@/lib/supabase'
import {
  VoiceCardTheme, hexToRgba,
  VOICE_CARD_PRESETS, resolveTheme, buildCustomTheme,
} from '@/lib/voiceCardThemes'

// ═══ Props ═══
interface VoiceShareModalProps {
  isOpen: boolean
  onClose: () => void
  voice: { id: string; comment: string; created_at: string }
  phraseId: number
  phrases: { id: number; text: string; is_default: boolean }[]
  proId: string
  proName: string
  proTitle: string
  proPhotoUrl: string | null
  totalProofs: number
  topStrengths: { label: string; count: number }[]
  savedThemeData: any           // DB の voice_card_theme 生値 (null許容)
  onSaveTheme: (data: any) => void  // DB保存コールバック
}

// ═══ シェアプレビューモーダル ═══
export default function VoiceShareModal({
  isOpen, onClose, voice,
  phraseId: initialPhraseId, phrases,
  proId, proName, proTitle, proPhotoUrl,
  totalProofs, topStrengths,
  savedThemeData, onSaveTheme,
}: VoiceShareModalProps) {
  const supabase = createClient()

  // ── テーマ state ──
  const resolved = resolveTheme(savedThemeData)
  const [theme, setTheme] = useState<VoiceCardTheme>(resolved.theme)
  const [presetIdx, setPresetIdx] = useState(resolved.presetIndex)
  const [isCustom, setIsCustom] = useState(resolved.isCustom)
  const [showProof, setShowProof] = useState(savedThemeData?.showProof !== false)
  const [showProInfo, setShowProInfo] = useState(savedThemeData?.showProInfo !== false)
  const [customBg, setCustomBg] = useState(savedThemeData?.bg || '#FAF8F4')
  const [customText, setCustomText] = useState(savedThemeData?.text || '#1A1A2E')
  const [customAccent, setCustomAccent] = useState(savedThemeData?.accent || '#C4A35A')

  // ── フレーズ state ──
  const [currentPhraseId, setCurrentPhraseId] = useState(initialPhraseId)
  const currentPhraseText = phrases.find(p => p.id === currentPhraseId)?.text
    || phrases.find(p => p.is_default)?.text || ''

  // ── シェア中 ──
  const [saving, setSaving] = useState(false)

  // ── debounce timer ──
  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  // テーマ保存（debounce 500ms）
  const saveTheme = useCallback((data: any) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => onSaveTheme(data), 500)
  }, [onSaveTheme])

  if (!isOpen) return null

  // トッププルーフ
  const topProof = topStrengths.length > 0 ? topStrengths[0] : null

  // テーマの明るさ判定（ボーダー色の分岐用）
  const isLightBg = (() => {
    const hex = theme.bg
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5
  })()

  // ── テーマ操作 ──
  function buildThemePayload(overrides?: { proof?: boolean; info?: boolean; custom?: boolean; bg?: string; text?: string; accent?: string; presetName?: string }) {
    const proof = overrides?.proof ?? showProof
    const info = overrides?.info ?? showProInfo
    if (overrides?.custom || (overrides?.custom === undefined && isCustom)) {
      return { type: 'custom', bg: overrides?.bg ?? customBg, text: overrides?.text ?? customText, accent: overrides?.accent ?? customAccent, showProof: proof, showProInfo: info }
    }
    return { type: 'preset', preset: overrides?.presetName ?? theme.name, showProof: proof, showProInfo: info }
  }

  function selectPreset(idx: number) {
    const preset = VOICE_CARD_PRESETS[idx]
    setTheme(preset)
    setPresetIdx(idx)
    setIsCustom(false)
    saveTheme({ type: 'preset', preset: preset.name, showProof, showProInfo })
  }

  function handleCustomColor(bg: string, text: string, accent: string) {
    const t = buildCustomTheme(bg, text, accent)
    setTheme(t)
    setIsCustom(true)
    setPresetIdx(-1)
    saveTheme({ type: 'custom', bg, text, accent, showProof, showProInfo })
  }

  function handleToggleProof(val: boolean) {
    setShowProof(val)
    saveTheme(buildThemePayload({ proof: val }))
  }

  function handleToggleProInfo(val: boolean) {
    setShowProInfo(val)
    saveTheme(buildThemePayload({ info: val }))
  }

  // ── シェア / ダウンロード ──
  const handleShare = async () => {
    setSaving(true)
    const el = document.getElementById('voice-card-for-export')
    if (!el) { setSaving(false); return }

    // キャプチャ前にスタイル調整
    const originalStyle = el.style.cssText
    el.style.margin = '0'
    el.style.boxShadow = 'none'
    el.style.borderRadius = '0'

    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#FFFFFF',
      useCORS: true,
      width: el.offsetWidth,
      height: el.offsetHeight,
      x: 0, y: 0, scrollX: 0, scrollY: 0,
      windowWidth: el.offsetWidth,
      windowHeight: el.offsetHeight,
    })

    // スタイルを元に戻す
    el.style.cssText = originalStyle

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/png')
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
        const hash = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        await (supabase as any).from('voice_shares').insert({
          vote_id: voice.id,
          professional_id: proId,
          phrase_id: currentPhraseId,
          include_profile: showProInfo,
          hash,
        })
        setSaving(false)
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') { setSaving(false); return }
      }
    }

    // フォールバック: ダウンロード
    const link = document.createElement('a')
    link.download = `realproof-voice-${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()

    const hash = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    await (supabase as any).from('voice_shares').insert({
      vote_id: voice.id,
      professional_id: proId,
      phrase_id: currentPhraseId,
      include_profile: showProInfo,
      hash,
    })
    setSaving(false)
  }

  // ═══ Render ═══
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
        {/* ═══ 1. カードプレビュー ═══ */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div id="voice-card-for-export" style={{ padding: 24, backgroundColor: '#FFFFFF' }}>
          <div style={{
            background: `linear-gradient(170deg, ${theme.bg} 0%, ${theme.bg2} 100%)`,
            borderRadius: 18,
            padding: '32px 26px',
            width: 340,
            border: isLightBg ? '2px solid rgba(0,0,0,0.08)' : '2px solid rgba(255,255,255,0.12)',
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
              color: theme.text, fontSize: 16, fontWeight: 600,
              lineHeight: 1.9, marginTop: 8, marginBottom: 16,
            }}>
              {voice.comment}
            </div>

            {/* 区切り線 */}
            <div style={{ height: 1, background: hexToRgba(theme.accent, 0.12), margin: '4px 0 12px' }} />

            {/* 感謝フレーズ */}
            <div style={{ color: theme.accent, fontSize: 12, fontWeight: 500, marginBottom: 20 }}>
              ── {currentPhraseText}
            </div>

            {/* プロ情報 */}
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
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{proName}</div>
                    <div style={{ fontSize: 10, fontWeight: 500, color: theme.sub, marginTop: 2 }}>{proTitle}</div>
                  </div>
                </div>
              </>
            )}

            {/* トッププルーフバッジ */}
            {showProof && topProof && (
              <div style={{
                background: hexToRgba(theme.accent, 0.08),
                border: `1px solid ${hexToRgba(theme.accent, 0.2)}`,
                borderRadius: 8, padding: '8px 12px', marginBottom: 16, textAlign: 'center',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.accent }}>
                  ◆ {topProof.count}人が「{topProof.label}」と証明
                </span>
              </div>
            )}

            {/* フッター */}
            <div style={{ height: 1, background: hexToRgba(theme.accent, 0.12), margin: '0 0 12px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: theme.sub }}>強みが、あなたを定義する。</span>
              <span style={{ fontSize: 9, color: theme.sub, fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>realproof.jp</span>
            </div>
          </div>
          </div>
        </div>

        {/* ═══ 2. フレーズ選択 ═══ */}
        <div style={{ maxWidth: 340, margin: '16px auto 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#F0ECE4', marginBottom: 8, fontFamily: "'Inter', sans-serif", letterSpacing: 1 }}>
            PHRASE
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {phrases.map(p => (
              <button key={p.id}
                onClick={() => setCurrentPhraseId(p.id)}
                style={{
                  background: currentPhraseId === p.id ? '#C4A35A' : 'transparent',
                  color: currentPhraseId === p.id ? '#fff' : '#BBBBBB',
                  border: currentPhraseId === p.id ? '1px solid #C4A35A' : '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8, padding: '8px 12px',
                  fontSize: 12, cursor: 'pointer', textAlign: 'left' as const,
                  transition: 'all 0.15s',
                }}
              >
                {p.text}
              </button>
            ))}
          </div>
        </div>

        {/* ═══ 3. カラーテーマ ═══ */}
        <div style={{ maxWidth: 340, margin: '16px auto 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#F0ECE4', marginBottom: 8, fontFamily: "'Inter', sans-serif", letterSpacing: 1 }}>
            THEME
          </div>

          {/* プリセット */}
          {(['Light', 'Dark', 'Vibrant'] as const).map((group, gi) => (
            <div key={group} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#999999', marginBottom: 4, fontFamily: "'Inter', sans-serif" }}>
                {group}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {VOICE_CARD_PRESETS.slice(gi * 5, gi * 5 + 5).map((preset, i) => {
                  const idx = gi * 5 + i
                  const isSelected = !isCustom && presetIdx === idx
                  return (
                    <button
                      key={preset.name}
                      onClick={() => selectPreset(idx)}
                      title={preset.name}
                      style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: `linear-gradient(135deg, ${preset.bg} 0%, ${preset.bg2} 100%)`,
                        border: isSelected ? '3px solid #C4A35A' : '2px solid rgba(255,255,255,0.2)',
                        boxShadow: isSelected ? '0 0 0 2px rgba(196,163,90,0.3)' : 'none',
                        cursor: 'pointer', padding: 0, transition: 'all 0.2s',
                      }}
                    />
                  )
                })}
              </div>
            </div>
          ))}

          {/* カスタムカラー */}
          <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#999999', marginBottom: 8, fontFamily: "'Inter', sans-serif" }}>
              CUSTOM
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {([
                { label: '背景', val: customBg, set: setCustomBg },
                { label: '文字', val: customText, set: setCustomText },
                { label: 'アクセント', val: customAccent, set: setCustomAccent },
              ] as const).map(({ label, val, set }) => (
                <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="color"
                    value={val}
                    onChange={e => {
                      const v = e.target.value
                      set(v)
                      const bg = label === '背景' ? v : customBg
                      const tx = label === '文字' ? v : customText
                      const ac = label === 'アクセント' ? v : customAccent
                      handleCustomColor(bg, tx, ac)
                    }}
                    style={{ width: 28, height: 28, border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0 }}
                  />
                  <span style={{ fontSize: 10, color: '#999999', fontWeight: 500 }}>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ 4. トグル ═══ */}
        <div style={{ maxWidth: 340, margin: '14px auto 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([
            { label: 'プルーフを表示', value: showProof, toggle: handleToggleProof },
            { label: 'プロ情報を表示', value: showProInfo, toggle: handleToggleProInfo },
          ] as const).map(({ label, value, toggle }) => (
            <label key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#F0ECE4' }}>{label}</span>
              <div
                onClick={() => toggle(!value)}
                style={{
                  width: 40, height: 22, borderRadius: 11,
                  background: value ? '#C4A35A' : '#ccc',
                  position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 2,
                  left: value ? 20 : 2,
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </div>
            </label>
          ))}
        </div>

        {/* ═══ 5. シェアボタン ═══ */}
        <button
          onClick={handleShare}
          disabled={saving}
          style={{
            width: '100%', maxWidth: 340,
            margin: '16px auto 0', display: 'block',
            padding: '16px 24px',
            background: '#C4A35A', color: '#FFFFFF',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 800, fontSize: 15,
            borderRadius: 14, border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s', letterSpacing: 0.5,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'シェア中...' : 'この声をシェアする'}
        </button>

        {/* ═══ 6. 戻るボタン ═══ */}
        <button
          onClick={onClose}
          style={{
            width: '100%', maxWidth: 340,
            margin: '10px auto 0', display: 'block',
            padding: 12, background: 'transparent',
            color: '#888', fontFamily: "'Inter', sans-serif",
            fontWeight: 600, fontSize: 13,
            border: 'none', cursor: 'pointer',
          }}
        >
          戻る
        </button>
      </div>
    </div>
  )
}
