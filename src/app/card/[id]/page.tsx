import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ForteChart from '@/components/ForteChart'
import { getForteLabel } from '@/lib/types'
import type { Professional, VoteSummary, Vote } from '@/lib/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function getProfessional(id: string) {
  const { data } = await supabase.from('professionals').select('*').eq('id', id).single()
  return data as Professional | null
}

async function getVotes(id: string) {
  const { data } = await supabase.from('vote_summary').select('*').eq('professional_id', id)
  return (data || []) as VoteSummary[]
}

async function getRecentComments(id: string) {
  const { data } = await supabase
    .from('votes')
    .select('category, comment, created_at')
    .eq('professional_id', id)
    .not('comment', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5)
  return (data || []) as Pick<Vote, 'category' | 'comment' | 'created_at'>[]
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMs / 3600000)
  const days = Math.floor(diffMs / 86400000)
  if (mins < 60) return `${mins}分前`
  if (hours < 24) return `${hours}時間前`
  if (days < 30) return `${days}日前`
  return `${Math.floor(days / 30)}ヶ月前`
}

export default async function CardPage({ params }: { params: { id: string } }) {
  const pro = await getProfessional(params.id)
  if (!pro) notFound()

  const votes = await getVotes(params.id)
  const comments = await getRecentComments(params.id)

  return (
    <main className="min-h-screen bg-forte-cream py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <Link href="/" className="inline-block">
            <span className="text-lg font-bold tracking-wider text-forte-dark">FORTE</span>
          </Link>
        </div>

        <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
          <div className="bg-forte-dark px-6 py-5">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 rounded-2xl bg-gray-700 flex items-center justify-center text-3xl text-white shrink-0 overflow-hidden">
                {pro.photo_url ? <img src={pro.photo_url} alt={pro.name} className="w-full h-full object-cover" /> : pro.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white truncate">{pro.name}</h1>
                  {pro.is_founding_member && (
                    <span className="text-xs bg-forte-gold text-forte-dark px-2 py-0.5 rounded-full font-bold shrink-0">Founder</span>
                  )}
                </div>
                <p className="text-gray-300 text-sm mt-1">{pro.title}</p>
                <div className="flex items-center gap-3 mt-2 text-gray-400 text-xs">
                  {pro.location && <span>📍 {pro.location}</span>}
                  {pro.years_experience && <span>🕐 経験{pro.years_experience}年</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            <ForteChart votes={votes} pro={pro} />
          </div>

          {comments.length > 0 && (
            <div className="px-6 pb-4">
              <h3 className="text-sm font-bold text-forte-dark mb-3">クライアントの声</h3>
              <div className="space-y-2">
                {comments.map((c, i) => (
                  <div key={i} className="bg-forte-light rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-forte-gold">{getForteLabel(c.category, pro)}</span>
                      <span className="text-xs text-gray-300">•</span>
                      <span className="text-xs text-gray-400">{timeAgo(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{c.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pro.specialties && pro.specialties.length > 0 && (
            <div className="px-6 pb-4">
              <h3 className="text-sm font-bold text-forte-dark mb-2">対応できる悩み</h3>
              <div className="flex flex-wrap gap-2">
                {pro.specialties.map((s, i) => (
                  <span key={i} className="px-3 py-1 bg-forte-light rounded-full text-sm text-forte-dark">{s}</span>
                ))}
              </div>
            </div>
          )}

          {pro.bio && (
            <div className="px-6 pb-4">
              <h3 className="text-sm font-bold text-forte-dark mb-2">プロフィール</h3>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{pro.bio}</p>
            </div>
          )}

          <div className="px-6 pb-6 space-y-3">
            {pro.booking_url && (
              <a href={pro.booking_url} target="_blank" rel="noopener noreferrer" className="block w-full py-3 bg-forte-dark text-white text-center rounded-xl font-medium hover:bg-opacity-90 transition">予約する →</a>
            )}
            <Link href={`/vote/${pro.id}`} className="block w-full py-3 bg-forte-gold text-forte-dark text-center rounded-xl font-bold hover:bg-opacity-90 transition">
              このプロのフォルテに投票する 🗳
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">FORTE — 強みに人が集まるデジタル名刺</p>
      </div>
    </main>
  )
}
