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
import { getSurname } from '@/lib/display-name-utils'

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

/** 背景色の明るさ判定（VoiceShareCard と同じロジック） */
function isLightBackground(bg: string): boolean {
  const m = bg.match(/#[0-9A-Fa-f]{6}/)?.[0] || bg
  const hex = m.replace('#', '')
  if (hex.length !== 6) return true
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.5
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
  const showProInfo =
    suggestedTheme.type === 'custom'
      ? suggestedTheme.custom?.showProInfo !== false
      : true
  const isLightBg = isLightBackground(theme.bg)
  const headerText = buildHeaderText(popupType, badgeEvent)
  const surname = getSurname(vote.auth_display_name)

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
      exportMode: 'feed', // popup は 4:5 で固定
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

  // ── 表示用 / エクスポート用の共用カードレンダラー ──
  const renderCard = (forExport: boolean) => {
    const baseFontScale = forExport ? 2 : 1
    const cardWidth = forExport ? 680 : 280
    return (
      <div
        id={forExport ? EXPORT_ELEMENT_ID : undefined}
        style={{
          background: `linear-gradient(170deg, ${theme.bg} 0%, ${theme.bg2} 100%)`,
          border: isLightBg
            ? '1px solid rgba(0,0,0,0.06)'
            : '1px solid rgba(255,255,255,0.1)',
          borderRadius: forExport ? 24 : 14,
          padding: forExport ? '40px 36px' : '20px',
          width: cardWidth,
          boxSizing: 'border-box' as const,
          fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
          color: theme.text,
        }}
      >
        {/* display_mode 別のクライアントヘッダー */}
        {vote.display_mode === 'photo' && vote.client_photo_url && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: forExport ? 20 : 12,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={vote.client_photo_url}
              alt=""
              style={{
                width: 32 * baseFontScale,
                height: 32 * baseFontScale,
                borderRadius: '50%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
            {surname && (
              <span style={{ fontSize: 13 * baseFontScale, color: theme.sub }}>
                {surname}さん
              </span>
            )}
          </div>
        )}
        {vote.display_mode === 'nickname_only' && surname && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: forExport ? 20 : 12,
            }}
          >
            <div
              style={{
                width: 32 * baseFontScale,
                height: 32 * baseFontScale,
                borderRadius: '50%',
                background: hexToRgba(theme.accent, 0.15),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.accent,
                fontSize: 13 * baseFontScale,
                fontWeight: 700,
              }}
            >
              {surname.charAt(0)}
            </div>
            <span style={{ fontSize: 13 * baseFontScale, color: theme.sub }}>
              {surname}さん
            </span>
          </div>
        )}

        {/* 引用符 */}
        <div
          style={{
            fontSize: 32 * baseFontScale,
            color: hexToRgba(theme.accent, 0.22),
            fontFamily: "Georgia, 'Times New Roman', serif",
            lineHeight: 1,
            marginBottom: 4,
          }}
        >
          &ldquo;
        </div>

        {/* コメント本文 */}
        <div
          style={{
            fontSize: 14 * baseFontScale,
            fontWeight: 600,
            lineHeight: 1.7,
            margin: '4px 0 14px',
            whiteSpace: 'pre-wrap' as const,
          }}
        >
          {vote.comment}
        </div>

        {/* 区切り */}
        <div
          style={{
            height: 1,
            background: hexToRgba(theme.accent, 0.15),
            margin: '12px 0',
          }}
        />

        {/* 感謝フレーズ */}
        <div
          style={{
            fontSize: 11 * baseFontScale,
            color: theme.accent,
            fontStyle: 'italic',
            marginBottom: 8,
          }}
        >
          ── {phraseText || '感謝のひとこと'}
        </div>

        {/* プロ情報（showProInfo の時のみ） */}
        {showProInfo && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 12,
              paddingTop: 10,
              borderTop: `1px solid ${hexToRgba(theme.accent, 0.12)}`,
            }}
          >
            {proPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proPhotoUrl}
                alt=""
                style={{
                  width: 24 * baseFontScale,
                  height: 24 * baseFontScale,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            ) : (
              <div
                style={{
                  width: 24 * baseFontScale,
                  height: 24 * baseFontScale,
                  borderRadius: '50%',
                  background: hexToRgba(theme.accent, 0.18),
                }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11 * baseFontScale,
                  fontWeight: 700,
                  color: theme.text,
                }}
              >
                {proName}
              </div>
              {proTitle && (
                <div
                  style={{
                    fontSize: 9 * baseFontScale,
                    color: theme.sub,
                  }}
                >
                  {proTitle}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 日時 */}
        <div
          style={{
            fontSize: 9 * baseFontScale,
            color: theme.sub,
            marginTop: 8,
            fontFamily: "'Courier New', monospace",
          }}
        >
          {new Date(vote.created_at).toLocaleDateString('ja-JP')}
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
