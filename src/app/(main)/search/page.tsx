'use client'

import { useEffect, useState } from 'react'
import { PREFECTURES } from '@/lib/prefectures'
import { COLORS, FONTS } from '@/lib/design-tokens'

const T = { ...COLORS, font: FONTS.main }

const CATEGORIES = [
  { id: 'multi',       label: '\uD83C\uDF10 マルチスペシャリスト' },
  { id: 'healing',     label: '痛みを治したい' },
  { id: 'body',        label: '体を変えたい' },
  { id: 'bodymake',    label: 'ボディメイクしたい' },
  { id: 'performance', label: '動きを高めたい' },
  { id: 'mind',        label: '心を整えたい' },
  { id: 'beauty',      label: '美しくなりたい' },
  { id: 'nutrition',   label: '栄養状態を改善したい' },
  { id: 'relax',       label: '癒されたい' },
  { id: 'skill',       label: '指導力を高めたい' },
]

const SUB_CATEGORIES = [
  { id: 'rising',     label: '\uD83D\uDD25 今月急上昇' },
  { id: 'specialist', label: '\u2B50 この分野のプロ' },
  { id: 'repeater',   label: '\uD83D\uDD04 リピーターが多い' },
  { id: 'top',        label: '\uD83C\uDFC6 総合力' },
]

interface SearchPro {
  id: string
  name: string
  title: string
  prefecture: string | null
  area_description: string | null
  photo_url: string | null
  totalProofs: number
  recentProofs: number
  categoryScore: number
  categoryCount: Record<string, number>
  badges: {
    rising: boolean
    specialist: boolean
    multi: boolean
    top: boolean
  }
  repeaterRate: number | null
  regularCount: number
  voiceSnippet: string | null
  matchedVoice: string | null
  matchedProofLabel: string | null
  matchSource: 'voice' | 'proof' | null
  featuredProof: {
    strengthLabel: string
    label: string
    votes: number
  } | null
  categoryTopProof: {
    strengthLabel: string
    votes: number
  } | null
  topPersonality: {
    label: string
  } | null
}

export default function SearchPage() {
  const [category, setCategory] = useState('multi')
  const [subCategory, setSubCategory] = useState('rising')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedPrefecture, setSelectedPrefecture] = useState('')
  const [professionals, setProfessionals] = useState<SearchPro[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  // デバウンス（400ms）
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400)
    return () => clearTimeout(timer)
  }, [query])

  // APIフェッチ
  useEffect(() => {
    const fetchPros = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          category,
          sub: subCategory,
          q: debouncedQuery,
        })
        if (selectedPrefecture) params.set('prefecture', selectedPrefecture)
        const res = await fetch(`/api/search?${params}`)
        const data = await res.json()
        setProfessionals(data.professionals || [])
        setTotal(data.total || 0)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    fetchPros()
  }, [category, subCategory, debouncedQuery, selectedPrefecture])

  // 検索ワードハイライト
  const highlightQuery = (text: string) => {
    if (!debouncedQuery || !text) return text
    const idx = text.indexOf(debouncedQuery)
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'rgba(196,163,90,0.13)', color: T.gold, padding: '0 1px' }}>
          {text.slice(idx, idx + debouncedQuery.length)}
        </mark>
        {text.slice(idx + debouncedQuery.length)}
      </>
    )
  }

  // 空状態メッセージ
  const getEmptyMessage = () => {
    if (subCategory === 'rising') {
      return '今月はまだ集計中です。「この分野のプロ」を見てみましょう'
    }
    return '該当するプロが見つかりませんでした'
  }

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: T.font }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>

        {/* ヘッダー */}
        <h1 style={{ fontSize: 20, fontWeight: 800, color: T.dark, marginBottom: 4 }}>プロを探す</h1>
        <p style={{ fontSize: 12, color: T.textSub, marginBottom: 16 }}>プルーフで、あなたに合うプロを見つけよう</p>

        {/* 統合検索ボックス */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: T.textMuted }}>
            {'\uD83D\uDD0D'}
          </span>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="腰痛、産後ケア、田中さくら…"
            style={{
              width: '100%', padding: '10px 36px 10px 36px', borderRadius: 12,
              border: `1px solid ${T.cardBorder}`, background: T.cardBg,
              fontSize: 13, fontFamily: T.font, outline: 'none', boxSizing: 'border-box',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', fontSize: 16, color: T.textMuted,
                cursor: 'pointer', padding: 0, lineHeight: 1,
              }}
            >
              {'\u2715'}
            </button>
          )}
        </div>

        {/* カテゴリタブ（横スクロール） */}
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 8,
          scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
        }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                border: category === cat.id ? 'none' : `1px solid ${T.cardBorder}`,
                background: category === cat.id ? T.dark : T.cardBg,
                color: category === cat.id ? '#fff' : T.dark,
                cursor: 'pointer', fontFamily: T.font, scrollSnapAlign: 'start',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* サブカテゴリ（カテゴリ選択時のみ表示、multi/noneでは非表示） */}
        {category !== 'none' && category !== 'multi' && (
          <div style={{
            display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 8, marginBottom: 12,
          }}>
            {SUB_CATEGORIES.map(sub => (
              <button
                key={sub.id}
                onClick={() => setSubCategory(sub.id)}
                style={{
                  flexShrink: 0, padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: subCategory === sub.id ? `1.5px solid ${T.gold}` : `1px solid ${T.cardBorder}`,
                  background: T.cardBg,
                  color: subCategory === sub.id ? T.gold : T.textMuted,
                  cursor: 'pointer', fontFamily: T.font,
                }}
              >
                {sub.label}
              </button>
            ))}
          </div>
        )}

        {/* 都道府県プルダウン */}
        <div style={{ marginBottom: 12 }}>
          <select
            value={selectedPrefecture}
            onChange={e => setSelectedPrefecture(e.target.value)}
            style={{
              padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.cardBorder}`,
              background: T.cardBg, fontSize: 12, fontFamily: T.font,
              color: selectedPrefecture ? T.dark : T.textMuted, cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">すべてのエリア</option>
            {PREFECTURES.map(pref => (
              <option key={pref} value={pref}>{pref}</option>
            ))}
          </select>
        </div>

        {/* 結果カウント */}
        {!loading && (
          <div style={{ fontSize: 11, color: T.textSub, marginBottom: 10, fontWeight: 500 }}>
            {total}名のプロが見つかりました
          </div>
        )}

        {/* プロ一覧 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: T.textMuted, fontSize: 14 }}>
            読み込み中...
          </div>
        ) : professionals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: T.textMuted, fontSize: 13 }}>
            {getEmptyMessage()}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {professionals.map((p) => (
                <a
                  key={p.id}
                  href={`/card/${p.id}`}
                  style={{
                    display: 'block', background: T.cardBg,
                    border: `1px solid ${T.cardBorder}`, borderRadius: 14,
                    padding: 14, textDecoration: 'none', transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = T.gold)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = T.cardBorder)}
                >
                  {/* アイコン + 名前 + 職種 + エリア */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.name}
                        style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{
                        width: 48, height: 48, borderRadius: '50%', background: T.dark,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 18, fontWeight: 'bold', flexShrink: 0,
                      }}>
                        {p.name?.charAt(0)}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: T.dark }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: T.gold, fontWeight: 600, marginTop: 1 }}>{p.title}</div>
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                        {p.prefecture}{p.area_description ? ` · ${p.area_description}` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Featured Proof（カテゴリ別 or デフォルト） */}
                  {(() => {
                    const proof = (category !== 'multi' && p.categoryTopProof) || p.featuredProof
                    if (!proof) return null
                    return (
                      <div style={{
                        marginTop: 10, padding: '6px 10px', background: 'rgba(196,163,90,0.06)',
                        borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{ fontSize: 12 }}>{'\u2B50'}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.dark }}>
                          {proof.strengthLabel}
                        </span>
                        <span style={{ fontSize: 10, color: T.gold, fontWeight: 600 }}>
                          ({proof.votes}票)
                        </span>
                      </div>
                    )
                  })()}

                  {/* パーソナリティTOP */}
                  {p.topPersonality && (
                    <div style={{
                      marginTop: 6, fontSize: 12, color: T.textSub, fontWeight: 600,
                    }}>
                      {'\uD83D\uDCAC'} {p.topPersonality.label}
                    </div>
                  )}

                  {/* Voiceスニペット */}
                  {p.voiceSnippet && (
                    <div style={{
                      marginTop: 10, padding: '8px 12px', background: '#F9F7F3',
                      borderRadius: 8, borderLeft: `3px solid ${T.gold}`,
                    }}>
                      <div style={{ fontSize: 11, color: T.text, lineHeight: 1.6 }}>
                        &ldquo;{p.voiceSnippet}&rdquo;
                      </div>
                      <div style={{ fontSize: 10, color: T.gold, marginTop: 4, fontWeight: 600 }}>
                        続きはプロフィールで →
                      </div>
                    </div>
                  )}

                  {/* 検索ハイライト */}
                  {debouncedQuery && p.matchSource && (
                    <div style={{ marginTop: 8, fontSize: 11, color: T.textSub, lineHeight: 1.5 }}>
                      {p.matchSource === 'voice' && p.matchedVoice && (
                        <a
                          href={`/card/${p.id}?tab=voices&highlight=${encodeURIComponent(debouncedQuery)}`}
                          onClick={e => e.stopPropagation()}
                          style={{ textDecoration: 'none', color: T.textSub, display: 'block' }}
                        >
                          <span>{'\uD83D\uDCAC'} 「{highlightQuery(p.matchedVoice)}」</span>
                          <span style={{ fontSize: 10, color: T.gold, marginLeft: 6, fontWeight: 600 }}>
                            続きはプロフィールで →
                          </span>
                        </a>
                      )}
                      {p.matchSource === 'proof' && p.matchedProofLabel && (
                        <span>{'\uD83D\uDD0D'} 「{highlightQuery(p.matchedProofLabel)}」にマッチ</span>
                      )}
                    </div>
                  )}

                  {/* メトリクス行 */}
                  <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {p.recentProofs >= 1 && (
                      <span style={{ fontSize: 11, color: '#2E7D32', fontWeight: 600 }}>
                        {'\uD83D\uDFE2'} 今月 {p.recentProofs} プルーフ獲得中
                      </span>
                    )}
                    {p.regularCount > 0 && (
                      <span style={{ fontSize: 11, color: T.gold, fontWeight: 600 }}>
                        {'\u2728'} 常連 {p.regularCount}名
                      </span>
                    )}
                    {p.repeaterRate !== null && (
                      <span style={{ fontSize: 11, color: T.textSub, fontWeight: 500 }}>
                        {'\uD83D\uDD04'} リピーター率 {p.repeaterRate}%
                      </span>
                    )}
                  </div>

                  {/* プルーフ総数 */}
                  {p.totalProofs > 0 && (
                    <div style={{ marginTop: 6, fontSize: 10, color: T.textMuted }}>
                      プルーフ {p.totalProofs}件
                    </div>
                  )}
                </a>
            ))}
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
