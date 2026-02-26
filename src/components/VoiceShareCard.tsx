'use client'

import { useState, useRef, useCallback } from 'react'
import html2canvas from 'html2canvas'
import { createClient } from '@/lib/supabase'
import { REALPROOF_LOGO_BASE64 } from '@/lib/logoBase64'
import {
  VoiceCardTheme, hexToRgba,
  VOICE_CARD_PRESETS, resolveTheme, buildCustomTheme,
} from '@/lib/voiceCardThemes'

// ライト背景かどうかを判定
function isLightBackground(bgColor: string): boolean {
  // グラデーションの場合は最初の色で判定
  const color = bgColor.includes('gradient')
    ? bgColor.match(/#[0-9A-Fa-f]{6}/)?.[0] || '#FAF8F4'
    : bgColor;

  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

// コメント文字数に応じた動的フォントサイズ
function getCommentFontSize(text: string, mode: 'stories' | 'feed'): number {
  const len = text.length;
  if (mode === 'stories') {
    if (len <= 20) return 28;
    if (len <= 40) return 24;
    if (len <= 80) return 20;
    if (len <= 120) return 17;
    return 15;
  } else {
    if (len <= 20) return 22;
    if (len <= 40) return 19;
    if (len <= 80) return 16;
    if (len <= 120) return 14;
    return 13;
  }
}

// カード形状定義
const CARD_SHAPES = [
  { id: 'square', label: '🔲', borderRadius: 0, hasTail: false, hasNotch: false, hasStamp: false },
  { id: 'round', label: '🔳', borderRadius: 24, hasTail: false, hasNotch: false, hasStamp: false },
  { id: 'bubble', label: '💬', borderRadius: 24, hasTail: true, hasNotch: false, hasStamp: false },
  { id: 'ticket', label: '🏷', borderRadius: 12, hasTail: false, hasNotch: true, hasStamp: false },
  { id: 'stamp', label: '⭐', borderRadius: 0, hasTail: false, hasNotch: false, hasStamp: true },
] as const

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

  // ── エクスポートモード ──
  const [exportMode, setExportMode] = useState<'stories' | 'feed'>('stories')

  // ── ストーリーズ背景色 ──
  const [storyBg, setStoryBg] = useState<'#FFFFFF' | '#111111'>('#FFFFFF')

  // ── カード形状（ストーリーズのみ） ──
  const [cardShape, setCardShape] = useState<string>('round')

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

  // テーマの明るさ判定（ロゴ・ボーダー色の分岐用）
  const isLightBg = isLightBackground(theme.bg)

  // 現在のカード形状
  const currentShape = CARD_SHAPES.find(s => s.id === cardShape) || CARD_SHAPES[1]
  // プレビュー用 borderRadius（ストーリーズ: 形状依存 / フィード: 18固定）
  const previewRadius = exportMode === 'stories' ? currentShape.borderRadius : 18
  // エクスポート用 borderRadius（スケールアップ）
  const exportRadius = exportMode === 'stories' ? currentShape.borderRadius * 2 : 36

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

  // ── シェア / ダウンロード（フルブリードエクスポート）──
  const handleShare = async () => {
    setSaving(true)
    const el = document.getElementById('voice-card-for-export')
    if (!el) { setSaving(false); return }

    // モードに応じたスケール計算
    const targetWidth = exportMode === 'stories' ? 1080 : 680
    const scale = targetWidth / el.offsetWidth

    const canvas = await html2canvas(el, {
      scale,
      backgroundColor: null,
      useCORS: true,
      width: el.offsetWidth,
      height: el.offsetHeight,
    })

    // ストーリーズモード: 角丸なし → canvasそのまま
    // フィードモード: 角丸マスク適用
    let finalCanvas = canvas

    if (exportMode === 'feed') {
      finalCanvas = document.createElement('canvas')
      finalCanvas.width = canvas.width
      finalCanvas.height = canvas.height
      const ctx = finalCanvas.getContext('2d')
      if (ctx) {
        const radius = 36 * (scale / 2)
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
    }

    const blob = await new Promise<Blob>((resolve) => {
      finalCanvas.toBlob((b) => resolve(b!), 'image/png')
    })

    const file = new File([blob], `realproof-voice-${exportMode}.png`, { type: 'image/png' })

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
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `realproof-voice-${exportMode}.png`
    a.click()
    URL.revokeObjectURL(url)

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
        {/* ═══ 1. カードプレビュー（表示用、キャプチャ対象ではない）═══ */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {/* ストーリーズ: 9:16背景フレーム / フィード: 白パディング */}
          <div style={exportMode === 'stories' ? {
            width: 340,
            aspectRatio: '9 / 16',
            background: storyBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 20px',
            boxSizing: 'border-box' as const,
          } : {
            padding: 24,
            backgroundColor: '#FFFFFF',
          }}>
            {/* stamp: 外枠 dashed ボーダー */}
            <div style={exportMode === 'stories' && currentShape.hasStamp ? {
              border: `3px dashed ${theme.accent}`,
              padding: 6,
              width: exportMode === 'stories' ? '100%' : 340,
              boxSizing: 'border-box' as const,
            } : {
              width: exportMode === 'stories' ? '100%' : 340,
            }}>
            {/* ticket: 切り欠き用ラッパー */}
            <div style={{ position: 'relative' }}>
            {/* カード本体（両モード共通デザイン） */}
            <div style={{
              background: `linear-gradient(170deg, ${theme.bg} 0%, ${theme.bg2} 100%)`,
              borderRadius: previewRadius,
              padding: '32px 26px',
              width: '100%',
              border: isLightBg ? '2px solid rgba(0,0,0,0.08)' : '2px solid rgba(255,255,255,0.12)',
              fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              overflow: 'hidden',
              boxSizing: 'border-box' as const,
            }}>
              {/* カード上部ロゴ + サブテキスト */}
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={REALPROOF_LOGO_BASE64}
                  alt="REALPROOF"
                  style={{
                    width: '80%',
                    maxWidth: 280,
                    height: 'auto',
                    objectFit: 'contain',
                    filter: isLightBg ? 'none' : 'brightness(2)',
                  }}
                />
                <div style={{ fontSize: 11, color: theme.sub, marginTop: 6 }}>
                  クライアントのリアルな声を紹介
                </div>
              </div>

              {/* 引用符 */}
              <div style={{ fontSize: 56, color: hexToRgba(theme.accent, 0.22), fontFamily: 'Georgia, serif', lineHeight: 1 }}>&ldquo;</div>

              {/* コメント */}
              <div style={{
                color: theme.text,
                fontSize: getCommentFontSize(voice.comment, exportMode),
                fontWeight: 600,
                lineHeight: 1.8, marginTop: 8, marginBottom: 16,
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
                      // eslint-disable-next-line @next/next/no-img-element
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={REALPROOF_LOGO_BASE64}
                  alt="REALPROOF"
                  style={{
                    height: 22,
                    objectFit: 'contain',
                    filter: isLightBg ? 'none' : 'brightness(2)',
                  }}
                />
              </div>
            </div>
            {/* ticket: 切り欠き（左右の半円） */}
            {exportMode === 'stories' && currentShape.hasNotch && (
              <>
                <div style={{
                  position: 'absolute', left: -10, top: '50%', transform: 'translateY(-50%)',
                  width: 20, height: 20, borderRadius: '50%', background: storyBg,
                }} />
                <div style={{
                  position: 'absolute', right: -10, top: '50%', transform: 'translateY(-50%)',
                  width: 20, height: 20, borderRadius: '50%', background: storyBg,
                }} />
              </>
            )}
            </div>{/* /ticket wrapper */}
            {/* bubble: 吹き出しの三角 */}
            {exportMode === 'stories' && currentShape.hasTail && (
              <div style={{
                width: 0, height: 0,
                borderLeft: '12px solid transparent',
                borderRight: '12px solid transparent',
                borderTop: `16px solid ${theme.bg}`,
                margin: '0 auto',
              }} />
            )}
            </div>{/* /stamp wrapper */}
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

        {/* ═══ 3.5 カード形状（ストーリーズのみ）═══ */}
        {exportMode === 'stories' && (
          <div style={{ maxWidth: 340, margin: '14px auto 0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#F0ECE4', marginBottom: 8, fontFamily: "'Inter', sans-serif", letterSpacing: 1 }}>
              SHAPE
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {CARD_SHAPES.map(shape => (
                <button
                  key={shape.id}
                  onClick={() => setCardShape(shape.id)}
                  style={{
                    width: 44, height: 44,
                    fontSize: 20,
                    borderRadius: 8,
                    border: cardShape === shape.id ? '2px solid #C4A35A' : '1px solid rgba(255,255,255,0.15)',
                    background: cardShape === shape.id ? 'rgba(196,163,90,0.15)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {shape.label}
                </button>
              ))}
            </div>
          </div>
        )}

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

        {/* ═══ 5. サイズ選択 ═══ */}
        <div style={{ maxWidth: 340, margin: '14px auto 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#F0ECE4', marginBottom: 8, fontFamily: "'Inter', sans-serif", letterSpacing: 1 }}>
            SIZE
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { key: 'stories' as const, label: 'ストーリーズ（9:16）' },
              { key: 'feed' as const, label: 'フィード（4:5）' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setExportMode(key)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
                  borderRadius: 8,
                  border: exportMode === key
                    ? '1px solid #C4A35A'
                    : '1px solid rgba(255,255,255,0.15)',
                  background: exportMode === key
                    ? 'rgba(196,163,90,0.15)'
                    : 'transparent',
                  color: exportMode === key ? '#C4A35A' : '#BBBBBB',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ストーリーズ背景色の白黒切替 */}
          {exportMode === 'stories' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {([
                { key: '#FFFFFF' as const, label: '☀️ 白背景' },
                { key: '#111111' as const, label: '🌙 黒背景' },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStoryBg(key)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
                    borderRadius: 8,
                    border: storyBg === key
                      ? '1px solid #C4A35A'
                      : '1px solid rgba(255,255,255,0.15)',
                    background: storyBg === key
                      ? 'rgba(196,163,90,0.15)'
                      : 'transparent',
                    color: storyBg === key ? '#C4A35A' : '#BBBBBB',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ═══ 6. シェアボタン ═══ */}
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

        {/* ═══ 7. 戻るボタン ═══ */}
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

      {/* ════════ エクスポート用キャンバス（画面外に隠す）════════ */}
      <div style={{ position: 'fixed', left: -9999, top: 0, pointerEvents: 'none' }}>
        <div
          id="voice-card-for-export"
          style={exportMode === 'stories' ? {
            /* ストーリーズ: 背景フレーム 1080×1920 */
            width: 1080,
            height: 1920,
            background: storyBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 60px',
            boxSizing: 'border-box' as const,
          } : {
            /* フィード: カードのみ */
            display: 'inline-block',
          }}
        >
          {/* stamp: 外枠 dashed ボーダー（エクスポート） */}
          <div style={exportMode === 'stories' && currentShape.hasStamp ? {
            border: `6px dashed ${theme.accent}`,
            padding: 12,
            width: '100%',
            boxSizing: 'border-box' as const,
          } : {
            width: exportMode === 'stories' ? '100%' : 1080,
          }}>
          {/* ticket: 切り欠き用ラッパー（エクスポート） */}
          <div style={{ position: 'relative' }}>
          {/* カード本体（共通） */}
          <div style={{
            width: '100%',
            background: `linear-gradient(170deg, ${theme.bg} 0%, ${theme.bg2} 100%)`,
            borderRadius: exportRadius,
            padding: '64px 52px',
            fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
            boxSizing: 'border-box' as const,
            border: isLightBg ? '4px solid rgba(0,0,0,0.08)' : '4px solid rgba(255,255,255,0.12)',
          }}>
            {/* ロゴ + サブテキスト */}
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={REALPROOF_LOGO_BASE64}
                alt="REALPROOF"
                style={{
                  width: '80%',
                  maxWidth: 600,
                  height: 'auto',
                  objectFit: 'contain',
                  filter: isLightBg ? 'none' : 'brightness(2)',
                }}
              />
              <div style={{ fontSize: 28, color: theme.sub, marginTop: 16 }}>
                クライアントのリアルな声を紹介
              </div>
            </div>

            {/* 引用符 */}
            <div style={{
              fontSize: 120,
              lineHeight: 1,
              color: hexToRgba(theme.accent, 0.22),
              fontFamily: "Georgia, 'Times New Roman', serif",
              marginBottom: -20,
            }}>{"\u201C"}</div>

            {/* コメント */}
            <div style={{
              fontSize: getCommentFontSize(voice.comment, exportMode) * 3,
              fontWeight: 600,
              color: theme.text,
              lineHeight: 1.85,
              marginBottom: 40,
              letterSpacing: 0.5,
            }}>
              {voice.comment}
            </div>

            {/* 感謝フレーズ */}
            <div style={{
              fontSize: 32,
              color: theme.accent,
              fontWeight: 500,
              marginBottom: 40,
              letterSpacing: 1,
            }}>
              ── {currentPhraseText}
            </div>

            {/* プロ情報 */}
            {showProInfo && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 28,
                paddingTop: 32,
                borderTop: `2px solid ${hexToRgba(theme.accent, 0.15)}`,
                marginBottom: 32,
              }}>
                {proPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proPhotoUrl}
                    alt={proName}
                    crossOrigin="anonymous"
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: `3px solid ${hexToRgba(theme.accent, 0.25)}`,
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div style={{
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    background: hexToRgba(theme.accent, 0.18),
                    border: `3px solid ${hexToRgba(theme.accent, 0.3)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 42,
                    color: theme.accent,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {proName.charAt(0)}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 32, fontWeight: 600, color: theme.text }}>{proName}</div>
                  <div style={{ fontSize: 24, fontWeight: 500, color: theme.sub, marginTop: 6 }}>{proTitle}</div>
                </div>
              </div>
            )}

            {/* トッププルーフバッジ */}
            {showProof && topProof && (
              <div style={{
                background: hexToRgba(theme.accent, 0.08),
                border: `2px solid ${hexToRgba(theme.accent, 0.2)}`,
                borderRadius: 16,
                padding: '20px 28px',
                marginBottom: 32,
                textAlign: 'center',
              }}>
                <span style={{ fontSize: 28, fontWeight: 600, color: theme.accent }}>
                  ◆ {topProof.count}人が「{topProof.label}」と証明
                </span>
              </div>
            )}

            {/* フッター */}
            <div style={{
              borderTop: `2px solid ${hexToRgba(theme.accent, 0.12)}`,
              paddingTop: 24,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 22, color: theme.sub, letterSpacing: 1 }}>
                強みが、あなたを定義する。
              </span>
              <span style={{
                fontSize: 22,
                color: theme.sub,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                letterSpacing: 1,
              }}>
                realproof.jp
              </span>
            </div>
          </div>
          {/* ticket: 切り欠き（エクスポート用） */}
          {exportMode === 'stories' && currentShape.hasNotch && (
            <>
              <div style={{
                position: 'absolute', left: -20, top: '50%', transform: 'translateY(-50%)',
                width: 40, height: 40, borderRadius: '50%', background: storyBg,
              }} />
              <div style={{
                position: 'absolute', right: -20, top: '50%', transform: 'translateY(-50%)',
                width: 40, height: 40, borderRadius: '50%', background: storyBg,
              }} />
            </>
          )}
          </div>{/* /ticket wrapper */}
          {/* bubble: 吹き出し三角（エクスポート用） */}
          {exportMode === 'stories' && currentShape.hasTail && (
            <div style={{
              width: 0, height: 0,
              borderLeft: '24px solid transparent',
              borderRight: '24px solid transparent',
              borderTop: `32px solid ${theme.bg}`,
              margin: '0 auto',
            }} />
          )}
          </div>{/* /stamp wrapper */}
        </div>
      </div>
    </div>
  )
}
