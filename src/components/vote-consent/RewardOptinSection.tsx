'use client'

/**
 * RewardOptinSection — 投票完了画面で「リワード/お知らせを受け取る」同意を取る UI
 *
 * Phase 1.5 で役割整理: VoteConsentSection に統合された 2 段階フローのうち、
 * Step A (写真同意) がスキップされるケースで Step B 単独の代替として表示される。
 *   - voter_professional_id !== null (プロ→プロ投票) — メールデフォルト
 *   - vote.auth_method === 'email_code' — メール
 *   - vote.auth_method === 'sms' — null 返却 (配信不可)
 *
 * UI: VoteConsentSection の Step B と同じ dark card デザインで視覚整合性を確保。
 *
 * 動作:
 *   YES → PATCH /api/votes/[id]/reward-optin (true) → onChange(true) → 親が配信トリガー
 *   NO  → 何もしない (DB DEFAULT FALSE) → onChange(false)
 *   YES/NO どちらも内部で submitted=true → return null (UI 自体を閉じる)
 *
 * 失敗しても submitted=true で次へ進む (UX 優先)。
 */

import { useState } from 'react'

interface Props {
  voteId: string
  proName: string
  /**
   * vote.auth_method。動的文言切替に使う:
   *   'line' → 「LINEで受け取る」
   *   'sms'  → null 返却 (チェックボックス自体非表示)
   *   それ以外 (email_code / google / pro→pro 等) → 「メールで受け取る」
   */
  authMethod?: string | null
  /** YES/NO どちらかが押されて処理完了した時に呼ばれる (引数は optin の真偽値) */
  onChange?: (optin: boolean) => void
}

// ─── 共通スタイル (VoteConsentSection と同じ dark card デザイン) ───
const styles = {
  card: {
    background: '#1A1A2E',
    borderRadius: 16,
    padding: '28px 24px',
    color: '#FAFAF7',
    fontFamily: 'Noto Serif JP, Noto Sans JP, serif',
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: 'center' as const,
    lineHeight: 1.55,
    marginBottom: 14,
    letterSpacing: '0.02em',
  } as React.CSSProperties,
  subtitle: {
    fontSize: 14,
    color: '#B5B5C3',
    textAlign: 'center' as const,
    lineHeight: 1.7,
    marginBottom: 22,
  } as React.CSSProperties,
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
  } as React.CSSProperties,
  errorText: {
    fontSize: 13,
    color: '#FCA5A5',
    textAlign: 'center' as const,
    marginBottom: 10,
  } as React.CSSProperties,
}

export default function RewardOptinSection({
  voteId,
  proName,
  authMethod,
  onChange,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const isLineAuth = authMethod === 'line'
  const isSmsAuth = authMethod === 'sms'
  const channelText = isLineAuth ? 'LINE' : 'メール'

  // SMS 認証は何も表示しない (親側 consentSkipped でも除外されるが防御的に)
  if (isSmsAuth) return null
  // 既に答えた → 閉じる (親は consentSkipped 側でリワード表示済み)
  if (submitted) return null

  const labelName = proName ? `${proName}さん` : 'プロの方'

  const handleYes = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/votes/${voteId}/reward-optin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ reward_optin: true }),
      })
      if (res.ok) {
        onChange?.(true)
      } else {
        console.warn('[RewardOptinSection] save returned non-ok:', res.status)
      }
    } catch (e) {
      // UX 優先で握り潰し — 画面は次へ進む
      console.error('[RewardOptinSection] save failed (non-blocking):', e)
    } finally {
      setSubmitting(false)
      setSubmitted(true)
    }
  }

  const handleNo = () => {
    if (submitting) return
    // PATCH なし — DB DEFAULT FALSE のまま
    onChange?.(false)
    setSubmitted(true)
  }

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
      <button
        style={{ ...styles.btnGold, opacity: submitting ? 0.6 : 1 }}
        onClick={handleYes}
        disabled={submitting}
      >
        {submitting ? '送信中...' : `${channelText}で受け取る`}
      </button>
      <button
        style={{ ...styles.btnGhost, opacity: submitting ? 0.6 : 1 }}
        onClick={handleNo}
        disabled={submitting}
      >
        受け取らない
      </button>
      <div style={styles.footNote}>※あとから配信停止できます</div>
    </div>
  )
}
