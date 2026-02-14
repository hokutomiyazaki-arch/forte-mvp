'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Professional, VoteSummary, Vote } from '@/lib/types'
import ForteChart from '@/components/ForteChart'

export default function CardPage() {
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()
  const [pro, setPro] = useState<Professional | null>(null)
  const [votes, setVotes] = useState<VoteSummary[]>([])
  const [trustCount, setTrustCount] = useState(0)
  const [comments, setComments] = useState<Vote[]>([])
  const [totalVotes, setTotalVotes] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: proData } = await supabase
        .from('professionals')
        .select('*')
        .eq('id', id)
        .single()
      
      if (proData) setPro(proData)

      const { data: voteData } = await supabase
        .from('vote_summary')
        .select('*')
        .eq('professional_id', id)
      
      if (voteData) setVotes(voteData)

      const { data: trustData } = await supabase
        .from('personality_summary')
        .select('*')
        .eq('professional_id', id)
        .single()
      
      if (trustData) setTrustCount(trustData.trust_count)

      const { data: commentData } = await supabase
        .from('votes')
        .select('*')
        .eq('professional_id', id)
        .not('comment', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20)
      
      if (commentData) setComments(commentData)

      // Total unique votes
      const { count } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('professional_id', id)
      
      setTotalVotes(count || 0)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="text-center py-16 text-gray-400">読み込み中...</div>
  if (!pro) return <div className="text-center py-16 text-gray-400">プロフィールが見つかりません</div>

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
        
        {/* Badges */}
        <div className="flex justify-center gap-2 mt-3">
          {pro.is_founding_member && (
            <span className="px-3 py-1 bg-[#C4A35A] text-white text-xs rounded-full font-medium">
              Founding Member
            </span>
          )}
          {pro.badges?.map((badge, i) => (
            <span key={i} className="px-3 py-1 bg-[#1A1A2E] text-white text-xs rounded-full font-medium flex items-center gap-1">
              {badge.image_url && <img src={badge.image_url} alt="" className="w-4 h-4" />}
              {badge.label}
            </span>
          ))}
        </div>

        {pro.location && <p className="text-sm text-gray-400 mt-2">{pro.location}</p>}
        {pro.years_experience && <p className="text-sm text-gray-400">経験 {pro.years_experience} 年</p>}
      </div>

      {/* Total votes */}
      <div className="text-center mb-6">
        <span className="text-4xl font-bold text-[#C4A35A]">{totalVotes}</span>
        <span className="text-gray-500 ml-2">フォルテ</span>
      </div>

      {/* Forte Chart */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">フォルテチャート</h2>
        <ForteChart votes={votes} trustCount={trustCount} professional={pro} />
      </div>

      {/* Bio */}
      {pro.bio && (
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">自己紹介</h2>
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{pro.bio}</p>
        </div>
      )}

      {/* Specialties */}
      {pro.specialties && pro.specialties.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-2">対応できる悩み</h2>
          <div className="flex flex-wrap gap-2">
            {pro.specialties.map(s => (
              <span key={s} className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      {comments.length > 0 && (
        <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
          <h2 className="text-lg font-bold text-[#1A1A2E] mb-4">クライアントの声</h2>
          <div className="space-y-3">
            {comments.map(c => (
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
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <a
          href={`/vote/${pro.id}`}
          className="flex-1 text-center py-3 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition"
        >
          このプロにフォルテを贈る
        </a>
        {pro.booking_url && (
          <a
            href={pro.booking_url}
            target="_blank"
            rel="noopener"
            className="flex-1 text-center py-3 border-2 border-[#1A1A2E] text-[#1A1A2E] font-medium rounded-lg hover:bg-[#1A1A2E] hover:text-white transition"
          >
            予約する
          </a>
        )}
      </div>
    </div>
  )
}
