'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Professional, VoteSummary, CustomForte, getResultForteLabel, RESULT_FORTES, PERSONALITY_FORTES } from '@/lib/types'
import ForteChart from '@/components/ForteChart'

export default function DashboardPage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [pro, setPro] = useState<Professional | null>(null)
  const [votes, setVotes] = useState<VoteSummary[]>([])
  const [personalityVotes, setPersonalityVotes] = useState<{category: string, vote_count: number}[]>([])
  const [totalVotes, setTotalVotes] = useState(0)
  const [qrUrl, setQrUrl] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    name: '', title: '', location: '',
    bio: '', booking_url: '', coupon_text: '',
  })
  const [customResultFortes, setCustomResultFortes] = useState<CustomForte[]>([])
  const [customPersonalityFortes, setCustomPersonalityFortes] = useState<CustomForte[]>([])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { window.location.href = '/login?role=pro'; return }
      const u = session.user
      setUser(u)

      const { data: proData } = await supabase
        .from('professionals').select('*').eq('user_id', u.id).single()

      if (proData) {
        setPro(proData)
        setForm({
          name: proData.name || '', title: proData.title || '',
          location: proData.location || '',
          bio: proData.bio || '', booking_url: proData.booking_url || '',
          coupon_text: proData.coupon_text || '',
        })
        setCustomResultFortes(proData.custom_result_fortes || [])
        setCustomPersonalityFortes(proData.custom_personality_fortes || [])

        const { data: voteData } = await supabase.from('vote_summary').select('*').eq('professional_id', proData.id)
        if (voteData) setVotes(voteData)

        const { data: persData } = await supabase.from('personality_summary').select('*').eq('professional_id', proData.id)
        if (persData) setPersonalityVotes(persData)

        const { count } = await supabase.from('votes').select('*', { count: 'exact', head: true }).eq('professional_id', proData.id)
        setTotalVotes(count || 0)
      } else {
        setEditing(true)
      }
      setLoading(false)
    }
    load()
  }, [])

  function addCustomForte(type: 'result' | 'personality') {
    const prefix = type === 'result' ? 'cr_' : 'cp_'
    const newForte: CustomForte = { id: `${prefix}${Date.now()}`, label: '', description: '' }
    if (type === 'result') {
      if (customResultFortes.length >= 3) return
      setCustomResultFortes([...customResultFortes, newForte])
    } else {
      if (customPersonalityFortes.length >= 3) return
      setCustomPersonalityFortes([...customPersonalityFortes, newForte])
    }
  }

  function updateCustomForte(type: 'result' | 'personality', idx: number, field: 'label' | 'description', value: string) {
    if (type === 'result') {
      const updated = [...customResultFortes]
      updated[idx] = { ...updated[idx], [field]: value }
      setCustomResultFortes(updated)
    } else {
      const updated = [...customPersonalityFortes]
      updated[idx] = { ...updated[idx], [field]: value }
      setCustomPersonalityFortes(updated)
    }
  }

  function removeCustomForte(type: 'result' | 'personality', idx: number) {
    if (type === 'result') {
      setCustomResultFortes(customResultFortes.filter((_, i) => i !== idx))
    } else {
      setCustomPersonalityFortes(customPersonalityFortes.filter((_, i) => i !== idx))
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return

    const validResultFortes = customResultFortes.filter(f => f.label.trim())
    const validPersonalityFortes = customPersonalityFortes.filter(f => f.label.trim())

    const record = {
      user_id: user.id, name: form.name, title: form.title,
      location: form.location || null,
      bio: form.bio || null, booking_url: form.booking_url || null,
      coupon_text: form.coupon_text || null,
      custom_result_fortes: validResultFortes,
      custom_personality_fortes: validPersonalityFortes,
      is_founding_member: true,
    }

    if (pro) {
      await supabase.from('professionals').update(record).eq('id', pro.id)
    } else {
      const { data } = await supabase.from('professionals').insert(record).select().single()
      if (data) setPro(data)
    }
    setEditing(false)
    window.location.reload()
  }

  async function generateQR() {
    if (!pro) return
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('qr_tokens').insert({ professional_id: pro.id, token, expires_at: expiresAt })
    const voteUrl = `${window.location.origin}/vote/${pro.id}?token=${token}`
    setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(voteUrl)}`)
  }

  // 登録日数を計算
  function getDaysSinceRegistration(): number {
    if (!pro?.created_at) return 0
    const created = new Date(pro.created_at)
    const now = new Date()
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
  }

  if (loading) return <div className="text-center py-16 text-gray-400">読み込み中...</div>

  if (editing || !pro) {
    return (
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-6">
          {pro ? 'プロフィール編集' : 'プロフィール作成'}
        </h1>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">名前 *</label>
            <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">肩書き *</label>
            <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none"
              placeholder="パーソナルトレーナー / 整体師 など" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">エリア</label>
            <input value={form.location} onChange={e => setForm({...form, location: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" placeholder="東京都渋谷区" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">自己紹介</label>
            <textarea value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none resize-none" />
          </div>

          {/* デフォルト強みプルーフ一覧 + カスタム */}
          <div className="border-t pt-4">
            <label className="block text-sm font-bold text-[#1A1A2E] mb-2">💪 強みプルーフ</label>
            <p className="text-xs text-gray-500 mb-3">クライアントが投票時に選べる強みカテゴリです</p>
            <div className="space-y-1 mb-4">
              {RESULT_FORTES.map(f => (
                <div key={f.key} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-[#1A1A2E] flex-shrink-0"></span>
                  <span className="text-sm text-gray-700">{f.label}</span>
                  <span className="text-xs text-gray-400 ml-auto">{f.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-xs font-medium text-gray-600 mb-2">＋ オリジナル強みプルーフ（最大3つ追加可）</p>
            {customResultFortes.map((f, i) => (
              <div key={f.id} className="flex gap-2 mb-2">
                <input value={f.label} onChange={e => updateCustomForte('result', i, 'label', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#C4A35A]"
                  placeholder="カテゴリ名（例：呼吸が楽になった）" />
                <button type="button" onClick={() => removeCustomForte('result', i)}
                  className="px-3 py-2 text-red-400 hover:text-red-600 text-sm">✕</button>
              </div>
            ))}
            {customResultFortes.length < 3 && (
              <button type="button" onClick={() => addCustomForte('result')}
                className="text-sm text-[#C4A35A] hover:underline">+ オリジナル強みを追加</button>
            )}
          </div>

          {/* デフォルトパーソナリティプルーフ一覧 + カスタム */}
          <div className="border-t pt-4">
            <label className="block text-sm font-bold text-[#C4A35A] mb-2">🤝 パーソナリティプルーフ</label>
            <p className="text-xs text-gray-500 mb-3">クライアントが投票時に選べる人柄カテゴリです</p>
            <div className="space-y-1 mb-4">
              {PERSONALITY_FORTES.map(f => (
                <div key={f.key} className="flex items-center gap-2 px-3 py-2 bg-[#C4A35A]/5 rounded-lg">
                  <span className="w-2 h-2 rounded-full bg-[#C4A35A] flex-shrink-0"></span>
                  <span className="text-sm text-gray-700">{f.label}</span>
                  <span className="text-xs text-gray-400 ml-auto">{f.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-xs font-medium text-gray-600 mb-2">＋ オリジナルパーソナリティプルーフ（最大3つ追加可）</p>
            {customPersonalityFortes.map((f, i) => (
              <div key={f.id} className="flex gap-2 mb-2">
                <input value={f.label} onChange={e => updateCustomForte('personality', i, 'label', e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#C4A35A]"
                  placeholder="カテゴリ名（例：ユーモアがある）" />
                <button type="button" onClick={() => removeCustomForte('personality', i)}
                  className="px-3 py-2 text-red-400 hover:text-red-600 text-sm">✕</button>
              </div>
            ))}
            {customPersonalityFortes.length < 3 && (
              <button type="button" onClick={() => addCustomForte('personality')}
                className="text-sm text-[#C4A35A] hover:underline">+ オリジナルパーソナリティを追加</button>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">予約URL</label>
            <input value={form.booking_url} onChange={e => setForm({...form, booking_url: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" placeholder="https://..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">投票後のお礼特典</label>
            <input value={form.coupon_text} onChange={e => setForm({...form, coupon_text: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C4A35A] outline-none" placeholder="初回セッション10%OFF" />
          </div>
          <button type="submit" className="w-full py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition">
            保存する
          </button>
        </form>
      </div>
    )
  }

  const topForte = votes.length > 0 ?
    getResultForteLabel(votes.sort((a,b) => b.vote_count - a.vote_count)[0]?.category, pro) : '-'

  const daysSinceRegistration = getDaysSinceRegistration()

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-[#1A1A2E]">ダッシュボード</h1>
        <button onClick={() => setEditing(true)} className="text-sm text-[#C4A35A] hover:underline">
          プロフィール編集
        </button>
      </div>

      {/* Badges */}
      {pro.badges && pro.badges.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">取得バッジ</h2>
          <div className="flex flex-wrap justify-center gap-6">
            {pro.badges.map((badge: { id: string; label: string; image_url: string }, i: number) => (
              <div key={i} className="flex flex-col items-center">
                <img src={badge.image_url} alt={badge.label} className="w-16 h-16" />
                <span className="text-[10px] text-gray-400 mt-1">{badge.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-[#C4A35A]">{totalVotes}</div>
          <div className="text-sm text-gray-500">総プルーフ数</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-lg font-bold text-[#1A1A2E] truncate">{topForte}</div>
          <div className="text-sm text-gray-500">トッププルーフ</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-[#1A1A2E]">{daysSinceRegistration}</div>
          <div className="text-sm text-gray-500">登録日数</div>
        </div>
      </div>

      {/* Proof Chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">プルーフチャート</h2>
        <ForteChart votes={votes} personalityVotes={personalityVotes} professional={pro} />
      </div>

      {/* QR Code */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8 text-center">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">24時間限定 投票用QRコード</h2>
        <p className="text-sm text-gray-500 mb-4">クライアントに見せてプルーフを贈ってもらいましょう</p>
        {qrUrl ? (
          <img src={qrUrl} alt="QR Code" className="mx-auto mb-4" />
        ) : (
          <button onClick={generateQR} className="px-6 py-3 bg-[#C4A35A] text-white rounded-lg hover:bg-[#b3944f] transition">
            24時間限定QRコードを発行する
          </button>
        )}
      </div>

      {/* Links */}
      <div className="flex gap-4">
        <a href={`/card/${pro.id}`} className="flex-1 text-center py-3 border-2 border-[#1A1A2E] text-[#1A1A2E] rounded-lg hover:bg-[#1A1A2E] hover:text-white transition">
          カードを見る
        </a>
        <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }}
          className="px-6 py-3 text-gray-500 hover:text-red-500 transition">
          ログアウト
        </button>
      </div>
    </div>
  )
}
