'use client'

/**
 * RewardContent: リワードのcontentテキスト内のURLを検出し、
 * クリック可能なボタンに変換して表示するコンポーネント。
 * URLが含まれない場合はテキストをそのまま表示。
 */

const URL_REGEX = /https?:\/\/[^\s]+/g

export default function RewardContent({
  content,
  className,
  strikethrough = false,
  linkLabel,
}: {
  content: string
  className?: string
  strikethrough?: boolean
  linkLabel?: string
}) {
  const urls = content.match(URL_REGEX)

  if (!urls || urls.length === 0) {
    return <p className={className}>{content}</p>
  }

  // URLとテキスト部分を分割して描画
  const parts: { type: 'text' | 'url'; value: string }[] = []
  let remaining = content
  for (const url of urls) {
    const idx = remaining.indexOf(url)
    if (idx > 0) {
      parts.push({ type: 'text', value: remaining.slice(0, idx) })
    }
    parts.push({ type: 'url', value: url })
    remaining = remaining.slice(idx + url.length)
  }
  if (remaining) {
    parts.push({ type: 'text', value: remaining })
  }

  return (
    <div className={`${className || ''} flex flex-col items-center gap-3 w-full`}>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          const trimmed = part.value.trim()
          if (!trimmed) return null
          return (
            <p key={i} className={strikethrough ? 'line-through' : ''}>
              {trimmed}
            </p>
          )
        }
        // URL → ゴールドボタンに変換（ボタンラベルは常に「リンクを開く」固定で
        // 上の説明文と重複しないようにする。ラベルにドメインも併記したい場合は
        // 下のコメントアウト行参照）
        // const domain = (() => { try { return new URL(part.value).hostname.replace(/^www\./,'') } catch { return '' } })()
        return (
          <a
            key={i}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center justify-center gap-2 w-full min-h-[48px] px-6 py-3 rounded-lg text-base font-bold transition-colors ${
              strikethrough
                ? 'bg-gray-200 text-gray-400 pointer-events-none line-through'
                : 'bg-[#C4A35A] text-white hover:bg-[#b3923f]'
            }`}
          >
            {linkLabel ?? 'リンクを開く →'}
          </a>
        )
      })}
    </div>
  )
}
