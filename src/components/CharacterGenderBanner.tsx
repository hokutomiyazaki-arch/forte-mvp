'use client'

/**
 * CharacterGenderBanner — character_gender 未選択プロ向けの告知バナー(2026-08-05・CEO指示)
 *
 * 表示条件 (親側で制御):
 *   - pro が存在する
 *   - pro.character_gender が null(未選択)
 *
 * 2026-08-06(CEO指示)で作り直した点:
 *   - 見た目を admin から配信するお知らせ(AnnouncementBanner)と同じ帯に統一
 *   - **✕ で消せる**ようにした(閉じたことは localStorage に残る)
 *   - CTA を「同じページへのリンク」から onOpenProfileEdit(直接開く)に変更。
 *     リンク方式は2回目以降のタップで何も起きなかった(InlineNoticeBanner のコメント参照)。
 *
 * 何かを選んで保存すれば(neutral含む) character_gender が null でなくなり自動的に消える。
 */

import InlineNoticeBanner from './InlineNoticeBanner'

export default function CharacterGenderBanner({ onOpenProfileEdit }: { onOpenProfileEdit?: () => void }) {
  return (
    <InlineNoticeBanner
      id="character_gender_2026_08"
      type="info"
      title="タイプ分析のキャラクターが新しくなりました"
      body="あなたのキャラクターの見た目（男性/女性/スタンダード）を選んでください。"
      actionLabel="プロフィール編集で選ぶ"
      onAction={onOpenProfileEdit}
      href={onOpenProfileEdit ? undefined : '/dashboard?tab=profile&edit=true'}
    />
  )
}
