'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getSessionSafe } from '@/lib/auth-helper'
import { Professional, Vote } from '@/lib/types'

const ADMIN_EMAILS = ['info@functionalneurotraining.com']

export default function AdminPage() {
  const supabase = createClient() as any
  const [authorized, setAuthorized] = useState(false)
  const [pros, setPros] = useState<(Professional & { total_votes: number })[]>([])
  const [recentVotes, setRecentVotes] = useState<(Vote & { professionals: { name: string } })[]>([])
  const [stats, setStats] = useState({ totalPros: 0, totalClients: 0, totalVotes: 0 })
  const [loading, setLoading] = useState(true)

  // Badge form
  const [selectedPro, setSelectedPro] = useState('')
  const [badgeLabel, setBadgeLabel] = useState('')
  const [badgeUrl, setBadgeUrl] = useState('')

  useEffect(() => {
    async function load() {
      const { user } = await getSessionSafe()
      if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
        setLoading(false)
        return
      }
      setAuthorized(true)

      // Pros with vote count
      const { data: proData } = await supabase.from('professionals').select('*').order('created_at') as { data: any[] | null } as { data: any[] | null }
      if (proData) {
        const prosWithVotes: any[] = []
        for (const p of proData) {
          const { count } = await supabase.from('votes').select('*', { count: 'exact', head: true }).eq('professional_id', p.id)
          prosWithVotes.push({ ...p, total_votes: count || 0 })
        }
        prosWithVotes.sort((a, b) => b.total_votes - a.total_votes)
        setPros(prosWithVotes)
      }

      // Recent votes
      const { data: voteData } = await supabase
        .from('votes').select('*, professionals(name)')
        .order('created_at', { ascending: false }).limit(30)
      if (voteData) setRecentVotes(voteData as any)

      // Stats
      const { count: pc } = await supabase.from('professionals').select('*', { count: 'exact', head: true })
      const { count: cc } = await supabase.from('clients').select('*', { count: 'exact', head: true })
      const { count: vc } = await supabase.from('votes').select('*', { count: 'exact', head: true })
      setStats({ totalPros: pc || 0, totalClients: cc || 0, totalVotes: vc || 0 })

      setLoading(false)
    }
    load()
  }, [])

  async function addBadge() {
    if (!selectedPro || !badgeLabel) return
    const pro = pros.find(p => p.id === selectedPro)
    if (!pro) return
    const badges = [...(pro.badges || []), { id: crypto.randomUUID(), label: badgeLabel, image_url: badgeUrl }]
    await (supabase.from('professionals') as any).update({ badges }).eq('id', selectedPro)
    alert('バッジを追加しました')
    window.location.reload()
  }

  async function toggleFounding(proId: string, current: boolean) {
    await supabase.from('professionals').update({ is_founding_member: !current }).eq('id', proId)
    window.location.reload()
  }

  function exportCSV() {
    const rows = [['名前', '肩書き', 'エリア', '総プルーフ', 'Founding', '登録日']]
    pros.forEach(p => {
      rows.push([p.name, p.title, p.location || '', String(p.total_votes), p.is_founding_member ? 'Y' : 'N', p.created_at.slice(0, 10)])
    })
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'proof_pros.csv'; a.click()
  }

  if (loading) return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  if (!authorized) return <div className="text-center py-16 text-gray-400">アクセス権限がありません</div>

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-6">管理画面</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-[#1A1A2E]">{stats.totalPros}</div>
          <div className="text-sm text-gray-500">登録プロ</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-[#1A1A2E]">{stats.totalClients}</div>
          <div className="text-sm text-gray-500">登録クライアント</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-[#C4A35A]">{stats.totalVotes}</div>
          <div className="text-sm text-gray-500">総投票数</div>
        </div>
      </div>

      {/* Badge Assignment */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">バッジ付与</h2>
        <div className="grid grid-cols-2 gap-4">
          <select value={selectedPro} onChange={e => setSelectedPro(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg">
            <option value="">プロを選択</option>
            {pros.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input value={badgeLabel} onChange={e => setBadgeLabel(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg" placeholder="バッジ名（例：FNT認定）" />
          <input value={badgeUrl} onChange={e => setBadgeUrl(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg" placeholder="バッジ画像URL（Storageから）" />
          <button onClick={addBadge} className="px-4 py-2 bg-[#1A1A2E] text-white rounded-lg hover:bg-[#2a2a4e]">付与</button>
        </div>
      </div>

      {/* Pro List */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-[#1A1A2E]">プロ一覧（{pros.length}名）</h2>
          <button onClick={exportCSV} className="text-sm text-[#C4A35A] hover:underline">CSV出力</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-2">名前</th><th className="py-2 px-2">肩書き</th>
                <th className="py-2 px-2">エリア</th><th className="py-2 px-2 text-right">プルーフ</th>
                <th className="py-2 px-2">FM</th><th className="py-2 px-2">バッジ</th>
              </tr>
            </thead>
            <tbody>
              {pros.map(p => (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-2 font-medium">
                    <a href={`/card/${p.id}`} className="text-[#1A1A2E] hover:text-[#C4A35A]">{p.name}</a>
                  </td>
                  <td className="py-2 px-2 text-gray-500">{p.title}</td>
                  <td className="py-2 px-2 text-gray-500">{p.location || '-'}</td>
                  <td className="py-2 px-2 text-right font-bold text-[#C4A35A]">{p.total_votes}</td>
                  <td className="py-2 px-2">
                    <button onClick={() => toggleFounding(p.id, p.is_founding_member)}
                      className={`text-xs px-2 py-1 rounded ${p.is_founding_member ? 'bg-[#C4A35A] text-white' : 'bg-gray-100 text-gray-400'}`}>
                      {p.is_founding_member ? 'FM' : '-'}
                    </button>
                  </td>
                  <td className="py-2 px-2 text-xs text-gray-500">
                    {p.badges?.map(b => b.label).join(', ') || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Votes */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">最近の投票</h2>
        <div className="space-y-2">
          {recentVotes.map(v => (
            <div key={v.id} className="flex items-center gap-3 text-sm py-2 border-b border-gray-50">
              <span className="text-gray-400 text-xs w-20">{new Date(v.created_at).toLocaleDateString('ja-JP')}</span>
              <span className="font-medium text-[#1A1A2E]">{v.professionals.name}</span>
              <span className="px-2 py-0.5 bg-[#1A1A2E]/10 text-[#1A1A2E] rounded-full text-xs">
                {v.result_category}
              </span>
              {v.personality_categories && v.personality_categories.length > 0 && (<span className="px-2 py-0.5 bg-[#C4A35A]/10 text-[#C4A35A] rounded-full text-xs">人柄×{v.personality_categories.length}</span>)}
              {v.comment && <span className="text-gray-400 text-xs truncate max-w-[200px]">{v.comment}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
