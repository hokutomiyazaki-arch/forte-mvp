'use client'

/**
 * VoteConsentSection — 投票完了画面の同意 UI（Phase 2）
 *
 * 4 ケースを内部で分岐:
 *   🅰 プロ投票 (voter_professional_id 有り)  → UI スキップ（何もレンダーしない）
 *   🅱 Clerk + 写真有り                         → YES/NO 2 択、YES=photo
 *   🅲 Clerk + 写真無し（名前のみ）              → YES/NO 2 択、YES=nickname_only
 *   🅳 SMS/Fallback/email_code（名前無し）      → ニックネーム入力 or スキップ
 *
 * データ保存は仮実装（supabase client 直呼び）。
 * Phase 3 で PATCH /api/votes/[id]/display-mode に差し替える。
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
}

type Variant = 'photo' | 'name_only' | 'nickname_input' | 'skip'

function determineVariant(vote: VoteConsentVote): Variant {
  if (vote.voter_professional_id) return 'skip'
  if (vote.client_photo_url) return 'photo'
  if (vote.auth_display_name) return 'name_only'
  return 'nickname_input'
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

export default function VoteConsentSection({ vote }: Props) {
  ensureKeyframes()

  const variant = determineVariant(vote)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [nickname, setNickname] = useState('')

  // ケース🅰 プロ投票 — 何もレンダーしない
  if (variant === 'skip') return null

  // 送信成功後の共通表示
  if (submitted) {
    return (
      <div style={styles.successCard}>
        <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
          ありがとうございました
        </p>
        <p style={{ fontSize: 13, color: '#B5B5C3', lineHeight: 1.6 }}>
          あとからマイカードで変更できます。
        </p>
      </div>
    )
  }

  // ─── 共通アクション: YES ボタン（photo / name_only） ───
  const handleYes = async () => {
    if (submitting) return
    setSubmitting(true)
    setErrorText('')
    try {
      const mode = variant === 'photo' ? 'photo' : 'nickname_only'
      await updateDisplayMode(vote.id, mode)
      setSubmitted(true)
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
      await updateDisplayMode(vote.id, 'hidden')
      setSubmitted(true)
    } catch {
      setErrorText('更新に失敗しました。もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── ケース🅳 ニックネーム入力送信 ───
  const handleNicknameSubmit = async () => {
    if (submitting) return
    const trimmed = nickname.trim()
    if (!trimmed) {
      setErrorText('ニックネームを入力してください')
      return
    }
    if (trimmed.length > 20) {
      setErrorText('20文字以内で入力してください')
      return
    }
    setSubmitting(true)
    setErrorText('')
    try {
      await updateDisplayMode(vote.id, 'nickname_only', trimmed)
      setSubmitted(true)
    } catch {
      setErrorText('更新に失敗しました。もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── ケース🅱 Clerk + 写真あり ───
  if (variant === 'photo') {
    return (
      <div style={styles.card}>
        <div style={styles.title}>
          あなたの証言がこのプロの
          <br />
          信頼資産になります
        </div>
        <div style={styles.subtitle}>
          プロフィールカードに、あなたの写真と名前を載せてもいいですか？
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
          <div style={styles.nameText}>
            {vote.auth_display_name || '匿名'}
          </div>
        </div>
        {errorText && <div style={styles.errorText}>{errorText}</div>}
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
          ※あとからマイカードで変更できます
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
          ※あとからマイカードで変更できます
        </div>
      </div>
    )
  }

  // ─── ケース🅳 SMS / email_code — ニックネーム入力 or スキップ ───
  return (
    <div style={styles.card}>
      <div style={styles.title}>
        あなたの証言がこのプロの
        <br />
        信頼資産になります
      </div>
      <div style={styles.subtitle}>
        Voice にニックネームを添えますか？
      </div>
      <input
        type="text"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="ニックネーム"
        maxLength={40}
        style={styles.input}
        disabled={submitting}
      />
      <div style={styles.inputHint}>（20文字まで、後で変更可）</div>
      {errorText && <div style={styles.errorText}>{errorText}</div>}
      <button
        style={{ ...styles.btnGold, opacity: submitting ? 0.6 : 1 }}
        onClick={handleNicknameSubmit}
        disabled={submitting}
      >
        {submitting ? '送信中...' : 'この名前で添える'}
      </button>
      <button
        style={{ ...styles.btnGhost, opacity: submitting ? 0.6 : 1 }}
        onClick={handleNo}
        disabled={submitting}
      >
        名前なしで送る
      </button>
      <div style={styles.footNote}>
        ※あとからマイカードで変更できます
      </div>
    </div>
  )
}
