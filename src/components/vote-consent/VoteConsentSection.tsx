'use client'

/**
 * VoteConsentSection — 投票完了画面の同意 UI
 *
 * cd9a55e で /card/[id] のクライアント名表示を全削除した結果、
 * 公開される唯一の要素は「写真」のみ。同意は写真表示の可否のみで十分。
 *
 * Email/SMS は公開要素ゼロのため、Vote 作成時に display_mode='hidden' を
 * 設定し、このコンポーネントには到達しない（vote-confirmed 側でスキップ）。
 *
 *   🅰 プロ投票 (voter_professional_id 有り)  → UI スキップ
 *   🅱 写真あり (Google/LINE)                  → YES/NO 2 択、YES=photo
 *   🅲 写真なし (sms_fallback OLD votes 等)    → 名前のみで同意（フォールバック）
 *
 * データ保存は仮実装（supabase client 直呼び）。
 */

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

type DisplayMode = 'photo' | 'nickname_only' | 'hidden' | 'pro_link' | null

export interface VoteConsentVote {
  id: string
  professional_id: string
  auth_method: string | null
  auth_display_name: string | null
  client_photo_url: string | null
  voter_professional_id: string | null
  display_mode: DisplayMode
}

interface Props {
  vote: VoteConsentVote
  /** プロ名。footer の「{pro.name}さんに連絡して変更・削除できます」で使用。 */
  proName?: string
  /** YES/NO どちらかが押されて UPDATE 成功した時に呼ばれる（リワード解放のゲート） */
  onComplete?: () => void
  /**
   * Phase 1.5: リワード受け取り同意チェックがON+YES/NOで配信トリガーする時に呼ぶ。
   * 親側 (vote-confirmed) で deliveryTriggeredRef による二重起動防止を実装済み。
   */
  onRewardOptinChange?: (optin: boolean) => void
}

type Variant = 'photo' | 'name_only' | 'skip'

function determineVariant(vote: VoteConsentVote): Variant {
  if (vote.voter_professional_id) return 'skip'
  if (vote.client_photo_url) return 'photo'
  if (vote.auth_display_name) return 'name_only'
  return 'skip'
}

// TODO Phase 3: move to PATCH /api/votes/[id]/display-mode
async function updateDisplayMode(
  voteId: string,
  displayMode: Exclude<DisplayMode, null | 'pro_link'>,
  authDisplayName?: string
): Promise<void> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = { display_mode: displayMode }
  if (authDisplayName && displayMode === 'nickname_only') {
    updateData.auth_display_name = authDisplayName
  }
  const { error } = await (supabase as any)
    .from('votes')
    .update(updateData)
    .eq('id', voteId)
  if (error) {
    console.error('[VoteConsentSection] display_mode update failed:', error)
    throw error
  }
}

// ─── 共通スタイル ───
const styles = {
  card: {
    background: '#1A1A2E',
    borderRadius: 16,
    padding: '28px 24px',
    color: '#FAFAF7',
    fontFamily: 'Noto Serif JP, Noto Sans JP, serif',
    animation: 'consentFadeIn .4s ease-out',
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: 'center' as const,
    lineHeight: 1.55,
    marginBottom: 14,
    letterSpacing: '0.02em',
  },
  subtitle: {
    fontSize: 14,
    color: '#B5B5C3',
    textAlign: 'center' as const,
    lineHeight: 1.7,
    marginBottom: 22,
  },
  previewRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 26,
  },
  avatarPhoto: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    objectFit: 'cover' as const,
    border: '2px solid #C4A35A',
    flexShrink: 0,
  } as React.CSSProperties,
  avatarInitial: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: '#C4A35A',
    color: '#1A1A2E',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    fontWeight: 700,
    flexShrink: 0,
  } as React.CSSProperties,
  nameText: {
    fontSize: 16,
    fontWeight: 600,
    color: '#FAFAF7',
  },
  btnGold: {
    width: '100%',
    minHeight: 52,
    padding: '14px 20px',
    borderRadius: 12,
    background: '#C4A35A',
    color: '#1A1A2E',
    border: 'none',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    marginBottom: 10,
    transition: 'opacity .15s',
  } as React.CSSProperties,
  btnGhost: {
    width: '100%',
    minHeight: 52,
    padding: '14px 20px',
    borderRadius: 12,
    background: 'transparent',
    color: '#B5B5C3',
    border: '1px solid rgba(181,181,195,0.25)',
    fontSize: 15,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'opacity .15s',
  } as React.CSSProperties,
  input: {
    width: '100%',
    minHeight: 52,
    padding: '14px 16px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.06)',
    color: '#FAFAF7',
    border: '1px solid rgba(196,163,90,0.35)',
    fontSize: 16,
    marginBottom: 8,
    outline: 'none',
    fontFamily: 'inherit',
  } as React.CSSProperties,
  inputHint: {
    fontSize: 12,
    color: '#8B8B9A',
    textAlign: 'center' as const,
    marginBottom: 18,
  },
  footNote: {
    fontSize: 12,
    color: '#8B8B9A',
    textAlign: 'center' as const,
    marginTop: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#FCA5A5',
    textAlign: 'center' as const,
    marginBottom: 10,
  },
  successCard: {
    background: 'rgba(196,163,90,0.1)',
    borderRadius: 16,
    padding: '20px 24px',
    color: '#FAFAF7',
    textAlign: 'center' as const,
    border: '1px solid rgba(196,163,90,0.3)',
    animation: 'consentFadeIn .4s ease-out',
  } as React.CSSProperties,
  // ─── Phase 1.5: リワード同意チェックボックス (dark card 内側) ───
  rewardOptinSection: {
    marginTop: 18,
    marginBottom: 18,
  } as React.CSSProperties,
  rewardOptinDivider: {
    height: 1,
    background: 'linear-gradient(to right, transparent, rgba(196,163,90,0.35), transparent)',
    marginBottom: 18,
  } as React.CSSProperties,
  rewardOptinLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '14px 16px',
    backgroundColor: 'rgba(196,163,90,0.08)',
    border: '1px solid rgba(196,163,90,0.3)',
    borderRadius: 10,
    cursor: 'pointer',
    margin: 0,
  } as React.CSSProperties,
  rewardOptinCheckbox: {
    marginTop: 3,
    width: 20,
    height: 20,
    accentColor: '#C4A35A',
    cursor: 'inherit',
    flexShrink: 0,
  } as React.CSSProperties,
  rewardOptinText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 1.65,
    color: '#FAFAF7',
  } as React.CSSProperties,
  rewardOptinNote: {
    color: '#8B8B9A',
    fontSize: 12,
    marginLeft: 4,
  } as React.CSSProperties,
}

// keyframes は 1 度だけ inject する
let keyframesInjected = false
function ensureKeyframes() {
  if (keyframesInjected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.textContent = `
    @keyframes consentFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `
  document.head.appendChild(style)
  keyframesInjected = true
}

export default function VoteConsentSection({ vote, proName, onComplete, onRewardOptinChange }: Props) {
  ensureKeyframes()

  const variant = determineVariant(vote)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Phase 1.5: リワード受け取り同意のチェック状態
  const [rewardOptinChecked, setRewardOptinChecked] = useState(false)

  // 認証方法による文言切替。
  // sms 認証は本来 vote-confirmed 側で consentSkipped により本コンポーネントへ
  // 到達しないが、防御的に隠す。
  const isLineAuth = vote.auth_method === 'line'
  const isSmsAuth = vote.auth_method === 'sms'
  const channelText = isLineAuth ? 'LINE' : 'メール'
  const showRewardOptin = !isSmsAuth
  const [errorText, setErrorText] = useState('')

  // マイカード機能は未実装のため、変更・削除導線はプロへの直接連絡に誘導する。
  // proName が無い場合は汎用フォールバック。
  const changeNote = proName
    ? `※あとから${proName}さんに連絡して変更・削除できます`
    : '※あとからプロの方に連絡して変更・削除できます'

  // ケース🅰 プロ投票 — 何もレンダーしない
  if (variant === 'skip') return null

  // 送信成功後の共通表示
  if (submitted) {
    const successNote = proName
      ? `あとから${proName}さんに連絡して変更・削除できます。`
      : 'あとからプロの方に連絡して変更・削除できます。'
    return (
      <div style={styles.successCard}>
        <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
          ありがとうございました
        </p>
        <p style={{ fontSize: 13, color: '#B5B5C3', lineHeight: 1.6 }}>
          {successNote}
        </p>
      </div>
    )
  }

  /**
   * Phase 1.5: リワード受け取り同意の保存と配信トリガー。
   * チェックON 時のみ PATCH + 親への通知。失敗しても写真同意処理はブロックしない
   * (UI 体験優先 — 同意失敗で全体止めると最悪の UX)。
   */
  const persistRewardOptin = async () => {
    if (!rewardOptinChecked) return
    if (!onRewardOptinChange) return
    try {
      const res = await fetch(`/api/votes/${vote.id}/reward-optin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ reward_optin: true }),
      })
      if (!res.ok) {
        console.warn('[VoteConsentSection] reward-optin save returned non-ok:', res.status)
        return
      }
      onRewardOptinChange(true)
    } catch (e) {
      console.error('[VoteConsentSection] reward-optin save failed (non-blocking):', e)
    }
  }

  // ─── 共通アクション: YES ボタン（photo / name_only） ───
  const handleYes = async () => {
    if (submitting) return
    setSubmitting(true)
    setErrorText('')
    try {
      // Phase 1.5: 写真同意の前にリワード保存 (失敗しても下を続行)
      await persistRewardOptin()

      const mode = variant === 'photo' ? 'photo' : 'nickname_only'
      await updateDisplayMode(vote.id, mode)
      setSubmitted(true)
      onComplete?.()
    } catch {
      setErrorText('更新に失敗しました。もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── 共通アクション: NO / スキップ ───
  const handleNo = async () => {
    if (submitting) return
    setSubmitting(true)
    setErrorText('')
    try {
      // Phase 1.5: 写真NO時もリワード同意は保存する (チェックされていれば)
      await persistRewardOptin()

      await updateDisplayMode(vote.id, 'hidden')
      setSubmitted(true)
      onComplete?.()
    } catch {
      setErrorText('更新に失敗しました。もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Phase 1.5: リワード同意チェックボックス (photo / name_only 共通) ───
  const rewardOptinBlock = showRewardOptin ? (
    <div style={styles.rewardOptinSection}>
      <div style={styles.rewardOptinDivider} />
      <label style={styles.rewardOptinLabel}>
        <input
          type="checkbox"
          checked={rewardOptinChecked}
          onChange={(e) => setRewardOptinChecked(e.target.checked)}
          disabled={submitting}
          style={styles.rewardOptinCheckbox}
        />
        <span style={styles.rewardOptinText}>
          {proName ? `${proName}さん` : 'プロの方'}や REALPROOF からの
          <br />
          リワード・お知らせ・新機能情報を
          <br />
          {channelText}で受け取る
          <span style={styles.rewardOptinNote}>(任意)</span>
        </span>
      </label>
    </div>
  ) : null

  // ─── ケース🅱 写真あり (Google/LINE) — 写真表示の可否のみ確認 ───
  if (variant === 'photo') {
    return (
      <div style={styles.card}>
        <div style={styles.subtitle}>
          この写真を、コメントと一緒に表示してもOKですか？
        </div>
        <div style={styles.previewRow}>
          {vote.client_photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vote.client_photo_url}
              alt="あなたのプロフィール写真"
              style={styles.avatarPhoto}
            />
          )}
        </div>
        {errorText && <div style={styles.errorText}>{errorText}</div>}
        {rewardOptinBlock}
        <button
          style={{ ...styles.btnGold, opacity: submitting ? 0.6 : 1 }}
          onClick={handleYes}
          disabled={submitting}
        >
          {submitting ? '送信中...' : '表示OK'}
        </button>
        <button
          style={{ ...styles.btnGhost, opacity: submitting ? 0.6 : 1 }}
          onClick={handleNo}
          disabled={submitting}
        >
          表示しない
        </button>
        <div style={styles.footNote}>
          {changeNote}
        </div>
      </div>
    )
  }

  // ─── ケース🅲 Clerk + 写真なし（名前のみ） ───
  if (variant === 'name_only') {
    const initial = (vote.auth_display_name?.[0] || '?').toUpperCase()
    return (
      <div style={styles.card}>
        <div style={styles.title}>
          あなたの証言がこのプロの
          <br />
          信頼資産になります
        </div>
        <div style={styles.subtitle}>
          プロフィールカードに、あなたの名前を載せてもいいですか？
        </div>
        <div style={styles.previewRow}>
          <div style={styles.avatarInitial}>{initial}</div>
          <div style={styles.nameText}>
            {vote.auth_display_name}
          </div>
        </div>
        {errorText && <div style={styles.errorText}>{errorText}</div>}
        {rewardOptinBlock}
        <button
          style={{ ...styles.btnGold, opacity: submitting ? 0.6 : 1 }}
          onClick={handleYes}
          disabled={submitting}
        >
          {submitting ? '送信中...' : 'はい、載せてもOK'}
        </button>
        <button
          style={{ ...styles.btnGhost, opacity: submitting ? 0.6 : 1 }}
          onClick={handleNo}
          disabled={submitting}
        >
          今回は載せない
        </button>
        <div style={styles.footNote}>
          {changeNote}
        </div>
      </div>
    )
  }

  // 想定外バリアント（写真なし・名前なし）— 何もレンダーしない
  return null
}
