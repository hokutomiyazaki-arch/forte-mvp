'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { PREFECTURES } from '@/lib/prefectures'
import { COLORS, FONTS } from '@/lib/design-tokens'

const T = { ...COLORS, font: FONTS.main, fontMono: FONTS.mono }

interface ProData {
  id: string
  name: string
  title: string
  photo_url: string | null
  prefecture: string | null
  area_description: string | null
  is_online_available: boolean
  is_founding_member: boolean
}

export default function SearchPage() {
  const supabase = createClient()
  const [pros, setPros] = useState<ProData[]>([])
  const [voteSummary, setVoteSummary] = useState<any[]>([])
  const [proofItems, setProofItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // フィルタ
  const [searchName, setSearchName] = useState('')
  const [selectedPrefecture, setSelectedPrefecture] = useState('')

  useEffect(() => {
    async function load() {
      const [prosRes, voteRes, proofRes] = await Promise.all([
        (supabase as any).from('professionals')
          .select('id, name, title, photo_url, prefecture, area_description, is_online_available, is_founding_member')
          .not('name', 'is', null).neq('name', '').is('deactivated_at', null),
        (supabase as any).from('vote_summary')
          .select('professional_id, proof_id, vote_count')
          .order('vote_count', { ascending: false }),
        (supabase as any).from('proof_items').select('id, label'),
      ])
      if (prosRes.data) setPros(prosRes.data)
      if (voteRes.data) setVoteSummary(voteRes.data)
      if (proofRes.data) setProofItems(proofRes.data)
      setLoading(false)
    }
    load()
  }, [])

  // ラベルマップ
  const proofLabelMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const pi of proofItems) m.set(pi.id, pi.label)
    return m
  }, [proofItems])

  // プロごとのトップ2プルーフ
  const topProofsByPro = useMemo(() => {
    const m = new Map<string, { label: string; count: number }[]>()
    for (const v of voteSummary) {
      const label = proofLabelMap.get(v.proof_id)
      if (!label) continue
      const arr = m.get(v.professional_id) || []
      if (arr.length < 2) {
        arr.push({ label, count: v.vote_count })
        m.set(v.professional_id, arr)
      }
    }
    return m
  }, [voteSummary, proofLabelMap])

  // フィルタ適用
  const filteredPros = useMemo(() => {
    return pros.filter(p => {
      if (searchName && !p.name.toLowerCase().includes(searchName.toLowerCase())) return false
      if (selectedPrefecture && p.prefecture !== selectedPrefecture) return false
      return true
    })
  }, [pros, searchName, selectedPrefecture])

  if (loading) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: T.textMuted, fontSize: 14 }}>読み込み中...</div>
      </div>
    )
  }

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: T.font }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>

        {/* ヘッダー */}
        <h1 style={{ fontSize: 20, fontWeight: 800, color: T.dark, marginBottom: 4 }}>プロを探す</h1>
        <p style={{ fontSize: 12, color: T.textSub, marginBottom: 16 }}>プルーフで、あなたに合うプロを見つけよう</p>

        {/* 検索バー */}
        <input
          type="text"
          value={searchName}
          onChange={e => setSearchName(e.target.value)}
          placeholder="名前で検索"
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 12, border: `1px solid ${T.cardBorder}`,
            background: T.cardBg, fontSize: 13, fontFamily: T.font, outline: 'none',
            boxSizing: 'border-box', marginBottom: 12,
          }}
        />

        {/* 都道府県チップフィルター */}
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 16,
          scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
        }}>
          <button
            onClick={() => setSelectedPrefecture('')}
            style={{
              flexShrink: 0, padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
              border: selectedPrefecture === '' ? 'none' : `1px solid ${T.cardBorder}`,
              background: selectedPrefecture === '' ? T.dark : T.cardBg,
              color: selectedPrefecture === '' ? '#fff' : T.textSub,
              cursor: 'pointer', fontFamily: T.font, scrollSnapAlign: 'start',
            }}
          >
            すべて
          </button>
          {PREFECTURES.map(pref => (
            <button
              key={pref}
              onClick={() => setSelectedPrefecture(pref)}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                border: selectedPrefecture === pref ? 'none' : `1px solid ${T.cardBorder}`,
                background: selectedPrefecture === pref ? T.dark : T.cardBg,
                color: selectedPrefecture === pref ? '#fff' : T.textSub,
                cursor: 'pointer', fontFamily: T.font, scrollSnapAlign: 'start',
              }}
            >
              {pref}
            </button>
          ))}
        </div>

        {/* プロ一覧 */}
        {filteredPros.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: T.textMuted, fontSize: 13 }}>
            該当するプロが見つかりません
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredPros.map(p => {
              const topProofs = topProofsByPro.get(p.id) || []
              return (
                <a
                  key={p.id}
                  href={`/card/${p.id}`}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14,
                    padding: 14, textDecoration: 'none', transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = T.gold)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = T.cardBorder)}
                >
                  {/* 写真 */}
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.name}
                      style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%', background: T.dark,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 18, fontWeight: 'bold', flexShrink: 0,
                    }}>
                      {p.name.charAt(0)}
                    </div>
                  )}

                  {/* 情報 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: T.dark }}>{p.name}</span>
                      {p.is_founding_member && (
                        <span style={{
                          fontSize: 9, padding: '1px 6px', background: T.gold, color: '#fff',
                          borderRadius: 99, fontWeight: 600,
                        }}>FM</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: T.gold, fontWeight: 600, marginTop: 2 }}>{p.title}</div>
                    <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                      {p.prefecture}{p.area_description ? ` · ${p.area_description}` : ''}
                      {p.is_online_available && <span style={{ marginLeft: 4, color: T.gold }}>● オンライン</span>}
                    </div>

                    {/* トッププルーフチップ */}
                    {topProofs.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {topProofs.map((tp, i) => (
                          <span key={i} style={{
                            fontSize: 11, color: T.gold, background: `${T.gold}10`,
                            borderRadius: 99, padding: '2px 8px', fontWeight: 500,
                            whiteSpace: 'nowrap',
                          }}>
                            {tp.label} <span style={{ fontWeight: 'bold', fontFamily: T.fontMono }}>{tp.count}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </a>
              )
            })}
          </div>
        )}

        {/* フッター */}
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1A2E', letterSpacing: '2px' }}>REALPROOF</div>
          <div style={{ fontSize: 10, color: '#888888', marginTop: 4 }}>強みが、あなたを定義する。</div>
        </div>
      </div>
    </div>
  )
}
