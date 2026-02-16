'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function ErrorContent() {
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')

  const messages: Record<string, { title: string; desc: string }> = {
    'missing-token': {
      title: '無効なリンクです',
      desc: '確認リンクが正しくありません。メールのリンクをもう一度クリックしてください。',
    },
    'invalid-token': {
      title: '既に確認済みか、無効なリンクです',
      desc: 'このリンクは既に使用されたか、存在しません。',
    },
    'expired': {
      title: 'リンクの有効期限が切れています',
      desc: '確認リンクの有効期限（24時間）が過ぎました。お手数ですが、もう一度プルーフを送信してください。',
    },
  }

  const msg = messages[reason || ''] || messages['invalid-token']

  return (
    <div className="max-w-md mx-auto text-center py-16 px-4">
      <div className="text-5xl mb-4">⚠️</div>
      <h1 className="text-xl font-bold text-[#1A1A2E] mb-2">{msg.title}</h1>
      <p className="text-gray-500 mb-6">{msg.desc}</p>
      <a
        href="/explore"
        className="inline-block px-6 py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition"
      >
        トップページへ
      </a>
    </div>
  )
}

export default function VoteErrorPage() {
  return (
    <Suspense fallback={<div className="text-center py-16">読み込み中...</div>}>
      <ErrorContent />
    </Suspense>
  )
}
