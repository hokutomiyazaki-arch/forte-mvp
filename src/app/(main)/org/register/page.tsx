'use client'
import { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { db } from '@/lib/db'

const ORG_TYPES = [
  { key: 'store', label: '店舗', desc: '整体院・ヨガスタジオ・サロン等', icon: '🏪' },
  { key: 'credential', label: '資格発行団体', desc: '認定資格・修了証を発行する団体', icon: '🎓' },
  { key: 'education', label: '教育団体', desc: 'スクール・研修・ワークショップ等', icon: '📚' },
]

export default function OrgRegisterPage() {
  const [step, setStep] = useState<'type' | 'form'>('type')
  const [orgType, setOrgType] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [bookingUrl, setBookingUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { user: clerkUser } = useUser()
  const authUser = clerkUser ? { id: clerkUser.id } : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const user = authUser
      if (!user) {
        window.location.href = '/login?role=pro'
        return
      }

      const { data, error: insertError } = await db.insert('organizations', {
        owner_id: user.id,
        type: orgType,
        name,
        location: location || null,
        description: description || null,
        website_url: websiteUrl || null,
        booking_url: bookingUrl || null,
      }, { select: 'id', maybeSingle: true })

      if (insertError) throw insertError

      // オーナー自身がプロの場合、org_membersに自分を追加
      const { data: proData } = await db.select('professionals', {
        select: 'id',
        eq: { user_id: user.id },
        maybeSingle: true,
      })

      if (proData && data?.id) {
        await db.insert('org_members', {
          organization_id: data.id,
          professional_id: proData.id,
          is_owner: true,
          status: 'active',
          accepted_at: new Date().toISOString(),
        })
      }

      // 団体ダッシュボードへリダイレクト
      window.location.href = '/org/dashboard'
    } catch (err: any) {
      setError(err.message || '登録に失敗しました')
    }
    setSubmitting(false)
  }

  // Step 1: 団体タイプ選択
  if (step === 'type') {
    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2 text-center">団体を登録</h1>
        <p className="text-sm text-gray-500 mb-8 text-center">
          団体の種類を選んでください
        </p>
        <div className="space-y-3">
          {ORG_TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => { setOrgType(t.key); setStep('form') }}
              className="w-full p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition text-left flex items-center gap-4 border border-gray-100"
            >
              <span className="text-3xl">{t.icon}</span>
              <div>
                <div className="font-bold text-[#1A1A2E]">{t.label}</div>
                <div className="text-sm text-gray-500">{t.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Step 2: 団体情報入力
  const typeLabel = ORG_TYPES.find(t => t.key === orgType)?.label || ''

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <button
        onClick={() => setStep('type')}
        className="text-sm text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-1"
      >
        ← 種類を変更
      </button>

      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-1">{typeLabel}を登録</h1>
      <p className="text-sm text-gray-500 mb-8">基本情報を入力してください</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            団体名 <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#C4A35A] outline-none"
            placeholder={orgType === 'store' ? '例: ○○整体院' : '例: △△認定協会'}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">所在地</label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#C4A35A] outline-none"
            placeholder="例: 東京都渋谷区神南1-2-3"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#C4A35A] outline-none resize-none"
            placeholder="団体の紹介文（公開ページに表示されます）"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ウェブサイト</label>
          <input
            type="url"
            value={websiteUrl}
            onChange={e => setWebsiteUrl(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#C4A35A] outline-none"
            placeholder="https://example.com"
          />
        </div>

        {orgType === 'store' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">予約URL</label>
            <input
              type="url"
              value={bookingUrl}
              onChange={e => setBookingUrl(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#C4A35A] outline-none"
              placeholder="https://booking.example.com"
            />
          </div>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-xl hover:bg-[#2a2a4e] transition disabled:opacity-50"
        >
          {submitting ? '登録中...' : '団体を登録する'}
        </button>
      </form>
    </div>
  )
}
