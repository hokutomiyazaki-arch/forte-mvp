'use client'

/**
 * 新機能の目印（CEO指示 2026-08-06）。
 *
 * 「新機能が追加され続けていること自体が、いま一番ユーザーの興味をつなぎとめるポイント」
 * （CLAUDE.md の恒久ルール）。告知メールを読んでいない人にも、画面の中で気づいてもらう。
 *
 * 運用: **出しっぱなしにしない**。付けた日を NEW_UNTIL に書き、その日を過ぎたら
 * 自動で消える。ずっと New が付いていると、New という表示自体が意味を失うため。
 */

/** この日（JST）を過ぎたら New を出さない。新機能を出したら都度更新する。 */
const NEW_UNTIL = '2026-09-06'

function isStillNew(): boolean {
  // JST基準の日付で比較する（UTCで切るとJSTの夜に1日早く消える）
  const todayJst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  return todayJst <= NEW_UNTIL
}

export default function NewBadge({ label = 'New' }: { label?: string }) {
  if (!isStillNew()) return null
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
