'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getSessionSafe } from '@/lib/auth-helper'

const ORG_TYPE_LABELS: Record<string, { typeName: string; member: string; members: string; invite: string; count: string; perMember: string; emptyTitle: string; emptyDesc: string; publicPage: string }> = {
  store: {
    typeName: '店舗',
    member: 'メンバー',
    members: '所属プロフェッショナル',
    invite: 'メンバーを招待する',
    count: '所属メンバー',
    perMember: 'メンバー別プルーフ',
    emptyTitle: 'まだメンバーがいません',
    emptyDesc: '下のボタンからメンバーを招待しましょう',
    publicPage: '店舗ページを見る',
  },
  credential: {
    typeName: '資格発行団体',
    member: '認定者',
    members: '認定プロフェッショナル',
    invite: '認定者を追加',
    count: '認定者数',
    perMember: '認定者別プルーフ',
    emptyTitle: 'まだ認定者がいません',
    emptyDesc: '下のボタンから認定者を追加しましょう',
    publicPage: '団体ページを見る',
  },
  education: {
    typeName: '教育団体',
    member: '修了者',
    members: '修了プロフェッショナル',
    invite: '修了者を追加',
    count: '修了者数',
    perMember: '修了者別プルーフ',
    emptyTitle: 'まだ修了者がいません',
    emptyDesc: '下のボタンから修了者を追加しましょう',
    publicPage: '団体ページを見る',
  },
}

export default function OrgDashboardPage() {
  const supabase = createClient() as any
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [aggregate, setAggregate] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const { user } = await getSessionSafe()
      if (!user) {
        window.location.href = '/login?role=pro'
        return
      }

      // オーナーの団体を取得
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (orgError) throw orgError
      if (!orgData) {
        // 団体未登録 → 登録ページへ
        window.location.href = '/org/register'
        return
      }

      setOrg(orgData)

      // メンバー一覧 + プルーフ数を取得（org_proof_summary ビュー）
      const { data: memberData } = await supabase
        .from('org_proof_summary')
        .select('*')
        .eq('organization_id', orgData.id)
        .order('total_votes', { ascending: false })

      setMembers(memberData || [])

      // 団体全体の集計（org_aggregate ビュー）
      const { data: aggData } = await supabase
        .from('org_aggregate')
        .select('*')
        .eq('organization_id', orgData.id)
        .maybeSingle()

      setAggregate(aggData)
    } catch (err: any) {
      setError(err.message || 'データの取得に失敗しました')
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#C4A35A] border-t-transparent rounded-full mx-auto" />
        <p className="text-gray-400 mt-4 text-sm">読み込み中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  if (!org) return null

  const L = ORG_TYPE_LABELS[org.type] || ORG_TYPE_LABELS.store
  const maxVotes = Math.max(...members.map(m => m.total_votes || 0), 1)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-[#1A1A2E] rounded-lg flex items-center justify-center text-white text-lg font-bold">
            {org.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1A1A2E]">{org.name}</h1>
            <p className="text-xs text-gray-400">{L.typeName}</p>
          </div>
        </div>
      </div>

      {/* サマリーカード */}
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
          <div className="text-xs text-gray-400 mt-1">合計プルーフ</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
          <div className="text-2xl font-bold text-green-600">
            +{aggregate?.votes_last_30_days || 0}
          </div>
          <div className="text-xs text-gray-400 mt-1">直近30日</div>
        </div>
      </div>

      {/* メンバー別プルーフ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h2 className="text-sm font-bold text-[#1A1A2E] mb-4">{L.perMember}</h2>

        {members.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm mb-1">{L.emptyTitle}</p>
            <p className="text-gray-300 text-xs">{L.emptyDesc}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((m, i) => (
              <div key={m.professional_id} className="flex items-center gap-3">
                <span className="text-xs text-gray-300 w-5 text-right">{i + 1}</span>
                {m.photo_url ? (
                  <img
                    src={m.photo_url}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                    {m.professional_name?.charAt(0) || '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#1A1A2E] truncate">
                    {m.professional_name}
                  </div>
                  <div className="mt-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#C4A35A] rounded-full transition-all"
                      style={{ width: `${((m.total_votes || 0) / maxVotes) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-bold text-[#1A1A2E] tabular-nums w-12 text-right">
                  {m.total_votes || 0}票
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* アクションボタン */}
      <div className="flex flex-col gap-3">
        {org.type !== 'store' && (
          <button
            onClick={() => window.location.href = '/org/dashboard/badges'}
            className="w-full py-3 bg-[#C4A35A] text-white font-medium rounded-xl hover:bg-[#b3944f] transition text-sm"
          >
            🎖️ バッジ管理
          </button>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => window.location.href = '/org/dashboard/invite'}
            className="flex-1 py-3 bg-[#1A1A2E] text-white font-medium rounded-xl hover:bg-[#2a2a4e] transition text-sm"
          >
            {L.invite}
          </button>
          <button
            onClick={() => window.location.href = `/org/${org.id}`}
            className="flex-1 py-3 bg-white text-[#1A1A2E] font-medium rounded-xl border border-gray-200 hover:border-[#C4A35A] transition text-sm"
          >
            {L.publicPage}
          </button>
        </div>
      </div>
    </div>
  )
}
