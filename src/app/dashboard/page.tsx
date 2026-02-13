'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { FORTE_OPTIONS } from '@/lib/types'
import type { Professional, VoteSummary } from '@/lib/types'
import { getForteLabel } from '@/lib/types'
import ForteChart from '@/components/ForteChart'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [pro, setPro] = useState<Professional | null>(null)
  const [votes, setVotes] = useState<VoteSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'card' | 'edit' | 'qr'>('card')
  const [qrDataUrl, setQrDataUrl] = useState<string>('')

  const [form, setForm] = useState({
    name: '',
    title: '',
    location: '',
    years_experience: '',
    bio: '',
    booking_url: '',
    coupon_text: '',
    specialties: '',
    selected_fortes: [] as string[],
    custom_forte_1: '',
    custom_forte_2: '',
  })
  const [uploading, setUploading] = useState(false)

  const loadData = useCallback(async (userId: string) => {
    const { data: proData } = await supabase
      .from('professionals')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (proData) {
      setPro(proData)
      setForm({
        name: proData.name || '',
        title: proData.title || '',
        location: proData.location || '',
        years_experience: proData.years_experience?.toString() || '',
        bio: proData.bio || '',
        booking_url: proData.booking_url || '',
        coupon_text: proData.coupon_text || '',
        specialties: proData.specialties?.join(', ') || '',
        selected_fortes: proData.selected_fortes || [],
        custom_forte_1: proData.custom_forte_1 || '',
        custom_forte_2: proData.custom_forte_2 || '',
      })

      const { data: voteData } = await supabase
        .from('vote_summary')
        .select('*')
        .eq('professional_id', proData.id)
      setVotes(voteData || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser(session.user)
      await loadData(session.user.id)
    }
    init()
  }, [router, loadData])

  useEffect(() => {
    if (!pro) return
    const url = `${window.location.origin}/vote/${pro.id}`
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(url, {
        width: 400,
        margin: 2,
        color: { dark: '#1A1A2E', light: '#FFFFFF' },
      }).then(setQrDataUrl)
    })
  }, [pro])

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${user.id}/avatar.${ext}`

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (!error) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      if (pro) {
        await supabase
          .from('professionals')
          .update({ photo_url: data.publicUrl })
          .eq('id', pro.id)
        await loadData(user.id)
      }
    }
    setUploading(false)
  }

  const toggleForte = (key: string) => {
    setForm(f => {
      const current = f.selected_fortes
      if (current.includes(key)) {
        return { ...f, selected_fortes: current.filter(k => k !== key) }
      }
      if (current.length >= 5) return f
      return { ...f, selected_fortes: [...current, key] }
    })
  }

  const handleSave = async () => {
    if (!user || form.selected_fortes.length < 3) return
    setSaving(true)

    const payload = {
      user_id: user.id,
      name: form.name,
      title: form.title,
      location: form.location || null,
      years_experience: form.years_experience ? parseInt(form.years_experience) : null,
      bio: form.bio || null,
      booking_url: form.booking_url || null,
      coupon_text: form.coupon_text || null,
      specialties: form.specialties ? form.specialties.split(',').map(s => s.trim()).filter(Boolean) : null,
      selected_fortes: form.selected_fortes,
      custom_forte_1: form.custom_forte_1 || null,
      custom_forte_2: form.custom_forte_2 || null,
      is_founding_member: true,
    }

    if (pro) {
      await supabase.from('professionals').update(payload).eq('id', pro.id)
    } else {
      await supabase.from('professionals').insert(payload)
    }

    await loadData(user.id)
    setSaving(false)
    setActiveTab('card')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-400">読み込み中...</div>
      </main>
    )
  }

  if (!pro) {
    return (
      <main className="min-h-screen bg-forte-cream py-8 px-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold tracking-wider text-forte-dark">FORTE</h1>
            <p className="text-forte-gold text-sm italic">FORTEカードを作成しましょう</p>
          </div>
          <div className="bg-white rounded-3xl shadow-lg p-8">
            <h2 className="text-xl font-bold text-forte-dark mb-6">プロフィール作成</h2>
            <ProfileForm
              form={form}
              setForm={setForm}
              onSave={handleSave}
              saving={saving}
              toggleForte={toggleForte}
              onPhotoUpload={handlePhotoUpload}
              uploading={uploading}
              photoUrl={null}
            />
          </div>
        </div>
      </main>
    )
  }

  const totalVotes = votes.reduce((sum, v) => sum + v.vote_count, 0)
  const cardUrl = typeof window !== 'undefined' ? `${window.location.origin}/card/${pro.id}` : ''
  const voteUrl = typeof window !== 'undefined' ? `${window.location.origin}/vote/${pro.id}` : ''

  const topCategory = votes.length > 0
    ? votes.sort((a, b) => b.vote_count - a.vote_count)[0]?.category
    : null
  const topLabel = topCategory ? getForteLabel(topCategory, pro) : '—'

  return (
    <main className="min-h-screen bg-forte-cream">
      <header className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-wider text-forte-dark">FORTE</h1>
            <p className="text-xs text-gray-400">{pro.name}のダッシュボード</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-gray-600">
            ログアウト
          </button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-forte-dark">{totalVotes}</p>
            <p className="text-xs text-gray-400">総投票数</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
            <p className="text-lg font-bold text-forte-gold truncate">{topLabel}</p>
            <p className="text-xs text-gray-400">トップフォルテ</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-green-500">
              {pro.is_founding_member ? '✓' : '—'}
            </p>
            <p className="text-xs text-gray-400">Founder</p>
          </div>
        </div>

        <div className="flex gap-1 bg-white rounded-xl p-1 mb-6 shadow-sm">
          {[
            { key: 'card' as const, label: 'FORTEカード' },
            { key: 'qr' as const, label: 'QRコード' },
            { key: 'edit' as const, label: '編集' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.key ? 'bg-forte-dark text-white' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'card' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <ForteChart votes={votes} pro={pro} />
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs text-gray-400 mb-2">FORTEカードのURL</p>
              <div className="flex items-center gap-2">
                <input readOnly value={cardUrl} className="flex-1 text-sm bg-gray-50 px-3 py-2 rounded-lg text-gray-600 truncate" />
                <button onClick={() => navigator.clipboard.writeText(cardUrl)} className="px-3 py-2 bg-forte-dark text-white rounded-lg text-sm hover:bg-opacity-90">コピー</button>
              </div>
            </div>
            <Link href={`/card/${pro.id}`} target="_blank" className="block w-full py-3 bg-forte-gold text-forte-dark text-center rounded-xl font-bold hover:bg-opacity-90 transition">
              FORTEカードをプレビュー →
            </Link>
          </div>
        )}

        {activeTab === 'qr' && (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
            <h3 className="font-bold text-forte-dark mb-2">投票用QRコード</h3>
            <p className="text-sm text-gray-400 mb-6">セッション後にクライアントに見せてください</p>
            {qrDataUrl && (
              <div className="inline-block p-4 bg-white rounded-2xl border-2 border-gray-100 mb-4">
                <img src={qrDataUrl} alt="QR Code" className="w-64 h-64" />
              </div>
            )}
            <p className="text-sm text-gray-500 mb-4">「今日の感想を30秒で。クーポンもお送りしますね」</p>
            <div className="space-y-2">
              <button
                onClick={() => { if (!qrDataUrl) return; const link = document.createElement('a'); link.download = `forte-qr-${pro.name}.png`; link.href = qrDataUrl; link.click(); }}
                className="w-full py-3 bg-forte-dark text-white rounded-xl font-medium hover:bg-opacity-90 transition"
              >QRコードをダウンロード</button>
              <button onClick={() => navigator.clipboard.writeText(voteUrl)} className="w-full py-3 border-2 border-gray-200 text-gray-600 rounded-xl font-medium hover:border-gray-300 transition">投票URLをコピー</button>
            </div>
          </div>
        )}

        {activeTab === 'edit' && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="font-bold text-forte-dark mb-4">プロフィール編集</h3>
            <ProfileForm
              form={form}
              setForm={setForm}
              onSave={handleSave}
              saving={saving}
              toggleForte={toggleForte}
              onPhotoUpload={handlePhotoUpload}
              uploading={uploading}
              photoUrl={pro.photo_url}
            />
          </div>
        )}
      </div>
    </main>
  )
}

function ProfileForm({
  form, setForm, onSave, saving, toggleForte, onPhotoUpload, uploading, photoUrl,
}: {
  form: any; setForm: (f: any) => void; onSave: () => void; saving: boolean;
  toggleForte: (key: string) => void; onPhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean; photoUrl: string | null;
}) {
  const update = (key: string, value: string) => setForm((f: any) => ({ ...f, [key]: value }))

  return (
    <div className="space-y-4">
      {/* Photo upload */}
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-2">プロフィール写真</label>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl overflow-hidden shrink-0">
            {photoUrl ? (
              <img src={photoUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-gray-300">📷</span>
            )}
          </div>
          <label className="cursor-pointer px-4 py-2 bg-forte-light rounded-xl text-sm font-medium text-forte-dark hover:bg-gray-200 transition">
            {uploading ? 'アップロード中...' : '写真を選択'}
            <input type="file" accept="image/*" onChange={onPhotoUpload} className="hidden" disabled={uploading} />
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">名前 *</label>
        <input value={form.name} onChange={e => update('name', e.target.value)} placeholder="山田 太郎" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forte-gold" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">肩書き *</label>
        <input value={form.title} onChange={e => update('title', e.target.value)} placeholder="パーソナルトレーナー" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forte-gold" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">場所</label>
        <input value={form.location} onChange={e => update('location', e.target.value)} placeholder="東京都渋谷区" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forte-gold" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">経験年数</label>
        <input type="number" value={form.years_experience} onChange={e => update('years_experience', e.target.value)} placeholder="10" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forte-gold" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">自己紹介</label>
        <textarea value={form.bio} onChange={e => update('bio', e.target.value)} rows={4} placeholder="あなたの経歴や想いを書いてください" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forte-gold resize-none" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">対応できる悩み（カンマ区切り）</label>
        <input value={form.specialties} onChange={e => update('specialties', e.target.value)} placeholder="腰痛改善, 姿勢矯正, アスリートサポート" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forte-gold" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">予約リンク</label>
        <input value={form.booking_url} onChange={e => update('booking_url', e.target.value)} placeholder="https://your-booking-page.com" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forte-gold" />
      </div>

      <div className="border-t border-gray-100 pt-4 mt-4">
        <h4 className="text-sm font-bold text-forte-dark mb-1">🎁 お礼クーポン設定</h4>
        <p className="text-xs text-gray-400 mb-3">投票後にクライアントに表示されます</p>
        <input value={form.coupon_text} onChange={e => update('coupon_text', e.target.value)} placeholder="例: 次回500円OFF / 延長10分無料" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forte-gold" />
      </div>

      {/* Forte Selection */}
      <div className="border-t border-gray-100 pt-4 mt-4">
        <h4 className="text-sm font-bold text-forte-dark mb-1">🗳 フォルテ項目を選ぶ</h4>
        <p className="text-xs text-gray-400 mb-4">10種類から3〜5つ選んでください。クライアントの投票選択肢になります。</p>
        <div className="space-y-2">
          {FORTE_OPTIONS.map(opt => {
            const isSelected = form.selected_fortes.includes(opt.key)
            const isDisabled = !isSelected && form.selected_fortes.length >= 5
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => toggleForte(opt.key)}
                disabled={isDisabled}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? 'border-forte-gold bg-forte-gold/5'
                    : isDisabled
                    ? 'border-gray-50 bg-gray-50 opacity-40 cursor-not-allowed'
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <span className="text-lg">{opt.emoji}</span>
                <div className="flex-1 min-w-0">
                  <span className={`font-medium text-sm ${isSelected ? 'text-forte-dark' : 'text-gray-600'}`}>
                    {opt.label}
                  </span>
                  <p className="text-xs text-gray-400 truncate">{opt.desc}</p>
                </div>
                {isSelected && <span className="text-forte-gold font-bold shrink-0">✓</span>}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 mt-2 text-right">
          {form.selected_fortes.length}/5 選択中
        </p>
      </div>

      {/* Custom fortes */}
      <div className="border-t border-gray-100 pt-4 mt-4">
        <h4 className="text-sm font-bold text-forte-dark mb-1">⭐ カスタムフォルテ項目（任意）</h4>
        <p className="text-xs text-gray-400 mb-3">あなた独自の強みを最大2つ追加できます</p>
        <div className="space-y-3">
          <input value={form.custom_forte_1} onChange={e => update('custom_forte_1', e.target.value)} placeholder="例: 腰痛改善" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forte-gold" />
          <input value={form.custom_forte_2} onChange={e => update('custom_forte_2', e.target.value)} placeholder="例: 産後ケア" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-forte-gold" />
        </div>
      </div>

      <button
        onClick={onSave}
        disabled={!form.name || !form.title || form.selected_fortes.length < 3 || saving}
        className="w-full py-4 bg-forte-gold text-forte-dark rounded-xl font-bold text-lg hover:bg-opacity-90 transition disabled:opacity-40 mt-6"
      >
        {saving ? '保存中...' : form.selected_fortes.length < 3 ? `フォルテをあと${3 - form.selected_fortes.length}つ選んでください` : '保存する'}
      </button>
    </div>
  )
}
