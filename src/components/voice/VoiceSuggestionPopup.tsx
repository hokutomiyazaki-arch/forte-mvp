'use client'

import { useEffect, useRef, useState } from 'react'
import type { VoiceComment } from '@/components/card/types'
import {
  VOICE_CARD_PRESETS,
  buildCustomTheme,
  hexToRgba,
  type VoiceCardTheme,
} from '@/lib/voiceCardThemes'
import { executeVoiceShare } from '@/lib/voice-share'
import { REALPROOF_LOGO_BASE64 } from '@/lib/logoBase64'
import {
  isLightBackground,
  getCommentFontSize,
  CARD_SHAPES,
} from '@/lib/voice-card-shared'

/**
 * VoiceSuggestionPopup（v1.2 §12.3 / v1.2.1 §13）
 *
 * シェア促進ポップアップ本体。ダッシュボード読み込み時に
 * /api/dashboard/popup-suggestion を叩いて should_show:true なら表示する。
 *
 * 主な責務:
 *   - 提案された Voice + テーマ + フレーズの簡易プレビューを表示
 *   - 3 つの CTA: シェアする / デザインを編集する / 後で
 *   - シェアは executeVoiceShare (タスク1 共通化) を経由
 *   - シェア成功時のみ popup-action API に user_action='shared' を POST
 *     edited / dismissed の popup-action は親 (dashboard) が担当
 *
 * a11y:
 *   - role="dialog" / aria-modal="true" / aria-labelledby
 *   - ESC で閉じる (onDismiss)
 *   - フォーカストラップ (Tab 巡回)
 *   - 開く前のフォーカス位置を復元 (cleanup)
 *
 * z-index: 5000（VoiceShareCard 9999 より下、SupportersModal 1000 より上）
 */

export type PopupType = 'first' | 'random' | 'milestone'
export type BadgeEvent = 'PROVEN' | 'SPECIALIST' | 'MASTER'

export interface SuggestedTheme {
  type: 'preset' | 'custom'
  preset: string | null
  custom: {
    bg: string
    text: string
    accent: string
    showProof: boolean
    showProInfo: boolean
  } | null
}

export interface VoiceSuggestionPopupProps {
  isOpen: boolean
  popupType: PopupType
  badgeEvent?: BadgeEvent | null
  vote: VoiceComment
  suggestedTheme: SuggestedTheme
  /** 選ばれた感謝フレーズの ID（呼び出し元で gratitude_phrases から resolve） */
  suggestedPhraseId: number | null
  /** 選ばれた感謝フレーズのテキスト（呼び出し元で resolve 済みを渡す） */
  phraseText: string
  professionalId: string
  proName: string
  proTitle: string
  proPhotoUrl: string | null

  /** シェア成功後（popup-action shared は内部で POST 済み） */
  onShare: () => void
  /** 「デザインを編集する」: popup-action edited と次状態遷移は親担当 */
  onEdit: () => void
  /** 「後で」/ ESC / 背景タップ: popup-action dismissed と次状態遷移は親担当 */
  onDismiss: () => void
}

const Z_INDEX = 5000
/** html2canvas が捕捉するエクスポート要素の id（VoiceShareCard とは別 id） */
const EXPORT_ELEMENT_ID = 'voice-popup-card-for-export'

const HEADER_TEXT_FIRST = '最初の声をシェアしてみませんか？'
const HEADER_TEXT_RANDOM = '素敵な声が届いています。シェアしませんか？'
const HEADER_TEXT_MILESTONE_FALLBACK = 'バッジ獲得、おめでとうございます！記念にシェアしませんか？'

/** SuggestedTheme から VoiceCardTheme を復元 */
function resolveSuggestedTheme(s: SuggestedTheme): VoiceCardTheme {
  if (s.type === 'preset' && s.preset) {
    const preset = VOICE_CARD_PRESETS.find(p => p.name === s.preset)
    if (preset) return preset
  }
  if (s.type === 'custom' && s.custom) {
    return buildCustomTheme(s.custom.bg, s.custom.text, s.custom.accent)
  }
  return VOICE_CARD_PRESETS[0]
}

function buildHeaderText(popupType: PopupType, badge: BadgeEvent | null | undefined): string {
  if (popupType === 'first') return HEADER_TEXT_FIRST
  if (popupType === 'random') return HEADER_TEXT_RANDOM
  // milestone
  return badge
    ? `${badge} 達成、おめでとうございます！記念にシェアしませんか？`
    : HEADER_TEXT_MILESTONE_FALLBACK
}

export default function VoiceSuggestionPopup({
  isOpen,
  popupType,
  badgeEvent,
  vote,
  suggestedTheme,
  suggestedPhraseId,
  phraseText,
  professionalId,
  proName,
  proTitle,
  proPhotoUrl,
  onShare,
  onEdit,
  onDismiss,
}: VoiceSuggestionPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [sharing, setSharing] = useState(false)
  // ── stories/feed トグル（VoiceShareCard と同じデフォルト 'stories'） ──
  // Fix-2 でトグル UI を追加するまでは固定。Fix-1 では state だけ用意。
  const [exportMode, setExportMode] = useState<'stories' | 'feed'>('stories')
  // ストーリーズ用背景色: Fix-1/Fix-2 とも '#FFFFFF' 固定（CEO 確定）
  const storyBg: '#FFFFFF' | '#111111' = '#FFFFFF'
  // 形状は 'round' 固定（CEO 確定: shape 切替 UI は popup には追加しない）
  const currentShape = CARD_SHAPES.find(s => s.id === 'round')!
  // VoiceShareCard line 130-132 の borderRadius 計算を踏襲
  const previewRadius = exportMode === 'stories' ? currentShape.borderRadius : 18
  const exportRadius = exportMode === 'stories' ? currentShape.borderRadius * 2 : 36

  // ── a11y: ESC / focus trap / focus restore ──
  // 依存配列はプリミティブ (isOpen) のみ。onDismiss は最新参照を ref で保持
  // しなくても、ESC 押下時の onDismiss はその時点のクロージャ参照で十分。
  // ただし onDismiss を依存配列に入れると親が再生成するたびに effect 再実行 →
  // フォーカス復元が暴発するため、依存配列からは意図的に除外し
  // eslint コメントで明示。
  useEffect(() => {
    if (!isOpen) return

    previousFocusRef.current = document.activeElement as HTMLElement

    // 初期フォーカス: 最初のフォーカス可能ボタン
    const firstFocusable = popupRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    firstFocusable?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
        return
      }
      if (e.key === 'Tab') {
        const focusables = popupRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (!focusables || focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // フォーカス復元（要素が DOM から消えていたら silent fail）
      try {
        previousFocusRef.current?.focus()
      } catch {
        // noop
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  // テーマ復元
  const theme = resolveSuggestedTheme(suggestedTheme)
  // showProInfo: custom 保存があれば respect、preset なら true
  // ※ Fix-3 で props として受け取るようにする予定。Fix-1 では既存ロジック維持
  const showProInfo =
    suggestedTheme.type === 'custom'
      ? suggestedTheme.custom?.showProInfo !== false
      : true
  // showProof: ※ Fix-3 で props 化予定。Fix-1 では true 固定
  const showProof = true
  // topStrengths: ※ Fix-3 で props 化予定。Fix-1 では一旦 null（バッジ非表示）
  const topProof: { label: string; count: number } | null = null
  const isLightBg = isLightBackground(theme.bg)
  const headerText = buildHeaderText(popupType, badgeEvent)

  // ── シェア処理 ──
  const handleShareClick = async () => {
    if (sharing) return
    setSharing(true)

    const el = document.getElementById(EXPORT_ELEMENT_ID)
    if (!el) {
      setSharing(false)
      return
    }

    const result = await executeVoiceShare({
      cardElement: el,
      exportMode, // ← state から（Fix-1: stories/feed どちらにも対応）
      voteId: vote.id,
      professionalId,
      phraseId: suggestedPhraseId ?? 1,
      includeProfile: showProInfo,
      source: 'popup',
    })

    if (result.success && result.shared) {
      // popup-action POST (shared)。失敗してもユーザー体験を阻害しない
      try {
        await fetch('/api/dashboard/popup-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vote_id: vote.id,
            popup_type: popupType,
            badge_event: badgeEvent ?? null,
            user_action: 'shared',
          }),
        })
      } catch {
        // noop
      }
      onShare()
    }

    setSharing(false)
  }

  // ────────────────────────────────────────────────────────────────
  // 表示用 / エクスポート用の共用カードレンダラー
  //
  // VoiceShareCard.tsx (line 202-340 visible / line 626-803 export) の
  // JSX 構造を完全コピー。数値・スタイル・要素順序すべて同一。
  // 唯一の差分:
  //   - shape は 'round' 固定（CARD_SHAPES.find(s => s.id === 'round')）
  //     stamp/notch/tail/特殊形状は使わないため、それらの分岐は省略
  //   - エクスポート用フッター右側は VoiceShareCard では 'realproof.jp'
  //     テキストだが、popup ではロゴ画像のまま（CEO 確定）
  // 削除した独自要素（VoiceShareCard には存在しない）:
  //   - display_mode 別ヘッダー（クライアント顔写真+苗字 / イニシャル+苗字）
  //   - 日付表示
  // ────────────────────────────────────────────────────────────────
  const renderCard = (forExport: boolean) => {
    // ── フレーム (stories: 9:16 / feed: 白パディング) ──
    const frameStyle: React.CSSProperties =
      exportMode === 'stories'
        ? forExport
          ? {
              width: 1080,
              height: 1920,
              background: storyBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 60px',
              boxSizing: 'border-box',
            }
          : {
              width: 340,
              aspectRatio: '9 / 16',
              background: storyBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 20px',
              boxSizing: 'border-box',
            }
        : forExport
          ? { display: 'inline-block' }
          : { padding: 24, backgroundColor: '#FFFFFF' }

    // ── 中間ラッパー幅 (round shape: stamp/notch/tail なしのため直接指定) ──
    const wrapperWidth: number | string =
      exportMode === 'stories' ? '100%' : forExport ? 1080 : 340

    return (
      // VoiceShareCard line 629 と同じく、id="voice-popup-card-for-export" は
      // frame の最外側に付ける。html2canvas に frame (stories: 1080×1920 white
      // BG + padded gradient card) ごと捕捉させるため。
      <div
        id={forExport ? EXPORT_ELEMENT_ID : undefined}
        style={frameStyle}
      >
        <div style={{ width: wrapperWidth }}>
          <div style={{ position: 'relative' }}>
            {/* ── カード本体（id は frame に付与済みなのでここには付けない） ── */}
            <div
              style={{
                width: '100%',
                background: `linear-gradient(170deg, ${theme.bg} 0%, ${theme.bg2} 100%)`,
                borderRadius: forExport ? exportRadius : previewRadius,
                padding: forExport ? '64px 52px' : '32px 26px',
                border: isLightBg
                  ? forExport
                    ? '4px solid rgba(0,0,0,0.08)'
                    : '2px solid rgba(0,0,0,0.08)'
                  : forExport
                    ? '4px solid rgba(255,255,255,0.12)'
                    : '2px solid rgba(255,255,255,0.12)',
                fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
                boxSizing: 'border-box',
              }}
            >
              {/* ── ヘッダー: REALPROOF ロゴ + サブタイトル ── */}
              <div
                style={{
                  textAlign: 'center',
                  marginBottom: forExport ? 48 : 20,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={REALPROOF_LOGO_BASE64}
                  alt="REALPROOF"
                  style={{
                    width: '80%',
                    maxWidth: forExport ? 600 : 280,
                    height: 'auto',
                    objectFit: 'contain',
                    filter: isLightBg ? 'none' : 'brightness(2)',
                  }}
                />
                <div
                  style={{
                    fontSize: forExport ? 28 : 11,
                    color: theme.sub,
                    marginTop: forExport ? 16 : 6,
                  }}
                >
                  クライアントのリアルな声を紹介
                </div>
              </div>

              {/* ── 引用符 ── */}
              <div
                style={{
                  fontSize: forExport ? 120 : 56,
                  lineHeight: 1,
                  color: hexToRgba(theme.accent, 0.22),
                  fontFamily: forExport
                    ? "Georgia, 'Times New Roman', serif"
                    : 'Georgia, serif',
                  marginBottom: forExport ? -20 : 0,
                }}
              >
                {'\u201C'}
              </div>

              {/* ── コメント ── */}
              <div
                style={{
                  color: theme.text,
                  fontSize: forExport
                    ? getCommentFontSize(vote.comment, exportMode) * 3
                    : getCommentFontSize(vote.comment, exportMode),
                  fontWeight: 600,
                  lineHeight: forExport ? 1.85 : 1.8,
                  marginTop: forExport ? 0 : 8,
                  marginBottom: forExport ? 40 : 16,
                  letterSpacing: forExport ? 0.5 : 0,
                }}
              >
                {vote.comment}
              </div>

              {/* ── コメント下区切り線 (visible のみ) ── */}
              {!forExport && (
                <div
                  style={{
                    height: 1,
                    background: hexToRgba(theme.accent, 0.12),
                    margin: '4px 0 12px',
                  }}
                />
              )}

              {/* ── 感謝フレーズ ── */}
              <div
                style={{
                  color: theme.accent,
                  fontSize: forExport ? 32 : 12,
                  fontWeight: 500,
                  marginBottom: forExport ? 40 : 20,
                  letterSpacing: forExport ? 1 : 0,
                }}
              >
                ── {phraseText}
              </div>

              {/* ── プロ情報 (showProInfo === true) ── */}
              {showProInfo &&
                (forExport ? (
                  // エクスポート: 自身の borderTop で区切り
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 28,
                      paddingTop: 32,
                      borderTop: `2px solid ${hexToRgba(theme.accent, 0.15)}`,
                      marginBottom: 32,
                    }}
                  >
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
                      <div
                        style={{
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
                        }}
                      >
                        {proName.charAt(0)}
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 32, fontWeight: 600, color: theme.text }}>{proName}</div>
                      <div style={{ fontSize: 24, fontWeight: 500, color: theme.sub, marginTop: 6 }}>{proTitle}</div>
                    </div>
                  </div>
                ) : (
                  // visible: 独立した区切り線 + コンテナ
                  <>
                    <div
                      style={{
                        height: 1,
                        background: hexToRgba(theme.accent, 0.12),
                        margin: '0 0 14px',
                      }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        marginBottom: 16,
                      }}
                    >
                      {proPhotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={proPhotoUrl}
                          alt={proName}
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: `2px solid ${hexToRgba(theme.accent, 0.2)}`,
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            background: hexToRgba(theme.accent, 0.15),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: theme.accent,
                            fontSize: 20,
                            fontWeight: 'bold',
                            flexShrink: 0,
                          }}
                        >
                          {proName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{proName}</div>
                        <div style={{ fontSize: 10, fontWeight: 500, color: theme.sub, marginTop: 2 }}>{proTitle}</div>
                      </div>
                    </div>
                  </>
                ))}

              {/* ── トッププルーフバッジ (showProof === true && topProof) ── */}
              {showProof && topProof && (
                <div
                  style={{
                    background: hexToRgba(theme.accent, 0.08),
                    border: forExport
                      ? `2px solid ${hexToRgba(theme.accent, 0.2)}`
                      : `1px solid ${hexToRgba(theme.accent, 0.2)}`,
                    borderRadius: forExport ? 16 : 8,
                    padding: forExport ? '20px 28px' : '8px 12px',
                    marginBottom: forExport ? 32 : 16,
                    textAlign: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: forExport ? 28 : 11,
                      fontWeight: 600,
                      color: theme.accent,
                    }}
                  >
                    ◆ {topProof.count}人が「{topProof.label}」と証明
                  </span>
                </div>
              )}

              {/* ── フッター ── */}
              {forExport ? (
                <div
                  style={{
                    borderTop: `2px solid ${hexToRgba(theme.accent, 0.12)}`,
                    paddingTop: 24,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 22,
                      color: theme.sub,
                      letterSpacing: 1,
                    }}
                  >
                    強みが、あなたを定義する。
                  </span>
                  {/* CEO 確定: エクスポート用も realproof.jp テキストではなくロゴ画像のまま */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={REALPROOF_LOGO_BASE64}
                    alt="REALPROOF"
                    style={{
                      height: 44,
                      objectFit: 'contain',
                      filter: isLightBg ? 'none' : 'brightness(2)',
                    }}
                  />
                </div>
              ) : (
                <>
                  <div
                    style={{
                      height: 1,
                      background: hexToRgba(theme.accent, 0.12),
                      margin: '0 0 12px',
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: 9, color: theme.sub }}>
                      強みが、あなたを定義する。
                    </span>
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
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-suggestion-popup-header"
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z_INDEX,
        background: '#000000B3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
      }}
    >
      <div
        ref={popupRef}
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          borderRadius: 16,
          maxWidth: 360,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px 20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* ヘッダー */}
        <h2
          id="voice-suggestion-popup-header"
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#1A1A2E',
            lineHeight: 1.5,
            textAlign: 'center' as const,
            margin: '0 0 18px',
          }}
        >
          {headerText}
        </h2>

        {/* 表示プレビュー */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          {renderCard(false)}
        </div>

        {/* ═══ SIZE トグル ═══ */}
        {/* VoiceShareCard line 519-553 を literal copy。
            配色は VoiceShareCard が暗い背景前提 (#F0ECE4 / #BBBBBB /
            border rgba(255,255,255,0.15)) のため、白背景 popup では
            視認性が低い可能性あり。CEO 判断後に Fix-2 STOP で調整想定。 */}
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
        </div>

        {/* ボタン群 */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          <button
            type="button"
            onClick={handleShareClick}
            disabled={sharing}
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#C4A35A',
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 700,
              cursor: sharing ? 'not-allowed' : 'pointer',
              opacity: sharing ? 0.6 : 1,
              minHeight: 44,
            }}
          >
            {sharing ? 'シェア中...' : 'シェアする'}
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={sharing}
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              background: 'transparent',
              color: '#C4A35A',
              border: '1px solid #C4A35A',
              fontSize: 14,
              fontWeight: 600,
              cursor: sharing ? 'not-allowed' : 'pointer',
              opacity: sharing ? 0.6 : 1,
              minHeight: 44,
            }}
          >
            デザインを編集する
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={sharing}
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'transparent',
              color: '#888888',
              fontSize: 13,
              fontWeight: 500,
              cursor: sharing ? 'not-allowed' : 'pointer',
              opacity: sharing ? 0.6 : 1,
              minHeight: 44,
            }}
          >
            後で
          </button>
        </div>

        {/* 補足 */}
        <p
          style={{
            fontSize: 11,
            color: '#888888',
            textAlign: 'center' as const,
            margin: '16px 0 0',
            lineHeight: 1.6,
          }}
        >
          他にも気になる声があれば Voicesタブからシェアできます。
        </p>
      </div>

      {/* 画面外のエクスポート用カード（html2canvas が捕捉する高解像度版） */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: -9999,
          top: 0,
          pointerEvents: 'none',
        }}
      >
        {renderCard(true)}
      </div>
    </div>
  )
}
