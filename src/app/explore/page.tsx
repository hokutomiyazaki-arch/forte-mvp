'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { PREFECTURES } from '@/lib/prefectures'

const CATEGORY_TABS: { key: string; label: string }[] = [
  { key: 'all', label: '総合' },
  { key: 'basic', label: '基本' },
  { key: 'body_pro', label: 'ボディプロ' },
  { key: 'yoga', label: 'ヨガ' },
  { key: 'pilates', label: 'ピラティス' },
  { key: 'esthe', label: 'エステ' },
  { key: 'sports', label: 'スポーツ' },
  { key: 'education', label: '教育' },
  { key: 'specialist', label: 'スペシャリスト' },
]

export default function ExplorePage() {
  const supabase = createClient()

  // データ
  const [pros, setPros] = useState<any[]>([])
  const [voteSummary, setVoteSummary] = useState<any[]>([])
  const [proofItems, setProofItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // フィルタ
  const [searchName, setSearchName] = useState('')
  const [selectedPrefecture, setSelectedPrefecture] = useState('')
  const [onlineOnly, setOnlineOnly] = useState(false)

  // タブ・展開
  const [selectedTab, setSelectedTab] = useState('all')
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  // デバッグ: ?debug=1 の時のみ通信テスト実行
  useEffect(() => {
    const isDebug = new URLSearchParams(window.location.search).has('debug')
    setShowDebug(isDebug)
    if (!isDebug) return
    const el = document.getElementById('debug-bar-explore')
    if (el) el.textContent = 'test started...'

    const anonKey = (supabase as any).supabaseKey
      || (supabase as any).rest?.headers?.apikey
      || (supabase as any).realtime?.params?.apikey
      || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      || ''

    fetch('https://www.google.com/favicon.ico', { mode: 'no-cors' })
      .then(() => {
        if (el) el.textContent = `google OK (key=${anonKey ? anonKey.substring(0, 10) : 'NONE'}), testing supabase...`
        const start = Date.now()
        return fetch(
          'https://eikzgzqnydptpqjwxbfu.supabase.co/rest/v1/professionals?select=id&limit=1',
          {
            method: 'GET',
            headers: {
              'apikey': anonKey,
              'Authorization': 'Bearer ' + anonKey,
            }
          }
        ).then(res => {
          const elapsed = Date.now() - start
          if (el) el.textContent = `supabase: ${res.status} in ${elapsed}ms | key=${anonKey ? anonKey.substring(0, 10) : 'NONE'}`
        })
      })
      .catch(err => {
        if (el) el.textContent = `error: ${err.message} | key=${anonKey ? anonKey.substring(0, 10) : 'NONE'}`
      })
  }, [])

  // データ取得（1回のみ）
  useEffect(() => {
    async function load() {
      const [prosRes, voteRes, proofRes] = await Promise.all([
        supabase.from('professionals').select('*') as any,
        supabase.from('vote_summary').select('*') as any,
        supabase.from('proof_items').select('*') as any,
      ])
      if (prosRes.data) setPros(prosRes.data)
      if (voteRes.data) setVoteSummary(voteRes.data)
      if (proofRes.data) setProofItems(proofRes.data)
      setLoading(false)
    }
    load()
  }, [])

  // proof_items の ID セット
  const proofItemIdSet = useMemo(() => new Set(proofItems.map(p => p.id)), [proofItems])

  // カスタム項目のラベル取得
  function getCustomProofLabel(proofId: string): string {
    for (const p of pros) {
      const cp = (p.custom_proofs || []).find((c: any) => c.id === proofId)
      if (cp) return cp.label
    }
    return '独自の強み'
  }

  // 1. フィルタされたプロ
  const filteredPros = useMemo(() => {
    return pros.filter(p => {
      if (searchName && !p.name.toLowerCase().includes(searchName.toLowerCase())) return false
      if (selectedPrefecture && p.prefecture !== selectedPrefecture) return false
      if (onlineOnly && !p.is_online_available) return false
      return true
    })
  }, [pros, searchName, selectedPrefecture, onlineOnly])

  const filteredProIds = useMemo(() => new Set(filteredPros.map(p => p.id)), [filteredPros])

  // 2. フィルタされた voteSummary
  const filteredVotes = useMemo(() => {
    return voteSummary.filter(v => filteredProIds.has(v.professional_id))
  }, [voteSummary, filteredProIds])

  // 3. タブに応じた対象 proof_id
  const targetProofIds = useMemo(() => {
    if (selectedTab === 'all') {
      return null // フィルタなし
    }
    if (selectedTab === 'specialist') {
      return new Set(filteredVotes.map(v => v.proof_id).filter(id => !proofItemIdSet.has(id)))
    }
    return new Set(proofItems.filter(p => p.tab === selectedTab).map(p => p.id))
  }, [selectedTab, proofItems, filteredVotes, proofItemIdSet])

  // 4. 項目ごとの集計（レベル2表示用）
  const itemRankings = useMemo(() => {
    const targetVotes = targetProofIds
      ? filteredVotes.filter(v => targetProofIds.has(v.proof_id))
      : filteredVotes

    const totals = new Map<string, number>()
    for (const v of targetVotes) {
      totals.set(v.proof_id, (totals.get(v.proof_id) || 0) + v.vote_count)
    }

    const items = Array.from(totals.entries()).map(([proofId, total]) => ({
      proofId,
      label: proofItemIdSet.has(proofId)
        ? proofItems.find(p => p.id === proofId)?.label || '-'
        : getCustomProofLabel(proofId),
      totalVotes: total,
      isCustom: !proofItemIdSet.has(proofId),
    }))

    items.sort((a, b) => b.totalVotes - a.totalVotes)
    return items.filter(i => i.totalVotes > 0)
  }, [filteredVotes, targetProofIds, proofItems, proofItemIdSet, pros])

  // 5. 展開中の項目に対するプロカード一覧（レベル3表示用）
  const expandedPros = useMemo(() => {
    if (!expandedItem) return []
    return filteredVotes
      .filter(v => v.proof_id === expandedItem)
      .sort((a, b) => b.vote_count - a.vote_count)
      .map(v => ({
        pro: filteredPros.find(p => p.id === v.professional_id),
        voteCount: v.vote_count,
      }))
      .filter(entry => entry.pro)
  }, [expandedItem, filteredVotes, filteredPros])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">
        読み込み中...
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* デバッグバー: ?debug=1 の時のみ表示 */}
      {showDebug && (
        <div id="debug-bar-explore"
          style={{position:'fixed',bottom:'60px',left:0,right:0,background:'blue',color:'white',textAlign:'center',padding:'4px',zIndex:9999,fontSize:'12px'}}>
          DB test: waiting...
        </div>
      )}
      {/* ヘッダー */}
      <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">プロを探す</h1>
      <p className="text-sm text-gray-500 mb-6">プルーフで、あなたに合うプロを見つけよう</p>

      {/* 名前検索 */}
      <input
        type="text"
        value={searchName}
        onChange={e => setSearchName(e.target.value)}
        placeholder="名前で検索"
        className="w-full px-4 py-3 bg-[#FAFAF7] border border-[#E5E7EB] rounded-xl text-sm mb-4 outline-none focus:ring-2 focus:ring-[#C4A35A]"
      />

      {/* 都道府県 + オンライン */}
      <div className="flex gap-3 mb-6">
        <select
          value={selectedPrefecture}
          onChange={e => setSelectedPrefecture(e.target.value)}
          className="flex-1 px-3 py-2 bg-[#FAFAF7] border border-[#E5E7EB] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#C4A35A]"
        >
          <option value="">全国</option>
          {PREFECTURES.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={onlineOnly}
            onChange={e => setOnlineOnly(e.target.checked)}
            className="w-4 h-4 accent-[#C4A35A]"
          />
          オンライン対応
        </label>
      </div>

      {/* カテゴリタブ */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
        {CATEGORY_TABS.map(cat => (
          <button
            key={cat.key}
            onClick={() => { setSelectedTab(cat.key); setExpandedItem(null) }}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
              selectedTab === cat.key
                ? 'bg-[#1A1A2E] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 強み項目リスト */}
      {itemRankings.length === 0 ? (
        <p className="text-center text-gray-400 py-12">まだプルーフがありません</p>
      ) : (
        <div className="space-y-3">
          {itemRankings.map(item => {
            const isExpanded = expandedItem === item.proofId
            return (
              <div key={item.proofId}>
                {/* レベル2: 項目行 */}
                <div
                  onClick={() => setExpandedItem(isExpanded ? null : item.proofId)}
                  className={`flex items-center justify-between p-4 cursor-pointer transition ${
                    isExpanded
                      ? 'bg-white rounded-xl shadow-sm border-l-4 border-[#C4A35A]'
                      : 'bg-white rounded-xl shadow-sm hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-400 text-xs">{isExpanded ? '▼' : '▶'}</span>
                    <span className="text-sm font-medium text-[#1A1A2E] truncate">{item.label}</span>
                  </div>
                  <span className="text-[#C4A35A] font-bold text-sm ml-4 flex-shrink-0">{item.totalVotes}票</span>
                </div>

                {/* レベル3: プロカード一覧 */}
                {isExpanded && (
                  <div className="mt-2 space-y-2">
                    {expandedPros.map(({ pro, voteCount }) => (
                      <a
                        key={pro.id}
                        href={`/card/${pro.id}`}
                        className="flex items-center gap-3 bg-[#FAFAF7] rounded-lg p-3 ml-4 hover:bg-gray-100 transition"
                      >
                        {/* 写真 or イニシャル */}
                        {pro.photo_url ? (
                          <img src={pro.photo_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#1A1A2E] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                            {pro.name.charAt(0)}
                          </div>
                        )}
                        {/* 情報 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-[#1A1A2E]">{pro.name}</span>
                            {pro.is_founding_member && (
                              <span className="text-xs px-1.5 py-0.5 bg-[#C4A35A] text-white rounded-full leading-none">FM</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {[pro.title, pro.prefecture, pro.is_online_available ? 'オンライン対応' : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                        {/* 票数 */}
                        <span className="text-[#C4A35A] font-bold text-sm flex-shrink-0">{voteCount}票</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
