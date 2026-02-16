'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Professional, VoteSummary, Vote } from '@/lib/types'
import ForteChart from '@/components/ForteChart'

// バッジ階層: FNTはBDCの上位資格。同レベルのFNTを持っていたらBDCは非表示
// 表示順: レベル1（左）→ レベル3（右）
const BADGE_ORDER: Record<string, number> = {
  'bdc-elite': 1,
  'fnt-basic': 2,
  'bdc-pro': 3,
  'fnt-advance': 4,
  'bdc-legend': 5,
  'fnt-master': 6,
}

const BDC_TO_FNT_UPGRADE: Record<string, string> = {
  'bdc-elite': 'fnt-basic',
  'bdc-pro': 'fnt-advance',
  'bdc-legend': 'fnt-master',
}

function filterAndSortBadges(badges: { id: string; label: string; image_url: string }[]) {
  if (!badges || badges.length === 0) return []
  const ids = new Set(badges.map(b => b.id))
  // BDCバッジを持っていても、対応するFNTバッジがあればBDCを除外
  const filtered = badges.filter(b => {
    const upgradeId = BDC_TO_FNT_UPGRADE[b.id]
    if (upgradeId && ids.has(upgradeId)) return false
    return true
  })
  // レベル順にソート
  filtered.sort((a, b) => (BADGE_ORDER[a.id] || 99) - (BADGE_ORDER[b.id] || 99))
  return filtered
}

export default function CardPage() {
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()
  const [pro, setPro] = useState<Professional | null>(null)
  const [votes, setVotes] = useState<VoteSummary[]>([])
  const [personalityVotes, setPersonalityVotes] = useState<{category: string, vote_count: number}[]>([])
  const [comments, setComments] = useState<Vote[]>([])
  const [totalVotes, setTotalVotes] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: proData } = await supabase
        .from('professionals').select('*').eq('id', id).single() as any
      if (proData) setPro(proData)

      const { data: voteData } = await supabase
        .from('vote_summary').select('*').eq('professional_id', id) as any
      if (voteData) setVotes(voteData)

      const { data: personalityData } = await supabase
        .from('personality_summary').select('*').eq('professional_id', id) as any
      if (personalityData) setPersonalityVotes(personalityData)

      const { data: commentData } = await supabase
        .from('votes').select('*').eq('professional_id', id).eq('status', 'confirmed')
        .not('comment', 'is', null)
        .order('created_at', { ascending: false }).limit(20) as any
      if (commentData) setComments(commentData)

      const { count } = await supabase
        .from('votes').select('*', { count: 'exact', head: true }).eq('professional_id', id).eq('status', 'confirmed') as any
      setTotalVotes(count || 0)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  if (!pro) return <div className="text-center py-16 text-gray-400">プロフィールが見つかりません</div>

  const displayBadges = filterAndSortBadges(pro.badges || [])

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        {pro.photo_url ? (
          <img src={pro.photo_url} alt={pro.name} className="w-24 h-24 rounded-full mx-auto mb-4 object-cover" />
        ) : (
          <div className="w-24 h-24 rounded-full mx-auto mb-4 bg-[#1A1A2E] flex items-center justify-center text-white text-3xl font-bold">
            {pro.name.charAt(0)}
          </div>
        )}
        <h1 className="text-2xl font-bold text-[#1A1A2E]">{pro.name}</h1>
        <p className="text-gray-500">{pro.title}</p>

        {pro.is_founding_member && (
          <div className="mt-2">
            <span className="px-3 py-1 bg-[#C4A35A] text-white text-xs rounded-full font-medium">
              Founding Member
            </span>
          </div>
        )}

        {/* Badges */}
        {displayBadges.length > 0 && (
          <div className="flex justify-center gap-4 mt-4">
            {displayBadges.map((badge, i) => (
              <div key={i} className="flex flex-col items-center">
                <img src={badge.image_url} alt={badge.label} className="w-16 h-16" />
                <span className="text-[10px] text-gray-400 mt-1">{badge.label}</span>
              </div>
            ))}
          </div>
        )}

        {pro.location && <p className="text-sm text-gray-400 mt-2">{pro.location}</p>}
        {pro.created_at && (
          <p className="text-sm text-gray-400">
            REAL PROOF登録 {Math.floor((new Date().getTime() - new Date(pro.created_at).getTime()) / (1000 * 60 * 60 * 24))} 日目
          </p>
        )}
      </div>

      {/* Total votes */}
      <div className="text-center mb-6">
        <span className="text-4xl font-bold text-[#C4A35A]">{totalVotes}</span>
        <span className="text-gray-500 ml-2">プルーフ</span>
      </div>

      {/* Proof Chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">プルーフチャート</h2>
        <ForteChart votes={votes} personalityVotes={personalityVotes} professional={pro} />
      </div>

      {/* Bio */}
      {pro.bio && (
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">自己紹介</h2>
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{pro.bio}</p>
        </div>
      )}

      {/* Comments */}
      {comments.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">クライアントの声</h2>
          <div className="space-y-3">
            {comments.map((c: Vote) => (
              <div key={c.id} className="border-l-2 border-[#C4A35A] pl-4">
                <p className="text-sm text-gray-700">{c.comment}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(c.created_at).toLocaleDateString('ja-JP')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="flex flex-col gap-3 mb-8">
        {pro.contact_email && (
          <a href={`mailto:${pro.contact_email}?subject=${encodeURIComponent(`REAL PROOFを見て相談：${pro.name}さん`)}&body=${encodeURIComponent(`${pro.name}さん\n\nREAL PROOFであなたのプロフィールを拝見し、ご相談したくご連絡しました。\n\n`)}`}
            className="w-full text-center py-3 bg-[#C4A35A] text-white font-medium rounded-lg hover:bg-[#b3944f] transition">
            このプロに相談する
          </a>
        )}
        {pro.booking_url && (
          <a href={pro.booking_url} target="_blank" rel="noopener"
            className="w-full text-center py-3 border-2 border-[#1A1A2E] text-[#1A1A2E] font-medium rounded-lg hover:bg-[#1A1A2E] hover:text-white transition">
            予約する
          </a>
        )}
        <div className="text-center py-3 bg-gray-100 text-gray-500 font-medium rounded-lg text-sm">
          プルーフはセッション後にプロが発行する24時間限定QRコードからのみ贈れます
        </div>
      </div>
    </div>
  )
}
