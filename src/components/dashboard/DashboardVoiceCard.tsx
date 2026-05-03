'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * ダッシュボード Voices タブ専用カード
 *
 * 公開ページ用 VoiceCommentCard とは別物:
 *   - display_mode の同意設定は無視
 *   - auth_method ベースで「対面の相手」としてリッチに表示
 *   - data source: /api/dashboard/voices の voices[i]
 *
 * Phase 5 Step 3: トグルメニュー [⋯] と削除確認モーダルをカード内に統合。
 *   - 「返信を編集 / 返信を書く」「✓ 検索カードに表示中 / 検索カードに設定」を
 *     カード内のアクション領域に集約 (親 page.tsx から callback 経由で操作)
 *   - 編集系の破壊的操作 (写真削除 / コメント削除) は右上 [⋯] メニュー内に隠す
 */

export interface DashboardVoiceClient {
  type: 'rich' | 'auth_only'
  name?: string
  photoUrl?: string | null
  providerLabel?: string
  label?: string
  icon?: 'email' | 'sms' | 'default'
}

export interface DashboardVoiceReply {
  id: string
  reply_text: string
  created_at: string
  updated_at: string
  delivered_at: string | null
  delivered_via: 'line' | 'email' | null
}

export interface DashboardVoice {
  id: string
  comment: string
  created_at: string
  // VoiceReplyModal 互換のため保持 (UI 判定では使わない)
  auth_display_name: string | null
  client_photo_url: string | null
  display_mode: string | null
  reply: DashboardVoiceReply | null
  client: DashboardVoiceClient
}

interface Props {
  voice: DashboardVoice
  professionalName: string

  // 親 page.tsx から渡される操作 callback
  onReplyClick: (voice: DashboardVoice) => void
  onFeaturedToggle: (voiceId: string) => Promise<void>
  onPhotoDelete: (voiceId: string) => Promise<void>
  onCommentDelete: (voiceId: string) => Promise<void>

  // 親が管理する状態
  isFeatured: boolean
  isFeaturedSaving: boolean
}

// 削除確認モーダルの種別
type ConfirmAction = null | 'photo' | 'comment'

function ClientHeader({ client }: { client: DashboardVoiceClient }) {
  if (client.type === 'rich') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {client.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={client.photoUrl}
            alt={client.name || ''}
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: '#1A1A2E',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {client.name?.charAt(0) || '?'}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
            {client.name}
          </div>
          <div style={{ fontSize: 11, color: '#C4A35A', marginTop: 2 }}>
            {client.providerLabel}
          </div>
        </div>
      </div>
    )
  }

  // auth_only: アイコン + ラベルのみ
  const iconChar =
    client.icon === 'email' ? '✉' : client.icon === 'sms' ? '📱' : '👤'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: '#E8E8E0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          color: '#888888',
          flexShrink: 0,
        }}
      >
        {iconChar}
      </div>
      <div style={{ fontSize: 13, color: '#666666' }}>{client.label}</div>
    </div>
  )
}

export default function DashboardVoiceCard({
  voice,
  professionalName,
  onReplyClick,
  onFeaturedToggle,
  onPhotoDelete,
  onCommentDelete,
  isFeatured,
  isFeaturedSaving,
}: Props) {
  // STOP-1: 内部 state / ref 先行宣言 (UI 配置は STOP-2 以降)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  // メニュー項目の表示条件 (補強書 A-1)
  //   - 写真なし票では「写真削除」非表示
  //   - コメントなし/空文字票では「コメント削除」非表示 (型上 string だが防御的に null チェック併用)
  //   - 両方非表示なら [⋯] ボタン自体を非表示 (空メニューを開く意味なし)
  const showPhotoDelete = voice.client_photo_url !== null && voice.client_photo_url !== ''
  const showCommentDelete =
    voice.comment !== null &&
    voice.comment !== undefined &&
    voice.comment.trim() !== ''
  const showMenu = showPhotoDelete || showCommentDelete

  // メニュー外クリック検知 (補強書 B-5、依存配列はプリミティブのみ)
  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  // 確認モーダル: 初期フォーカスはキャンセルボタン (補強書 A-2、誤タップ防止)
  useEffect(() => {
    if (!confirmAction) return
    cancelButtonRef.current?.focus()
  }, [confirmAction])

  // 確認モーダル: ESC キーで閉じる (補強書 B-6、actionLoading 中は無効)
  // 依存配列はプリミティブのみ (CLAUDE.md ルール準拠)
  useEffect(() => {
    if (!confirmAction) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !actionLoading) {
        setConfirmAction(null)
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [confirmAction, actionLoading])

  // 削除実行 (補強書 B-3 の責任分担: 子は callback を await するだけ)
  const handleConfirmAction = async () => {
    if (!confirmAction) return
    setActionLoading(true)
    try {
      if (confirmAction === 'photo') {
        await onPhotoDelete(voice.id)
      } else if (confirmAction === 'comment') {
        await onCommentDelete(voice.id)
      }
      setConfirmAction(null)
      setMenuOpen(false)
    } catch (err) {
      // Step 3 では alert で簡易対応 (補強書 B-3、Step 4 でトースト化検討)
      alert((err as Error).message || '削除に失敗しました')
    } finally {
      setActionLoading(false)
    }
  }

  // 確認モーダル focus trap: Tab/Shift+Tab で 2 ボタン間を循環 (補強書 B-2)
  const handleDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const cancelEl = cancelButtonRef.current
    const confirmEl = confirmButtonRef.current
    if (!cancelEl || !confirmEl) return

    if (e.shiftKey) {
      // Shift+Tab: cancel にいるなら confirm へ循環
      if (document.activeElement === cancelEl) {
        e.preventDefault()
        confirmEl.focus()
      }
    } else {
      // Tab: confirm にいるなら cancel へ循環
      if (document.activeElement === confirmEl) {
        e.preventDefault()
        cancelEl.focus()
      }
    }
  }

  return (
    <div
      style={{
        padding: 16,
        background: 'linear-gradient(170deg, #FAF8F4 0%, #F3EFE7 100%)',
        border: '1px solid #E8E4DC',
        borderRadius: 14,
      }}
    >
      {/* ヘッダー: クライアント情報 (左) + [⋯] トグルメニュー (右) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <ClientHeader client={voice.client} />
        </div>

        {showMenu && (
          <div
            ref={menuRef}
            style={{ position: 'relative', flexShrink: 0 }}
            onClick={e => e.stopPropagation()}
          >
            {/*
              タップ領域は 44x44 (WCAG AAA 準拠、モバイル誤タップ防止)。
              視覚は内側 span の 32x32 円形で維持し、ホバー時の背景色も内側 span に
              のみ適用することで「視覚 32x32 のまま反応」を実現する。
            */}
            <button
              type="button"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="編集メニュー"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              style={{
                width: 44,
                height: 44,
                padding: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onMouseEnter={e => {
                const span = e.currentTarget.firstElementChild as HTMLElement | null
                if (span) {
                  span.style.background = 'rgba(26, 26, 46, 0.06)'
                  span.style.color = '#1A1A2E'
                }
              }}
              onMouseLeave={e => {
                const span = e.currentTarget.firstElementChild as HTMLElement | null
                if (span) {
                  span.style.background = 'transparent'
                  span.style.color = '#888888'
                }
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'transparent',
                  color: '#888888',
                  fontSize: 18,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                ⋯
              </span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="編集メニュー"
                style={{
                  position: 'absolute',
                  // button 44x44 の場合、視覚 span 32x32 の下端は y=38
                  // → 4px 下げて 42 で span 直下に自然配置 (タップ領域拡張に伴う調整)
                  top: 42,
                  right: 0,
                  zIndex: 100,
                  minWidth: 200,
                  background: '#FFFFFF',
                  border: '1px solid #E8E4DC',
                  borderRadius: 10,
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                  padding: 4,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {showPhotoDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setConfirmAction('photo')
                      setMenuOpen(false)
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      minHeight: 44,
                      borderRadius: 6,
                      border: 'none',
                      background: 'transparent',
                      color: '#1A1A2E',
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(26, 26, 46, 0.05)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <span aria-hidden="true">📸</span>
                    <span>顔写真を削除する</span>
                  </button>
                )}
                {showCommentDelete && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setConfirmAction('comment')
                      setMenuOpen(false)
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '10px 12px',
                      minHeight: 44,
                      borderRadius: 6,
                      border: 'none',
                      background: 'transparent',
                      color: '#1A1A2E',
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(26, 26, 46, 0.05)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <span aria-hidden="true">🗑️</span>
                    <span>コメントを削除する</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 引用符 + コメント本文 */}
      <div
        style={{
          fontSize: 32,
          color: 'rgba(196, 163, 90, 0.3)',
          fontFamily: 'Georgia, serif',
          lineHeight: 1,
        }}
      >
        &ldquo;
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#1A1A2E',
          lineHeight: 1.8,
          margin: '4px 0 10px',
          whiteSpace: 'pre-wrap',
        }}
      >
        {voice.comment}
      </div>

      {/* 日付 */}
      <div style={{ fontSize: 11, color: '#888888', fontFamily: "'Inter', monospace" }}>
        {new Date(voice.created_at).toLocaleDateString('ja-JP')}
      </div>

      {/* プロからの返信 (API 側で is_deleted=false フィルタ済) */}
      {voice.reply && (
        <div
          style={{
            marginTop: 14,
            paddingLeft: 12,
            borderLeft: '2px solid rgba(196, 163, 90, 0.4)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: '#C4A35A',
              fontWeight: 700,
              letterSpacing: 0.4,
              marginBottom: 6,
            }}
          >
            {professionalName} からの返信
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'rgba(26, 26, 46, 0.9)',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
            }}
          >
            {voice.reply.reply_text}
          </div>
        </div>
      )}

      {/*
        カード内アクション領域 (返信 / 検索カード設定)
        Step 4 で page.tsx 側の外側ボタン群が削除されるまで一時的に二重表示になる
        (補強書 C-2 で許容)。
      */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: '1px solid rgba(232, 228, 220, 0.6)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {/* 返信ボタン (reply 有無で文言切替) */}
        {voice.reply ? (
          <button
            type="button"
            onClick={() => onReplyClick(voice)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              background: 'transparent',
              color: '#888888',
              border: '1px solid #D0CCC4',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#1A1A2E'
              e.currentTarget.style.color = '#1A1A2E'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#D0CCC4'
              e.currentTarget.style.color = '#888888'
            }}
          >
            返信を編集
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onReplyClick(voice)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              background: '#1A1A2E',
              color: '#FFFFFF',
              border: '1px solid #1A1A2E',
              cursor: 'pointer',
            }}
          >
            返信を書く
          </button>
        )}

        {/* 検索カード設定ボタン (isFeatured で文言切替) */}
        {isFeatured ? (
          <button
            type="button"
            disabled={isFeaturedSaving}
            onClick={() => {
              void onFeaturedToggle(voice.id)
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              background: 'rgba(196,163,90,0.1)',
              color: '#C4A35A',
              border: '1px solid #C4A35A',
              cursor: isFeaturedSaving ? 'default' : 'pointer',
              opacity: isFeaturedSaving ? 0.5 : 1,
            }}
          >
            ✓ 検索カードに表示中
          </button>
        ) : (
          <button
            type="button"
            disabled={isFeaturedSaving}
            onClick={() => {
              void onFeaturedToggle(voice.id)
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              background: 'transparent',
              color: '#888888',
              border: '1px solid #D0CCC4',
              cursor: isFeaturedSaving ? 'default' : 'pointer',
              opacity: isFeaturedSaving ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (isFeaturedSaving) return
              e.currentTarget.style.borderColor = '#C4A35A'
              e.currentTarget.style.color = '#C4A35A'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#D0CCC4'
              e.currentTarget.style.color = '#888888'
            }}
          >
            検索カードに設定
          </button>
        )}
      </div>

      {/*
        削除確認モーダル (補強書 B-1: z-index 9000、B-2: a11y、B-4: インライン実装)
        - role="dialog" + aria-modal + aria-labelledby
        - 初期フォーカス: キャンセルボタン (補強書 A-2)
        - ESC キーで閉じる (actionLoading 中は無効)
        - Tab/Shift+Tab で focus trap (2 ボタン間で循環)
        - 背景クリックで閉じる (actionLoading 中は無効)
        - 各ボタン min-height: 44 (WCAG AAA タップ領域)
      */}
      {confirmAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-voice-confirm-title"
          onKeyDown={handleDialogKeyDown}
          onClick={e => {
            // 背景クリックで閉じる (actionLoading 中は無効)
            // stopPropagation で親カードの setExpandedVoice バブリングを防ぐ
            e.stopPropagation()
            if (e.target === e.currentTarget && !actionLoading) {
              setConfirmAction(null)
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9000,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              width: '100%',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.16)',
            }}
          >
            <h2
              id="dashboard-voice-confirm-title"
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#1A1A2E',
                margin: '0 0 12px',
              }}
            >
              {confirmAction === 'photo'
                ? '顔写真を削除しますか?'
                : 'コメントを削除しますか?'}
            </h2>
            <p
              style={{
                fontSize: 13,
                color: '#666666',
                lineHeight: 1.7,
                margin: '0 0 20px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {confirmAction === 'photo'
                ? 'このクライアントの顔写真がダッシュボード・公開ページ・シェアカードから完全に消えます。\nコメントは残ります。\n\nこの操作は元に戻せません。'
                : 'このクライアントが書いたコメント本文が完全に消えます。\n投票自体は記録として残りますが、ダッシュボードからはこのカードは表示されなくなります。\n\nこの操作は元に戻せません。'}
            </p>
            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => {
                  if (!actionLoading) setConfirmAction(null)
                }}
                disabled={actionLoading}
                style={{
                  minHeight: 44,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid #D0CCC4',
                  background: 'transparent',
                  color: '#1A1A2E',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: actionLoading ? 'default' : 'pointer',
                  opacity: actionLoading ? 0.5 : 1,
                }}
              >
                キャンセル
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={handleConfirmAction}
                disabled={actionLoading}
                style={{
                  minHeight: 44,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid #1A1A2E',
                  background: '#1A1A2E',
                  color: '#FFFFFF',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: actionLoading ? 'default' : 'pointer',
                  opacity: actionLoading ? 0.7 : 1,
                }}
              >
                {actionLoading ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
