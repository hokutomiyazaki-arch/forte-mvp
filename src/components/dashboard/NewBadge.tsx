'use client'

import { useEffect, useState } from 'react'
import { isFeatureSeen, NEW_SEEN_EVENT } from '@/lib/new-feature-seen'

/**
 * 新機能の目印（CEO指示 2026-08-06）。
 *
 * 「新機能が追加され続けていること自体が、いま一番ユーザーの興味をつなぎとめるポイント」
 * （CLAUDE.md の恒久ルール）。告知メールを読んでいない人にも、画面の中で気づいてもらう。
 *
 * 運用（CEO恒久ルール 2026-08-08で更新）:
 * - 新機能を追加したら毎回、そのメニュー項目に付ける
 * - `id` を渡すと「一度そのページを確認したら消える」（対象ページに <MarkFeatureSeen id> を置く）
 * - 保険として NEW_UNTIL の日付上限も併用（出しっぱなしにしない・意味の摩耗防止）
 */

/** この日（JST）を過ぎたら New を出さない。新機能を出したら都度更新する。 */
const NEW_UNTIL = '2026-09-08'

function isStillNew(): boolean {
  // JST基準の日付で比較する（UTCで切るとJSTの夜に1日早く消える）
  const todayJst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  return todayJst <= NEW_UNTIL
}

export default function NewBadge({ label = 'New', id }: { label?: string; id?: string }) {
  // 既読判定はマウント後に行う（SSRとのhydration不一致を避ける）。
  // CEO報告(2026-08-08)「開いてもnewが消えない」対応: 同一ページ滞在中に既読になった場合も
  // 反映されるよう、markFeatureSeen が投げるイベントを購読して即時再評価する。
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!id) return
    setSeen(isFeatureSeen(id))
    const onSeen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined
      if (!detail?.id || detail.id === id) setSeen(isFeatureSeen(id))
    }
    window.addEventListener(NEW_SEEN_EVENT, onSeen)
    return () => window.removeEventListener(NEW_SEEN_EVENT, onSeen)
  }, [id])
  if (!isStillNew()) return null
  if (id && seen) return null
  return (
    <span
      style={{
        display: 'inline-block',
        marginLeft: 6,
        padding: '1px 6px',
        borderRadius: 4,
        background: '#C4A35A',
        color: '#fff',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}
