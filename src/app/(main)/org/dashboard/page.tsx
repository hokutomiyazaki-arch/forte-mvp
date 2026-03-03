'use client'
import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import dynamic from 'next/dynamic'
import { RESULT_FORTES } from '@/lib/types'

// recharts を dynamic import（SSR無効化）
const RechartsCharts = dynamic(() => import('./RechartsCharts'), { ssr: false })

const ORG_TYPE_LABELS: Record<string, { typeName: string; member: string; members: string; invite: string; count: string; perMember: string; emptyTitle: string; emptyDesc: string; publicPage: string }> = {
  store: {
    typeName: '店舗',
    member: 'メンバー',
    members: '所属プロフェッショナル',
    invite: 'メンバー管理',
    count: '所属メンバー',
    perMember: 'メンバー別プルーフ',
    emptyTitle: 'まだメンバーがいません',
    emptyDesc: 'バッジ管理からメンバーを追加しましょう',
    publicPage: '店舗ページを見る',
  },
  credential: {
    typeName: '資格発行団体',
    member: '認定者',
    members: '認定プロフェッショナル',
    invite: '認定者管理',
    count: '認定者数',
    perMember: '認定者別プルーフ',
    emptyTitle: 'まだ認定者がいません',
    emptyDesc: 'バッジ管理から認定者を追加しましょう',
    publicPage: '団体ページを見る',
  },
  education: {
    typeName: '教育団体',
    member: '修了者',
    members: '修了プロフェッショナル',
    invite: '修了者管理',
    count: '修了者数',
    perMember: '修了者別プルーフ',
    emptyTitle: 'まだ修了者がいません',
    emptyDesc: 'バッジ管理から修了者を追加しましょう',
    publicPage: '団体ページを見る',
  },
}

export default function OrgDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [org, setOrg] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [aggregate, setAggregate] = useState<any>(null)
  const [analytics, setAnalytics] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics'>('overview')
  const [error, setError] = useState('')
  const [editingOrg, setEditingOrg] = useState(false)
  const [editOrgName, setEditOrgName] = useState('')
  const [editOrgDescription, setEditOrgDescription] = useState('')
  const [editOrgSaving, setEditOrgSaving] = useState(false)

  const { user: clerkUser, isLoaded: authLoaded } = useUser()
  const authUser = clerkUser ? { id: clerkUser.id } : null

  useEffect(() => {
    if (!authLoaded) return
    if (!authUser) { window.location.href = '/login?role=pro'; return }
    load()
  }, [authLoaded, authUser])

  async function load() {
    try {
      const res = await fetch('/api/org-dashboard')
      if (!res.ok) throw new Error('データの取得に失敗しました')
      const data = await res.json()

      if (!data.org) {
        window.location.href = '/org/register'
        return
      }

      setOrg(data.org)
      setMembers(data.members || [])
      setAggregate(data.aggregate || null)
      if (data.analytics) setAnalytics(data.analytics)
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

  // result_categoryキーをラベルに変換
  const strengthWithLabels = (analytics?.strengthDistribution || []).map((d: any) => {
    const forte = RESULT_FORTES.find(f => f.key === d.label)
    return {
      ...d,
      label: forte?.label || d.label,
    }
  })

  const handleOrgEditStart = () => {
    setEditOrgName(org.name || '')
    setEditOrgDescription(org.description || '')
    setEditingOrg(true)
  }

  const handleOrgEditSave = async () => {
    setEditOrgSaving(true)
    try {
      const res = await fetch('/api/org-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: org.id,
          name: editOrgName,
          description: editOrgDescription,
        }),
      })
      if (!res.ok) throw new Error('更新に失敗しました')
      setOrg((prev: any) => ({ ...prev, name: editOrgName, description: editOrgDescription }))
      setEditingOrg(false)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setEditOrgSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-[#1A1A2E] rounded-lg flex items-center justify-center text-white text-lg font-bold">
            {org.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#1A1A2E]">{org.name}</h1>
              <button
                onClick={handleOrgEditStart}
                className="text-xs text-gray-400 border border-gray-200 rounded-md px-2 py-0.5 hover:border-[#C4A35A] hover:text-[#C4A35A] transition"
              >
                編集
              </button>
            </div>
            <p className="text-xs text-gray-400">{L.typeName}</p>
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
            activeTab === 'overview'
              ? 'bg-white text-[#1A1A2E] shadow-sm'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          概要
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
            activeTab === 'analytics'
              ? 'bg-white text-[#1A1A2E] shadow-sm'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          分析
        </button>
      </div>

      {/* サマリーカード（常に表示） */}
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

      {/* === 概要タブ === */}
      {activeTab === 'overview' && (
        <>
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
                        {(m.professional_name || m.name)?.charAt(0) || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#1A1A2E] truncate">
                        {m.professional_name || m.name}
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
                バッジ管理
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
        </>
      )}

      {/* === 分析タブ === */}
      {activeTab === 'analytics' && (
        <RechartsCharts
          analytics={{
            ...analytics,
            strengthDistribution: strengthWithLabels,
          }}
        />
      )}

      {/* 団体編集モーダル */}
      {editingOrg && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
          }}
          onClick={() => setEditingOrg(false)}
        >
          <div
            style={{
              backgroundColor: '#FAFAF7', borderRadius: '16px',
              padding: '24px', maxWidth: '480px', width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: '#1A1A2E', fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>
              団体情報を編集
            </h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>団体名</label>
              <input
                type="text"
                value={editOrgName}
                onChange={(e) => setEditOrgName(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: '1px solid #E5E5E0', fontSize: '14px', color: '#1A1A2E',
                  backgroundColor: '#fff', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>説明</label>
              <textarea
                value={editOrgDescription}
                onChange={(e) => setEditOrgDescription(e.target.value)}
                rows={4}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: '1px solid #E5E5E0', fontSize: '14px', color: '#1A1A2E',
                  backgroundColor: '#fff', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingOrg(false)}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: '1px solid #E5E5E0',
                  backgroundColor: '#fff', color: '#666', fontSize: '14px', cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleOrgEditSave}
                disabled={editOrgSaving || !editOrgName.trim()}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: 'none',
                  backgroundColor: '#C4A35A', color: '#fff', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer', opacity: editOrgSaving || !editOrgName.trim() ? 0.5 : 1,
                }}
              >
                {editOrgSaving ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
