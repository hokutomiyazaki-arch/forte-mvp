import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '設定を保存しました | REALPROOF',
  description: 'お知らせ配信の設定を保存しました。',
  robots: 'noindex, nofollow',
}

export default function OptinSuccessPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <div className="mb-12">
          <span className="text-2xl font-bold tracking-[0.2em] text-[#1A1A2E]">
            REALPROOF
          </span>
        </div>

        <div className="mb-8 flex justify-center">
          <div className="w-16 h-16 rounded-full bg-[#C4A35A] flex items-center justify-center">
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
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-4">
          設定を保存しました
        </h1>

        <p className="text-[#1A1A2E] leading-relaxed mb-3">
          これで、あなたが応援したプロからのお知らせが
          <br />
          届くようになります。
        </p>

        <p className="text-sm text-gray-500 mb-12">
          いつでも配信停止できます。
        </p>

        <a
          href="/search"
          className="inline-block bg-[#C4A35A] text-white px-8 py-3.5 rounded-lg font-bold hover:opacity-90 transition-opacity"
        >
          プロを検索する
        </a>

        <p className="mt-16 text-sm italic text-gray-400">
          強みが、あなたを定義する。
        </p>
      </div>
    </div>
  )
}
