'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Vote, Professional, getResultForteLabel, getPersonalityForteLabel } from '@/lib/types'

interface VoteWithPro extends Vote {
  professionals: Professional
}

export default function MyCardPage() {
  const supabase = createClient()
  const [votes, setVotes] = useState<VoteWithPro[]>([])
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login?role=client'; return }

      const { data: clientData } = await supabase
        .from('clients').select('nickname').eq('user_id', user.id).single()
      if (clientData) setNickname(clientData.nickname)

      const { data: voteData } = await supabase
        .from('votes')
        .select('*, professionals(*)')
        .eq('client_user_id', user.id)
        .order('created_at', { ascending: false })

      if (voteData) setVotes(voteData as VoteWithPro[])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="text-center py-16 text-gray-400">読み込み中...</div>

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#1A1A2E]">{nickname || 'My'} のカード</h1>
        <p className="text-gray-500 text-sm mt-1">あなたがフォルテを贈ったプロのコレクション</p>
      </div>

      {votes.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 mb-4">まだフォルテを贈ったプロがいません</p>
          <a href="/explore" className="text-[#C4A35A] hover:underline">プロを探す</a>
        </div>
      ) : (
        <div className="space-y-4">
          {votes.map(v => (
            <a key={v.id} href={`/card/${v.professional_id}`}
              className="block bg-white rounded-xl p-5 shadow-sm hover:shadow-md transition">
              <div className="flex items-center gap-4">
                {v.professionals.photo_url ? (
                  <img src={v.professionals.photo_url} alt="" className="w-14 h-14 rounded-full object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white text-xl font-bold">
                    {v.professionals.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1">
                  <div className="font-bold text-[#1A1A2E]">{v.professionals.name}</div>
                  <div className="text-sm text-gray-500">{v.professionals.title}</div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 bg-[#1A1A2E]/10 text-[#1A1A2E] rounded-full">
                      {getResultForteLabel(v.result_category, v.professionals)}
                    </span>
                    {v.personality_categories?.map(pc => (
                      <span key={pc} className="text-xs px-2 py-0.5 bg-[#C4A35A]/10 text-[#C4A35A] rounded-full">
                        {getPersonalityForteLabel(pc, v.professionals)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {v.comment && (
                <p className="text-sm text-gray-600 mt-3 border-l-2 border-[#C4A35A] pl-3">{v.comment}</p>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
