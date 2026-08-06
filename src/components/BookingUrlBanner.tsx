'use client'

/**
 * BookingUrlBanner — 予約・連絡先が未設定のプロ向けの促進バナー
 *
 * 表示条件 (親側で制御):
 *   - pro.setup_completed === true
 *   - booking_url / contact_email / phone_number がいずれも未設定
 *   - voteCount > 0 (1 票も入ってないプロには出さない)
 *
 * 2026-08-06(CEO指示): 通知の見た目を admin のお知らせバナーに統一し、✕ で消せるようにした。
 * CTA は同じページ内の操作なので onOpenProfileEdit(直接開く)を使う
 * （同一ページへのリンクは2回目以降のタップで反応しなかった。InlineNoticeBanner のコメント参照）。
 */

import InlineNoticeBanner from './InlineNoticeBanner'

interface Props {
  proName: string
  voteCount: number
  onOpenProfileEdit?: () => void
}

export default function BookingUrlBanner({ proName, voteCount, onOpenProfileEdit }: Props) {
  const who = proName ? `${proName}さん` : 'あなた'
  return (
    <InlineNoticeBanner
      id="booking_url_unset"
      type="warning"
      title="予約・連絡先が未設定です"
      body={
        `${who}を応援したお客さんは${voteCount}人。「予約したい」と思った時の連絡先がプロフィールにありません。\n` +
        'URL・メールアドレス・電話番号のいずれか1つでOKです。'
      }
      actionLabel="予約・連絡先を設定する"
      onAction={onOpenProfileEdit}
      href={onOpenProfileEdit ? undefined : '/dashboard?tab=profile&edit=true'}
    />
  )
}
