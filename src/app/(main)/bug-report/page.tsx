'use client'

import { useState, useRef } from 'react'

export default function BugReportPage() {
  const [screen, setScreen] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    // 5MB制限
    if (f.size > 5 * 1024 * 1024) {
      setError('ファイルサイズは5MB以下にしてください')
      return
    }
    setFile(f)
    setError('')
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result as string)
    reader.readAsDataURL(f)
  }

  const removeFile = () => {
    setFile(null)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) {
      setError('内容を入力してください')
      return
    }

    setSending(true)
    setError('')

    try {
      // スクリーンショットがあれば専用エンドポイントでアップロード（認証不要）
      let imageUrl: string | null = null
      if (file) {
        const formData = new FormData()
        formData.append('file', file)

        const uploadRes = await fetch('/api/bug-report/upload', {
          method: 'POST',
          body: formData,
        })

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json()
          imageUrl = uploadData.publicUrl || null
        }
        // アップロード失敗してもレポート自体は送信する
      }

      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screen: screen || null,
          description,
          email: email || null,
          image_url: imageUrl,
          user_agent: navigator.userAgent,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '送信に失敗しました')
        return
      }

      setDone(true)
    } catch {
      setError('送信に失敗しました。しばらく経ってからお試しください。')
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          <div className="text-4xl mb-4">✅</div>
          <p className="text-lg font-bold text-[#1A1A2E] mb-2">ご報告ありがとうございました。</p>
          <p className="text-sm text-gray-500">※ 個別のご質問への回答は行っておりません。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">不具合・エラーの報告</h1>
      <p className="text-sm text-gray-600 mb-8">
        REALPROOFをご利用いただきありがとうございます。不具合やエラーを発見された場合は、以下のフォームからご報告ください。
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* どの画面で */}
        <div>
          <label className="block text-sm font-medium text-[#1A1A2E] mb-1">
            どの画面で発生しましたか？
          </label>
          <input
            type="text"
            name="screen"
            value={screen}
            onChange={(e) => setScreen(e.target.value)}
            placeholder="URLまたは画面名（例: プロフィール設定画面）"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4A35A] focus:border-transparent"
          />
        </div>

        {/* 何が起きたか */}
        <div>
          <label className="block text-sm font-medium text-[#1A1A2E] mb-1">
            何が起きましたか？ <span className="text-red-500">*</span>
          </label>
          <textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={'「どの画面で」「何をしたら」「どうなったか」を教えていただけると助かります'}
            rows={5}
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4A35A] focus:border-transparent resize-y"
          />
        </div>

        {/* スクリーンショット */}
        <div>
          <label className="block text-sm font-medium text-[#1A1A2E] mb-1">
            スクリーンショット（任意）
          </label>
          {preview ? (
            <div className="relative inline-block">
              <img
                src={preview}
                alt="プレビュー"
                className="max-h-48 rounded-lg border border-gray-200"
              />
              <button
                type="button"
                onClick={removeFile}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow"
              >
                ×
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#C4A35A] transition">
              <div className="text-center">
                <span className="text-gray-400 text-sm">タップして画像を選択</span>
                <p className="text-gray-300 text-xs mt-1">PNG, JPG（5MB以下）</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* メールアドレス */}
        <div>
          <label className="block text-sm font-medium text-[#1A1A2E] mb-1">
            メールアドレス（任意）
          </label>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="追加確認が必要な場合のみご連絡いたします"
            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4A35A] focus:border-transparent"
          />
        </div>

        {/* エラー表示 */}
        {error && (
          <p className="text-red-500 text-sm">{error}</p>
        )}

        {/* 送信ボタン */}
        <button
          type="submit"
          disabled={sending}
          className="w-full bg-[#1A1A2E] text-white py-3 rounded-lg font-bold text-sm hover:opacity-90 transition disabled:opacity-50"
        >
          {sending ? '送信中...' : '報告する'}
        </button>
      </form>

      <p className="text-xs text-gray-400 mt-6 text-center">
        ※ 個別のご質問への回答は行っておりません。
      </p>
    </div>
  )
}
