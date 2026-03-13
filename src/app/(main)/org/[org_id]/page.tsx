'use client'
import { useState, useEffect } from 'react'
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
  const params = useParams()
  const orgId = params.org_id as string
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [aggregate, setAggregate] = useState<any>(null)
  const [levelAggregates, setLevelAggregates] = useState<any[]>([])
  const [generalCount, setGeneralCount] = useState(0)
  const [proofTopMembers, setProofTopMembers] = useState<any[]>([])
  const [topStrengthItems, setTopStrengthItems] = useState<{ label: string; count: number }[]>([])
  const [recentComments, setRecentComments] = useState<any[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    try {
      const res = await fetch(`/api/org/${orgId}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'データの取得に失敗しました')
      }
      const data = await res.json()
      setOrg(data.org)
      setMembers(data.members || [])
      setAggregate(data.aggregate || null)
      setLevelAggregates(data.levelAggregates || [])
      setGeneralCount(data.general_count || 0)
      setProofTopMembers(data.proofTopMembers || [])
      setTopStrengthItems(data.topStrengthItems || [])
      setRecentComments(data.recentComments || [])
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
        {org.logo_url ? (
          <img src={org.logo_url} alt={org.name} className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3" />
        ) : (
          <div className="w-16 h-16 bg-[#1A1A2E] rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">
            {org.name.charAt(0)}
          </div>
        )}
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

      {/* 強みランキング TOP5 */}
      {topStrengthItems.length > 0 && (() => {
        const maxCount = Math.max(...topStrengthItems.map(d => d.count), 1)
        return (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
            <h2 className="text-sm font-bold text-[#1A1A2E] mb-4">強みランキング TOP{topStrengthItems.length}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {topStrengthItems.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#AAA', width: '18px', textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: '#1A1A2E', fontWeight: 500, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </div>
                    <div style={{ height: '8px', backgroundColor: '#F0F0F0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${(item.count / maxCount) * 100}%`,
                          backgroundColor: '#C4A35A',
                          borderRadius: '4px',
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#C4A35A', whiteSpace: 'nowrap', width: '36px', textAlign: 'right', flexShrink: 0 }}>
                    {item.count}票
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* レベル別セクション（credential/education団体のみ） */}
      {(org.type === 'credential' || org.type === 'education') && levelAggregates.length > 0 && (
        <div className="mb-6 space-y-3">
          <h2 className="text-sm font-bold text-[#1A1A2E] mb-2">
            {org.type === 'credential' ? '認定レベル' : '修了レベル'}
          </h2>
          {levelAggregates.map((la: any) => (
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
                  <div className="text-sm font-bold text-[#1A1A2E] truncate">{la.level_name}  ({la.member_count}名)</div>
                  {la.members && la.members.length > 0 && (
                    <div className="text-xs text-gray-400 mt-1 truncate">
                      {la.members.map((m: any) => m.name).filter(Boolean).join('  /  ')}
                    </div>
                  )}
                </div>
                <span className="text-gray-300 text-sm">→</span>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* 一般メンバーカード */}
      {generalCount > 0 && (
        <div className="mb-6">
          <a
            href={`/org/${orgId}/generals`}
            className="block bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-[#C4A35A] transition"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">
                👥
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[#1A1A2E]">一般メンバー（{generalCount}名）</div>
                <div className="text-xs text-gray-400 mt-1">バッジを取得した一般会員</div>
              </div>
              <span className="text-gray-300 text-sm">→</span>
            </div>
          </a>
        </div>
      )}

      {/* プルーフ別トッププロフェッショナル */}
      {proofTopMembers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-[#1A1A2E] mb-3">各分野のトッププロフェッショナル</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {proofTopMembers.map((item: any, i: number) => (
              <a
                key={i}
                href={`/card/${item.top_professional_id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '14px', borderRadius: '12px',
                  backgroundColor: '#FAFAF7', border: '1px solid #E5E5E0',
                  textDecoration: 'none', transition: 'border-color 0.2s',
                }}
                className="hover:border-[#C4A35A]"
              >
                {item.top_photo_url ? (
                  <img
                    src={item.top_photo_url}
                    alt=""
                    style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    backgroundColor: '#E5E5E0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', color: '#888', flexShrink: 0,
                  }}>
                    {item.top_name?.charAt(0) || '?'}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: '#C4A35A', fontWeight: 600, marginBottom: '2px' }}>
                    {item.proof_label}
                  </div>
                  <div style={{ fontSize: '14px', color: '#1A1A2E', fontWeight: 500 }}>
                    {item.top_name}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#888', whiteSpace: 'nowrap' }}>
                  {item.vote_count}/{item.total_voters}票
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* メンバー一覧リンク */}
      {members.length > 0 && (
        <div className="mb-6">
          <a
            href={`/org/${orgId}/members`}
            className="block bg-white rounded-xl shadow-sm border border-gray-100 p-4 hover:border-[#C4A35A] transition text-center"
          >
            <span className="text-sm font-medium text-[#C4A35A]">{L.members}一覧を見る →</span>
          </a>
        </div>
      )}

      {/* 最新コメント */}
      {recentComments.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="text-sm font-bold text-[#1A1A2E] mb-4">最新のコメント</h2>
          <div className="space-y-4">
            {recentComments.map((c: any, i: number) => (
              <div key={i} className={i < recentComments.length - 1 ? 'pb-4 border-b border-gray-50' : ''}>
                <p className="text-sm text-gray-700 leading-relaxed mb-2">{c.comment}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#C4A35A] font-medium">{c.professional_name} へ</span>
                  <span className="text-xs text-gray-300">
                    {new Date(c.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <a
            href={`/org/${orgId}/comments`}
            className="block text-center text-sm font-medium text-[#C4A35A] mt-4 pt-3 border-t border-gray-100 hover:opacity-80 transition"
          >
            コメント一覧を見る →
          </a>
        </div>
      )}

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
