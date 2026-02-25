'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams } from 'next/navigation'

const ORG_TYPE_LABELS: Record<string, { typeName: string; members: string; count: string; empty: string }> = {
  store: {
    typeName: '店舗',
    members: '所属プロフェッショナル',
    count: '所属メンバー',
    empty: 'メンバー情報はまだありません',
  },
  credential: {
    typeName: '資格発行団体',
    members: '認定プロフェッショナル',
    count: '認定者数',
    empty: '認定者情報はまだありません',
  },
  education: {
    typeName: '教育団体',
    members: '修了プロフェッショナル',
    count: '修了者数',
    empty: '修了者情報はまだありません',
  },
}

export default function OrgPublicPage() {
  const supabase = createClient() as any
  const params = useParams()
  const orgId = params.org_id as string
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [aggregate, setAggregate] = useState<any>(null)
  const [levelAggregates, setLevelAggregates] = useState<any[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      // 団体情報
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .maybeSingle()

      if (orgError) throw orgError
      if (!orgData) {
        setError('団体が見つかりませんでした')
        setLoading(false)
        return
      }

      setOrg(orgData)

      // メンバー + プルーフ数
      const { data: memberData } = await supabase
        .from('org_proof_summary')
        .select('*')
        .eq('organization_id', orgId)
        .order('total_votes', { ascending: false })

      setMembers(memberData || [])

      // 集計
      const { data: aggData } = await supabase
        .from('org_aggregate')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle()

      setAggregate(aggData)

      // credential/education団体: レベル別集計
      if (orgData.type === 'credential' || orgData.type === 'education') {
        const { data: levelAggData } = await supabase
          .from('org_level_aggregate')
          .select('*')
          .eq('organization_id', orgId)
          .order('sort_order', { ascending: true })

        setLevelAggregates(levelAggData || [])
      }
    } catch (err: any) {
      setError(err.message || 'データの取得に失敗しました')
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#C4A35A] border-t-transparent rounded-full mx-auto" />
      </div>
    )
  }

  if (error || !org) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-400">{error || '団体が見つかりませんでした'}</p>
      </div>
    )
  }

  const L = ORG_TYPE_LABELS[org.type] || ORG_TYPE_LABELS.store

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-[#1A1A2E] rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">
          {org.name.charAt(0)}
        </div>
        <h1 className="text-2xl font-bold text-[#1A1A2E]">{org.name}</h1>
        <p className="text-sm text-gray-400 mt-1">{L.typeName}</p>
        {org.location && (
          <p className="text-sm text-gray-500 mt-1">📍 {org.location}</p>
        )}
      </div>

      {/* 説明 */}
      {org.description && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6">
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{org.description}</p>
        </div>
      )}

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
          <div className="text-2xl font-bold text-[#1A1A2E]">
            {aggregate?.active_member_count || members.length}
          </div>
          <div className="text-xs text-gray-400 mt-1">{L.count}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
          <div className="text-2xl font-bold text-[#C4A35A]">
            {aggregate?.total_org_votes || 0}
          </div>
          <div className="text-xs text-gray-400 mt-1">プルーフ</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
          <div className="text-2xl font-bold text-green-600">
            +{aggregate?.votes_last_30_days || 0}
          </div>
          <div className="text-xs text-gray-400 mt-1">直近30日</div>
        </div>
      </div>

      {/* レベル別セクション（credential/education団体のみ） */}
      {(org.type === 'credential' || org.type === 'education') && levelAggregates.length > 0 && (
        <div className="mb-6 space-y-3">
          <h2 className="text-sm font-bold text-[#1A1A2E] mb-2">
            {org.type === 'credential' ? '認定レベル' : '修了レベル'}
          </h2>
          {levelAggregates.map(la => (
            <a
              key={la.level_id}
              href={`/org/${orgId}/level/${la.level_id}`}
              className="block bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-[#C4A35A] transition"
            >
              <div className="flex items-center gap-4">
                {la.image_url ? (
                  <img src={la.image_url} alt={la.level_name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#C4A35A] to-[#E8D5A0] flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                    {la.level_name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#1A1A2E] truncate">{la.level_name}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {la.member_count}名 · {la.total_votes}プルーフ
                  </div>
                </div>
                <span className="text-gray-300 text-sm">→</span>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* メンバー一覧 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h2 className="text-sm font-bold text-[#1A1A2E] mb-4">{L.members}</h2>

        {members.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">{L.empty}</p>
        ) : (
          <div className="space-y-3">
            {members.map(m => (
              <a
                key={m.professional_id}
                href={`/card/${m.professional_id}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition"
              >
                {m.photo_url ? (
                  <img src={m.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm text-gray-400">
                    {m.professional_name?.charAt(0) || '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#1A1A2E] truncate">
                    {m.professional_name}
                  </div>
                  <div className="text-xs text-gray-400">
                    {m.total_votes || 0}票のプルーフ
                  </div>
                </div>
                <span className="text-gray-300 text-sm">→</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* リンク */}
      <div className="flex gap-3">
        {org.website_url && (
          <a
            href={org.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 bg-white text-[#1A1A2E] font-medium rounded-xl border border-gray-200 hover:border-[#C4A35A] transition text-sm text-center"
          >
            ウェブサイト
          </a>
        )}
        {org.booking_url && org.type === 'store' && (
          <a
            href={org.booking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 bg-[#1A1A2E] text-white font-medium rounded-xl hover:bg-[#2a2a4e] transition text-sm text-center"
          >
            予約する
          </a>
        )}
      </div>
    </div>
  )
}
