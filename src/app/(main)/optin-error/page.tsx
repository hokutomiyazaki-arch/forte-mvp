import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'エラー | REALPROOF',
  description: '',
  robots: 'noindex, nofollow',
}

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  invalid_link: {
    title: 'リンクが正しくありません',
    description:
      'このリンクはご利用いただけないようです。\nメール内のボタンから再度お試しください。',
  },
  invalid_token: {
    title: 'リンクの有効性を確認できませんでした',
    description:
      'お手数ですが、メール内のリンクを\nもう一度お試しください。',
  },
  db_error: {
    title: '一時的にエラーが発生しました',
    description: 'しばらく時間を置いてから\nもう一度お試しください。',
  },
  server_error: {
    title: 'エラーが発生しました',
    description:
      '申し訳ございません。\nしばらく時間を置いてから\nもう一度お試しください。',
  },
}

const FALLBACK = {
  title: 'エラーが発生しました',
  description: '申し訳ございません。\nもう一度お試しください。',
}

export default function OptinErrorPage({
  searchParams,
}: {
  searchParams: { reason?: string }
}) {
  const reason = searchParams?.reason ?? ''
  const message = ERROR_MESSAGES[reason] ?? FALLBACK

  return (
    <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <div className="mb-12">
          <span className="text-2xl font-bold tracking-[0.2em] text-[#1A1A2E]">
            REALPROOF
          </span>
        </div>

        <div className="mb-8 flex justify-center">
          <div className="w-16 h-16 rounded-full bg-[#999999] flex items-center justify-center">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-4">
          {message.title}
        </h1>

        <p className="text-[#1A1A2E] leading-relaxed mb-12 whitespace-pre-line">
          {message.description}
        </p>

        <a
          href="https://realproof.jp"
          className="inline-block bg-[#C4A35A] text-white px-8 py-3.5 rounded-lg font-bold hover:opacity-90 transition-opacity"
        >
          REALPROOF を見る
        </a>

        <p className="mt-16 text-sm italic text-gray-400">
          強みが、あなたを定義する。
        </p>
      </div>
    </div>
  )
}
