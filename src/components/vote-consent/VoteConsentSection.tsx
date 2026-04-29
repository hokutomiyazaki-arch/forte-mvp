'use client'

/**
 * VoteConsentSection — 投票完了画面の同意 UI (Phase 1.5: 2 段階フロー)
 *
 * Step A: 写真 / ニックネーム表示同意 (display_mode の決定)
 *           [表示OK] / [表示しない]
 *
 *           ↓ どちらでも進む
 *
 * Step B: お知らせ受け取り同意 (reward_optin)
 *           [{メール|LINE}で受け取る] / [受け取らない]
 *
 *           ↓ どちらでも進む
 *
 *         onComplete() → 親側 consentDone=true → リワード開示
 *
 * バリアント:
 *   🅰 プロ投票 (voter_professional_id 有り)  → UI スキップ (return null)
 *   🅱 写真あり (Google/LINE)                  → photo Step A → Step B
 *   🅲 写真なし (sms_fallback OLD votes 等)    → name_only Step A → Step B
 *
 * 動的文言:
 *   - vote.auth_method === 'line' → 「LINE で受け取る」
 *   - vote.auth_method === 'sms'   → Step B をスキップ (即 onComplete)
 *   - その他 (google / null など)   → 「メールで受け取る」
 *
 * Step B 失敗時は console.warn のみで握り潰し、onComplete() で次へ進む。
 * (UI 体験優先 — 同意失敗で全体止めると最悪の UX)
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
  /** プロ名。Step B 文言と footer の「{pro.name}さんに連絡して変更・削除できます」で使用。 */
  proName?: string
  /** Step A・B 両方完了した時に呼ばれる (リワード解放のゲート) */
  onComplete?: () => void
  /**
   * Step B で「受け取る」が押されて保存成功した時に true で呼ばれる。
   * 親側 (vote-confirmed) で /api/deliver-reward を fire-and-forget でトリガー。
   */
  onRewardOptinChange?: (optin: boolean) => void
}

type Variant = 'photo' | 'name_only' | 'skip'
type Step = 'photo' | 'notification' | 'done'

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

// ─── 共通スタイル (dark card) ───
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

export default function VoteConsentSection({
  vote,
  proName,
  onComplete,
  onRewardOptinChange,
}: Props) {
  ensureKeyframes()

  const variant = determineVariant(vote)
  const [step, setStep] = useState<Step>('photo')
  const [submitting, setSubmitting] = useState(false)
  const [errorText, setErrorText] = useState('')

  // 認証方法による文言切替
  const isLineAuth = vote.auth_method === 'line'
  const isSmsAuth = vote.auth_method === 'sms'
  const channelText = isLineAuth ? 'LINE' : 'メール'

  const labelName = proName ? `${proName}さん` : 'プロの方'

  // マイカード機能は未実装のため、変更・削除導線はプロへの直接連絡に誘導する。
  const changeNote = proName
    ? `※あとから${proName}さんに連絡して変更・削除できます`
    : '※あとからプロの方に連絡して変更・削除できます'

  // ケース🅰 プロ投票 — 何もレンダーしない (本来は親側 consentSkipped で除外されるが防御)
  if (variant === 'skip') return null

  // 完了 — 親側で consentDone=true となり unmount される想定
  if (step === 'done') return null

  // ─── Step A: 写真同意ハンドラ ───
  const advanceAfterPhoto = () => {
    // SMS 認証は Step B スキップ (本来 vote-confirmed で除外されるが防御)
    if (isSmsAuth) {
      setStep('done')
      onComplete?.()
    } else {
      setStep('notification')
    }
  }

  const handlePhotoYes = async () => {
    if (submitting) return
    setSubmitting(true)
    setErrorText('')
    try {
      const mode = variant === 'photo' ? 'photo' : 'nickname_only'
      await updateDisplayMode(vote.id, mode)
      advanceAfterPhoto()
    } catch {
      setErrorText('更新に失敗しました。もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePhotoNo = async () => {
    if (submitting) return
    setSubmitting(true)
    setErrorText('')
    try {
      await updateDisplayMode(vote.id, 'hidden')
      advanceAfterPhoto()
    } catch {
      setErrorText('更新に失敗しました。もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Step B: お知らせ受け取りハンドラ ───
  const closeAndComplete = () => {
    setStep('done')
    onComplete?.()
  }

  const handleNotifYes = async () => {
    if (submitting) return
    setSubmitting(true)
    setErrorText('')
    try {
      const res = await fetch(`/api/votes/${vote.id}/reward-optin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ reward_optin: true }),
      })
      if (res.ok) {
        onRewardOptinChange?.(true)
      } else {
        console.warn('[VoteConsentSection] reward-optin save returned non-ok:', res.status)
      }
    } catch (e) {
      // UX 優先で握り潰し — 配信されないが画面は次へ進む
      console.error('[VoteConsentSection] reward-optin save failed (non-blocking):', e)
    } finally {
      setSubmitting(false)
      closeAndComplete()
    }
  }

  const handleNotifNo = () => {
    if (submitting) return
    // PATCH なし — DB DEFAULT FALSE のまま
    closeAndComplete()
  }

  // ═════════════════════════════════════════
  //  Step A render: 写真 (photo variant)
  // ═════════════════════════════════════════
  if (step === 'photo' && variant === 'photo') {
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
        <button
          style={{ ...styles.btnGold, opacity: submitting ? 0.6 : 1 }}
          onClick={handlePhotoYes}
          disabled={submitting}
        >
          {submitting ? '送信中...' : '表示OK'}
        </button>
        <button
          style={{ ...styles.btnGhost, opacity: submitting ? 0.6 : 1 }}
          onClick={handlePhotoNo}
          disabled={submitting}
        >
          表示しない
        </button>
        <div style={styles.footNote}>{changeNote}</div>
      </div>
    )
  }

  // ═════════════════════════════════════════
  //  Step A render: 名前のみ (name_only variant)
  // ═════════════════════════════════════════
  if (step === 'photo' && variant === 'name_only') {
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
          <div style={styles.nameText}>{vote.auth_display_name}</div>
        </div>
        {errorText && <div style={styles.errorText}>{errorText}</div>}
        <button
          style={{ ...styles.btnGold, opacity: submitting ? 0.6 : 1 }}
          onClick={handlePhotoYes}
          disabled={submitting}
        >
          {submitting ? '送信中...' : 'はい、載せてもOK'}
        </button>
        <button
          style={{ ...styles.btnGhost, opacity: submitting ? 0.6 : 1 }}
          onClick={handlePhotoNo}
          disabled={submitting}
        >
          今回は載せない
        </button>
        <div style={styles.footNote}>{changeNote}</div>
      </div>
    )
  }

  // ═════════════════════════════════════════
  //  Step B render: お知らせ受け取り
  // ═════════════════════════════════════════
  if (step === 'notification') {
    return (
      <div style={styles.card}>
        <div style={styles.title}>お知らせを受け取りますか？</div>
        <div style={styles.subtitle}>
          {labelName}や REALPROOF からの
          <br />
          リワード・お知らせ・新機能情報を
          <br />
          {channelText}でお届けします
        </div>
        {errorText && <div style={styles.errorText}>{errorText}</div>}
        <button
          style={{ ...styles.btnGold, opacity: submitting ? 0.6 : 1 }}
          onClick={handleNotifYes}
          disabled={submitting}
        >
          {submitting ? '送信中...' : `${channelText}で受け取る`}
        </button>
        <button
          style={{ ...styles.btnGhost, opacity: submitting ? 0.6 : 1 }}
          onClick={handleNotifNo}
          disabled={submitting}
        >
          受け取らない
        </button>
        <div style={styles.footNote}>※あとから配信停止できます</div>
      </div>
    )
  }

  // 想定外バリアント — 何もレンダーしない
  return null
}
