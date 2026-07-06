'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const ERROR_MESSAGES: Record<string, string> = {
  line_no_email:
    'LINEからメールアドレスを取得できませんでした。通常のSafari / Chromeで realproof.jp を開き、メールアドレスでログインしてください。',
  line_no_account:
    'このLINEに紐づくアカウントが見つかりませんでした。普段お使いのメールアドレスやGoogleで、通常のSafari/Chromeからログインしてください。',
  line_failed:
    'LINEログインに失敗しました。もう一度お試しいただくか、通常ブラウザでお開きください。',
}

function LineSignInInner() {
  const error = useSearchParams().get('error')
  const errorMessage = error ? ERROR_MESSAGES[error] : null

  const handleLineLogin = () => {
    window.location.href = '/api/auth/line/start'
  }

  return (
    <div className="w-full max-w-sm mb-4">
      {errorMessage && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700 leading-relaxed">{errorMessage}</p>
        </div>
      )}
      <button
        type="button"
        onClick={handleLineLogin}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06C755] py-3 text-sm font-bold text-white hover:opacity-90 transition-opacity"
      >
        LINEでログイン
      </button>
    </div>
  )
}

export default function LineSignInSection() {
  return (
    <Suspense fallback={null}>
      <LineSignInInner />
    </Suspense>
  )
}
