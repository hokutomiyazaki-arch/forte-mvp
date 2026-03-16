'use client'
import { useState, useEffect, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import dynamic from 'next/dynamic'
import { RESULT_FORTES } from '@/lib/types'
import { TAB_DISPLAY_NAMES } from '@/lib/constants'
import ImageCropper from '@/components/ImageCropper'

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
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false)
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null)
  const [credentialLevels, setCredentialLevels] = useState<{ id: string; name: string }[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'resources'>('overview')
  const [strengthDistribution, setStrengthDistribution] = useState<any[]>([])
  const [topStrengthItems, setTopStrengthItems] = useState<{ label: string; count: number }[]>([])
  const [error, setError] = useState('')

  // 共有資料 state
  const [resources, setResources] = useState<any[]>([])
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const [resourcesLoaded, setResourcesLoaded] = useState(false)
  const [showResourceModal, setShowResourceModal] = useState(false)
  const [editingResource, setEditingResource] = useState<any>(null)
  const [resourceForm, setResourceForm] = useState({ title: '', url: '', description: '', credential_level_id: '' })
  const [resourceSaving, setResourceSaving] = useState(false)
  const [resourceBadges, setResourceBadges] = useState<{ id: string; name: string }[]>([])
  const [ownerAccordionOpen, setOwnerAccordionOpen] = useState<Record<string, boolean>>({})
  const [sortingResourceId, setSortingResourceId] = useState<string | null>(null)
  const [editingOrg, setEditingOrg] = useState(false)
  const [editOrgName, setEditOrgName] = useState('')
  const [editOrgDescription, setEditOrgDescription] = useState('')
  const [editOrgSaving, setEditOrgSaving] = useState(false)
  const [editOrgLogoUrl, setEditOrgLogoUrl] = useState('')
  const [cropperSrc, setCropperSrc] = useState<string | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

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
      setStrengthDistribution(data.strengthDistribution || [])
      setTopStrengthItems(data.topStrengthItems || [])
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
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => { setError(''); setLoading(true); load() }}
          className="px-6 py-3 bg-[#1A1A2E] text-white rounded-xl text-sm font-medium"
        >
          再読み込み
        </button>
      </div>
    )
  }

  if (!org) return null

  const L = ORG_TYPE_LABELS[org.type] || ORG_TYPE_LABELS.store
  const maxVotes = Math.max(...members.map(m => m.total_votes || 0), 1)

  // tabキーを日本語ラベルに変換（org-dashboardのstrengthDistribution用）
  const strengthChartData = strengthDistribution.map((d: any) => ({
    label: TAB_DISPLAY_NAMES[d.tab] || d.tab,
    count: d.count,
  }))

  // result_categoryキーをラベルに変換（org-analyticsのstrengthDistribution用、フォールバック）
  const strengthWithLabels = (analytics?.strengthDistribution || []).map((d: any) => {
    const forte = RESULT_FORTES.find(f => f.key === d.label)
    return {
      ...d,
      label: forte?.label || d.label,
    }
  })

  // 分析タブクリック時に遅延ロード（一度取得したらキャッシュ）
  async function loadAnalytics() {
    if (analyticsLoaded || analyticsLoading || !org) return
    setAnalyticsLoading(true)
    try {
      const [analyticsRes, proofRes] = await Promise.all([
        fetch(`/api/org-analytics?orgId=${org.id}`),
        fetch(`/api/org/proof-analytics?orgId=${org.id}`),
      ])
      if (!analyticsRes.ok) throw new Error('分析データの取得に失敗しました')
      const data = await analyticsRes.json()
      const proofData = proofRes.ok ? await proofRes.json() : {}
      if (data.analytics) {
        setAnalytics({
          ...data.analytics,
          topProofItems: proofData.topProofItems || [],
          memberStrengths: proofData.memberStrengths || [],
        })
      }
      // バッジ一覧をセット（Fix 3）
      if (proofData.credentialLevels) {
        setCredentialLevels(proofData.credentialLevels)
      }
      setAnalyticsLoaded(true)
    } catch (err: any) {
      console.error('Analytics load error:', err)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  function handleAnalyticsTab() {
    setActiveTab('analytics')
    loadAnalytics()
  }

  // バッジフィルタ変更時にproof-analyticsを再取得（Fix 3）
  async function handleBadgeFilter(badgeId: string | null) {
    setSelectedBadgeId(badgeId)
    if (!org) return
    try {
      const url = badgeId
        ? `/api/org/proof-analytics?orgId=${org.id}&credential_level_id=${badgeId}`
        : `/api/org/proof-analytics?orgId=${org.id}`
      const res = await fetch(url)
      if (!res.ok) return
      const proofData = await res.json()
      setAnalytics((prev: any) => ({
        ...prev,
        topProofItems: proofData.topProofItems || [],
        memberStrengths: proofData.memberStrengths || [],
      }))
    } catch (err) {
      console.error('Badge filter error:', err)
    }
  }

  const handleOrgEditStart = () => {
    setEditOrgName(org.name || '')
    setEditOrgDescription(org.description || '')
    setEditOrgLogoUrl(org.logo_url || '')
    setEditingOrg(true)
  }

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('画像は5MB以下にしてください')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setCropperSrc(reader.result as string)
    reader.readAsDataURL(file)
    // inputリセット（同じファイル再選択可能に）
    e.target.value = ''
  }

  const handleLogoCropComplete = async (blob: Blob) => {
    setCropperSrc(null)
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('bucket', 'badge-images')
      formData.append('path', `org-logos/${org.id}/${Date.now()}.jpg`)
      formData.append('file', blob, 'logo.jpg')
      formData.append('upsert', 'true')

      const res = await fetch('/api/storage', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'アップロードに失敗しました')

      setEditOrgLogoUrl(data.publicUrl)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setUploadingLogo(false)
    }
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
          logo_url: editOrgLogoUrl || null,
        }),
      })
      if (!res.ok) throw new Error('更新に失敗しました')
      setOrg((prev: any) => ({ ...prev, name: editOrgName, description: editOrgDescription, logo_url: editOrgLogoUrl || null }))
      setEditingOrg(false)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setEditOrgSaving(false)
    }
  }

  // === 共有資料 ===
  async function loadResources() {
    if (resourcesLoaded || resourcesLoading || !org) return
    setResourcesLoading(true)
    try {
      const [resRes, badgeRes] = await Promise.all([
        fetch(`/api/organizations/${org.id}/resources`),
        fetch(`/api/org/proof-analytics?orgId=${org.id}`),
      ])
      if (resRes.ok) {
        const data = await resRes.json()
        setResources(data)
        // アコーディオン初期化（既存の開閉状態を保持、新しいキーはデフォルト開く）
        setOwnerAccordionOpen(prev => {
          const openState: Record<string, boolean> = { ...prev }
          const keys = new Set<string>()
          for (const r of data) {
            keys.add(r.credential_level_id || '__all__')
          }
          keys.forEach(k => { if (openState[k] === undefined) openState[k] = true })
          return openState
        })
      }
      if (badgeRes.ok) {
        const badgeData = await badgeRes.json()
        if (badgeData.credentialLevels) {
          setResourceBadges(badgeData.credentialLevels)
        }
      }
      setResourcesLoaded(true)
    } catch (err) {
      console.error('Resources load error:', err)
    } finally {
      setResourcesLoading(false)
    }
  }

  function handleResourcesTab() {
    setActiveTab('resources')
    loadResources()
  }

  function openResourceModal(resource?: any) {
    if (resource) {
      setEditingResource(resource)
      setResourceForm({
        title: resource.title || '',
        url: resource.url || '',
        description: resource.description || '',
        credential_level_id: resource.credential_level_id || '',
      })
    } else {
      setEditingResource(null)
      setResourceForm({ title: '', url: '', description: '', credential_level_id: '' })
    }
    setShowResourceModal(true)
  }

  async function handleResourceSave() {
    if (!org) return
    setResourceSaving(true)
    try {
      const body = {
        title: resourceForm.title.trim(),
        url: resourceForm.url.trim(),
        description: resourceForm.description.trim() || null,
        credential_level_id: resourceForm.credential_level_id || null,
      }

      if (editingResource) {
        const res = await fetch(`/api/organizations/${org.id}/resources/${editingResource.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          alert(err.error || '更新に失敗しました')
          return
        }
      } else {
        const res = await fetch(`/api/organizations/${org.id}/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          alert(err.error || '追加に失敗しました')
          return
        }
      }

      setShowResourceModal(false)
      setResourcesLoaded(false)
      loadResources()
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました')
    } finally {
      setResourceSaving(false)
    }
  }

  async function handleResourceToggle(resource: any) {
    if (!org) return
    try {
      const res = await fetch(`/api/organizations/${org.id}/resources/${resource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !resource.is_active }),
      })
      if (res.ok) {
        setResources(prev => prev.map(r => r.id === resource.id ? { ...r, is_active: !r.is_active } : r))
      }
    } catch (err) {
      console.error('Toggle error:', err)
    }
  }

  async function handleResourceDelete(resource: any) {
    if (!org || !confirm('本当に削除しますか？')) return
    try {
      const res = await fetch(`/api/organizations/${org.id}/resources/${resource.id}`, { method: 'DELETE' })
      if (res.ok) {
        setResources(prev => prev.filter(r => r.id !== resource.id))
      }
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  // オーナー用: リソースをバッジ別グループに変換（sort_order順）
  function getOwnerResourceGroups() {
    const grouped = new Map<string, any[]>()
    for (const r of resources) {
      const key = r.credential_level_id || '__all__'
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(r)
    }
    // 各グループ内をsort_order順にソート
    grouped.forEach(arr => {
      arr.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    })
    const groups: { key: string; badgeName: string; resources: any[] }[] = []
    // 「全メンバー向け」を先頭
    if (grouped.has('__all__')) {
      groups.push({ key: '__all__', badgeName: '全メンバー向け', resources: grouped.get('__all__')! })
    }
    grouped.forEach((res, key) => {
      if (key !== '__all__') {
        const badgeName = res[0]?.credential_level_name || 'バッジ'
        groups.push({ key, badgeName: `${badgeName} 専用`, resources: res })
      }
    })
    return groups
  }

  // リソース並び替え（同グループ内のみ）
  async function moveResource(resourceId: string, direction: 'up' | 'down', groupResources: any[]) {
    if (!org || sortingResourceId) return
    const idx = groupResources.findIndex((r: any) => r.id === resourceId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= groupResources.length) return

    const current = groupResources[idx]
    const swap = groupResources[swapIdx]

    // ローカルstateを即座に更新
    setResources(prev => prev.map(r => {
      if (r.id === current.id) return { ...r, sort_order: swap.sort_order }
      if (r.id === swap.id) return { ...r, sort_order: current.sort_order }
      return r
    }))

    // APIでsort_orderを更新（バックグラウンド）
    setSortingResourceId(resourceId)
    try {
      const [res1, res2] = await Promise.all([
        fetch(`/api/organizations/${org.id}/resources/${current.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: swap.sort_order }),
        }),
        fetch(`/api/organizations/${org.id}/resources/${swap.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: current.sort_order }),
        }),
      ])
      if (!res1.ok || !res2.ok) {
        console.error('Sort order update failed')
        // 失敗時はリロード
        setResourcesLoaded(false)
        loadResources()
      }
    } catch (err) {
      console.error('Sort error:', err)
      setResourcesLoaded(false)
      loadResources()
    } finally {
      setSortingResourceId(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          {org.logo_url ? (
            <img src={org.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
          ) : (
            <div className="w-10 h-10 bg-[#1A1A2E] rounded-lg flex items-center justify-center text-white text-lg font-bold">
              {org.name.charAt(0)}
            </div>
          )}
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
          onClick={handleAnalyticsTab}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
            activeTab === 'analytics'
              ? 'bg-white text-[#1A1A2E] shadow-sm'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          分析
        </button>
        <button
          onClick={handleResourcesTab}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition ${
            activeTab === 'resources'
              ? 'bg-white text-[#1A1A2E] shadow-sm'
              : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          共有資料
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
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#1A1A2E] truncate">
                          {m.professional_name || m.name}
                        </span>
                        {m.top_strength && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FFF8E7] text-[#C4A35A] font-semibold whitespace-nowrap flex-shrink-0">
                            {m.top_strength}
                          </span>
                        )}
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
        analyticsLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-[#C4A35A] border-t-transparent rounded-full mx-auto" />
            <p className="text-gray-400 mt-4 text-sm">分析データを読み込み中...</p>
          </div>
        ) : (
          <>
            {/* バッジ別フィルタ（Fix 3） */}
            {credentialLevels.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => handleBadgeFilter(null)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    selectedBadgeId === null
                      ? 'bg-[#C4A35A] text-white border-[#C4A35A]'
                      : 'bg-white text-gray-600 border-gray-300'
                  }`}
                >
                  全メンバー
                </button>
                {credentialLevels.map((level) => (
                  <button
                    key={level.id}
                    onClick={() => handleBadgeFilter(level.id)}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                      selectedBadgeId === level.id
                        ? 'bg-[#C4A35A] text-white border-[#C4A35A]'
                        : 'bg-white text-gray-600 border-gray-300'
                    }`}
                  >
                    {level.name}
                  </button>
                ))}
              </div>
            )}
            <RechartsCharts
              analytics={{
                ...analytics,
                memberStrengths: (analytics?.memberStrengths || []).map((ms: any) => {
                  const member = members.find((m: any) => m.professional_id === ms.professional_id)
                  return { ...ms, top_strength: member?.top_strength || '' }
                }),
              }}
              strengthDistributionData={strengthChartData}
              topStrengthItems={topStrengthItems}
            />
          </>
        )
      )}

      {/* === 共有資料タブ === */}
      {activeTab === 'resources' && (
        resourcesLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-[#C4A35A] border-t-transparent rounded-full mx-auto" />
            <p className="text-gray-400 mt-4 text-sm">資料を読み込み中...</p>
          </div>
        ) : (
          <>
            <button
              onClick={() => openResourceModal()}
              className="w-full py-3 bg-[#C4A35A] text-white font-medium rounded-xl hover:bg-[#b3944f] transition text-sm mb-6"
            >
              ＋ 資料を追加
            </button>

            {resources.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-sm mb-1">まだ共有資料はありません</p>
                <p className="text-gray-300 text-xs">上のボタンから資料を追加しましょう</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {getOwnerResourceGroups().map(group => (
                  <div key={group.key}>
                    {/* アコーディオンヘッダー */}
                    <button
                      onClick={() => setOwnerAccordionOpen(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 14px', background: '#F3F4F6', borderRadius: 10,
                        border: 'none', cursor: 'pointer', marginBottom: ownerAccordionOpen[group.key] ? 8 : 0,
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>
                        <span style={{ color: '#6B7280', marginRight: 6 }}>{ownerAccordionOpen[group.key] ? '▼' : '▶'}</span>
                        {group.badgeName}
                      </span>
                      <span style={{ fontSize: 13, color: '#9CA3AF' }}>({group.resources.length}件)</span>
                    </button>
                    {/* アコーディオンコンテンツ */}
                    {ownerAccordionOpen[group.key] && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {group.resources.map((r: any, rIdx: number) => (
                          <div key={r.id} style={{
                            display: 'flex', gap: 8, alignItems: 'flex-start',
                          }}>
                            {/* ↑↓ 並び替えボタン */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0, paddingTop: 12 }}>
                              <button
                                onClick={() => moveResource(r.id, 'up', group.resources)}
                                disabled={rIdx === 0 || sortingResourceId === r.id}
                                style={{
                                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'transparent', border: '1px solid #E5E7EB', borderRadius: 6,
                                  cursor: rIdx === 0 ? 'not-allowed' : 'pointer',
                                  color: rIdx === 0 ? '#D1D5DB' : '#6B7280',
                                  fontSize: 14, fontWeight: 700,
                                  transition: 'color 0.2s, border-color 0.2s',
                                }}
                                onMouseEnter={e => { if (rIdx !== 0) { e.currentTarget.style.color = '#1A1A2E'; e.currentTarget.style.borderColor = '#1A1A2E' } }}
                                onMouseLeave={e => { if (rIdx !== 0) { e.currentTarget.style.color = '#6B7280'; e.currentTarget.style.borderColor = '#E5E7EB' } }}
                                title="上へ移動"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => moveResource(r.id, 'down', group.resources)}
                                disabled={rIdx === group.resources.length - 1 || sortingResourceId === r.id}
                                style={{
                                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'transparent', border: '1px solid #E5E7EB', borderRadius: 6,
                                  cursor: rIdx === group.resources.length - 1 ? 'not-allowed' : 'pointer',
                                  color: rIdx === group.resources.length - 1 ? '#D1D5DB' : '#6B7280',
                                  fontSize: 14, fontWeight: 700,
                                  transition: 'color 0.2s, border-color 0.2s',
                                }}
                                onMouseEnter={e => { if (rIdx !== group.resources.length - 1) { e.currentTarget.style.color = '#1A1A2E'; e.currentTarget.style.borderColor = '#1A1A2E' } }}
                                onMouseLeave={e => { if (rIdx !== group.resources.length - 1) { e.currentTarget.style.color = '#6B7280'; e.currentTarget.style.borderColor = '#E5E7EB' } }}
                                title="下へ移動"
                              >
                                ↓
                              </button>
                            </div>
                            {/* リソースカード */}
                            <div style={{
                              flex: 1, background: '#fff', borderRadius: 14, padding: '14px 16px',
                              border: '1px solid #E5E7EB',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                                <h4 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', flex: 1 }}>{r.title}</h4>
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                  <button
                                    onClick={() => openResourceModal(r)}
                                    style={{
                                      fontSize: 12, color: '#9CA3AF', border: '1px solid #E5E7EB',
                                      borderRadius: 6, padding: '2px 8px', background: 'transparent', cursor: 'pointer',
                                      transition: 'color 0.2s, border-color 0.2s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = '#C4A35A'; e.currentTarget.style.borderColor = '#C4A35A' }}
                                    onMouseLeave={e => { e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.borderColor = '#E5E7EB' }}
                                  >
                                    編集
                                  </button>
                                  <button
                                    onClick={() => handleResourceDelete(r)}
                                    style={{
                                      fontSize: 12, color: '#9CA3AF', border: '1px solid #E5E7EB',
                                      borderRadius: 6, padding: '2px 8px', background: 'transparent', cursor: 'pointer',
                                      transition: 'color 0.2s, border-color 0.2s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = '#FCA5A5' }}
                                    onMouseLeave={e => { e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.borderColor = '#E5E7EB' }}
                                  >
                                    削除
                                  </button>
                                </div>
                              </div>
                              <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.url}</p>
                              {r.description && (
                                <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>{r.description}</p>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => handleResourceToggle(r)}
                                  style={{
                                    fontSize: 12, padding: '3px 12px', borderRadius: 20,
                                    border: r.is_active ? '1px solid #BBF7D0' : '1px solid #E5E7EB',
                                    background: r.is_active ? '#F0FDF4' : '#F9FAFB',
                                    color: r.is_active ? '#16A34A' : '#9CA3AF',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                  }}
                                >
                                  {r.is_active ? '● 公開中' : '○ 非公開'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )
      )}

      {/* 資料追加/編集モーダル */}
      {showResourceModal && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
          }}
          onClick={() => setShowResourceModal(false)}
        >
          <div
            style={{
              backgroundColor: '#FAFAF7', borderRadius: '16px',
              padding: '24px', maxWidth: '480px', width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: '#1A1A2E', fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>
              {editingResource ? '資料を編集' : '資料を追加'}
            </h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>
                タイトル <span style={{ color: '#C4A35A' }}>*</span>
              </label>
              <input
                type="text"
                value={resourceForm.title}
                onChange={(e) => setResourceForm(prev => ({ ...prev, title: e.target.value }))}
                maxLength={100}
                placeholder="例: 第3回セミナー動画"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: '1px solid #E5E5E0', fontSize: '14px', color: '#1A1A2E',
                  backgroundColor: '#fff', boxSizing: 'border-box' as const,
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>
                URL <span style={{ color: '#C4A35A' }}>*</span>
              </label>
              <input
                type="url"
                value={resourceForm.url}
                onChange={(e) => setResourceForm(prev => ({ ...prev, url: e.target.value }))}
                maxLength={2000}
                placeholder="https://"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: '1px solid #E5E5E0', fontSize: '14px', color: '#1A1A2E',
                  backgroundColor: '#fff', boxSizing: 'border-box' as const,
                }}
              />
              <p style={{ fontSize: '11px', color: '#AAA', marginTop: '4px' }}>
                ※ https:// で始まるURLを入力
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>
                説明文（任意）
              </label>
              <textarea
                value={resourceForm.description}
                onChange={(e) => setResourceForm(prev => ({ ...prev, description: e.target.value }))}
                maxLength={500}
                rows={3}
                placeholder="資料の説明を入力"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: '1px solid #E5E5E0', fontSize: '14px', color: '#1A1A2E',
                  backgroundColor: '#fff', resize: 'vertical' as const, boxSizing: 'border-box' as const,
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#666', marginBottom: '6px' }}>
                対象バッジ
              </label>
              <select
                value={resourceForm.credential_level_id}
                onChange={(e) => setResourceForm(prev => ({ ...prev, credential_level_id: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: '1px solid #E5E5E0', fontSize: '14px', color: '#1A1A2E',
                  backgroundColor: '#fff', boxSizing: 'border-box' as const,
                }}
              >
                <option value="">全メンバー</option>
                {resourceBadges.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowResourceModal(false)}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: '1px solid #E5E5E0',
                  backgroundColor: '#fff', color: '#666', fontSize: '14px', cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleResourceSave}
                disabled={resourceSaving || !resourceForm.title.trim() || !resourceForm.url.trim() || !resourceForm.url.startsWith('https://')}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: 'none',
                  backgroundColor: '#C4A35A', color: '#fff', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer',
                  opacity: (resourceSaving || !resourceForm.title.trim() || !resourceForm.url.trim() || !resourceForm.url.startsWith('https://')) ? 0.5 : 1,
                }}
              >
                {resourceSaving ? '保存中...' : editingResource ? '更新する' : '追加する'}
              </button>
            </div>
          </div>
        </div>
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

            {/* ロゴ画像 */}
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <div
                onClick={() => logoInputRef.current?.click()}
                style={{
                  width: '80px', height: '80px', borderRadius: '12px',
                  margin: '0 auto 8px', cursor: 'pointer', overflow: 'hidden',
                  position: 'relative', border: '2px dashed #E5E5E0',
                }}
              >
                {editOrgLogoUrl ? (
                  <img src={editOrgLogoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: '100%', height: '100%', backgroundColor: '#1A1A2E',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '28px', fontWeight: 700,
                  }}>
                    {editOrgName.charAt(0) || '?'}
                  </div>
                )}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff',
                  fontSize: '10px', textAlign: 'center', padding: '2px 0',
                }}>
                  {uploadingLogo ? '...' : '📷'}
                </div>
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoFileChange}
                style={{ display: 'none' }}
              />
              <p style={{ fontSize: '11px', color: '#AAA' }}>
                {uploadingLogo ? 'アップロード中...' : 'タップして画像を変更'}
              </p>
            </div>

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

      {/* 画像クロッパー */}
      {cropperSrc && (
        <ImageCropper
          imageSrc={cropperSrc}
          onCropComplete={handleLogoCropComplete}
          onCancel={() => setCropperSrc(null)}
          cropShape="rect"
        />
      )}
    </div>
  )
}
