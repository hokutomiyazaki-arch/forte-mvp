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
}: {
  content: string
  className?: string
  strikethrough?: boolean
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

  // テキスト部分だけを取得（ボタンラベル用）
  const textParts = parts.filter(p => p.type === 'text').map(p => p.value.trim()).filter(Boolean)

  return (
    <div className={className}>
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
        // URL → ボタンに変換
        const label = textParts.length > 0 ? textParts[0] : 'リンクを開く'
        return (
          <a
            key={i}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-block mt-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              strikethrough
                ? 'bg-gray-200 text-gray-400 pointer-events-none line-through'
                : 'bg-[#C4A35A] text-white hover:bg-[#b3923f]'
            }`}
          >
            {label}
          </a>
        )
      })}
    </div>
  )
}
