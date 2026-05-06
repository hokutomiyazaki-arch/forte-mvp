'use client'

import { useEffect, useState } from 'react'
import { PREFECTURES } from '@/lib/prefectures'
import { COLORS, FONTS } from '@/lib/design-tokens'
import { SPECIALIST_THRESHOLD } from '@/lib/constants'
import { isPersonalityV2 } from '@/lib/personality'

const T = { ...COLORS, font: FONTS.main }

const CATEGORIES = [
  { id: 'multi',       label: '✨ おすすめ' },
  { id: 'healing',     label: '痛みや不調を改善したい' },
  { id: 'body',        label: '機能的な体を手に入れたい' },
  { id: 'bodymake',    label: 'ボディメイクしたい' },
  { id: 'performance', label: 'パフォーマンスを上げたい' },
  { id: 'mind',        label: '心を整えたい' },
  { id: 'relax',       label: 'リラックスしたい' },
  { id: 'beauty',      label: '美しくなりたい' },
  { id: 'nutrition',   label: '食事・栄養を改善したい' },
  { id: 'skill',       label: '技術指導を受けたい' },
]

const SUB_CATEGORIES = [
  { id: 'rising',     label: '\uD83D\uDD25 今月急上昇' },
  { id: 'specialist', label: '\u2B50 この分野のプロ' },
  { id: 'repeater',   label: '\uD83D\uDD04 リピーターが多い' },
  { id: 'new_client', label: '\uD83C\uDF0A 新規に強い' },
  { id: 'top',        label: '\uD83C\uDFC6 総合力' },
]

interface ChipItem {
  id: string
  name: string
}

const DEFAULT_VISIBLE_CHIPS = 6

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

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
  firstCount: number
  repeaterCount: number
  voiceSnippet: string | null
  matchedVoice: string | null
  matchedProofLabel: string | null
  matchSource: 'voice' | 'proof' | null
  voiceMatchCount: number
  profileMatchField: 'name' | 'title' | 'area' | 'prefecture' | 'bio' | null
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
  topPersonalitiesByCategory?: {
    inner: { label: string; personality_label: string; votes: number } | null
    interpersonal: { label: string; personality_label: string; votes: number } | null
    atmosphere: { label: string; personality_label: string; votes: number } | null
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
  const [chips, setChips] = useState<ChipItem[]>([])
  const [chipsLoading, setChipsLoading] = useState(true)
  const [chipsExpanded, setChipsExpanded] = useState(false)
  const [activeKeywordId, setActiveKeywordId] = useState<string | null>(null)

  // チップデータ取得（マウント時1回のみ・取得時にシャッフル固定）
  useEffect(() => {
    let cancelled = false
    const loadChips = async () => {
      try {
        const res = await fetch('/api/search/keyword-chips', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const items = (data.chips || []) as ChipItem[]
        setChips(shuffle(items))
      } catch (e) {
        console.error('keyword-chips fetch error:', e)
      } finally {
        if (!cancelled) setChipsLoading(false)
      }
    }
    loadChips()
    return () => { cancelled = true }
  }, [])

  // デバウンス（400ms）
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400)
    return () => clearTimeout(timer)
  }, [query])

  // APIフェッチ（チップ active 時は by-keyword・それ以外は既存 /api/search）
  useEffect(() => {
    const fetchPros = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          category,
          sub: subCategory,
        })
        if (selectedPrefecture) params.set('prefecture', selectedPrefecture)

        let endpoint: string
        if (activeKeywordId) {
          params.set('keyword_id', activeKeywordId)
          endpoint = `/api/search/by-keyword?${params.toString()}`
        } else {
          params.set('q', debouncedQuery)
          endpoint = `/api/search?${params.toString()}`
        }

        const res = await fetch(endpoint, { cache: 'no-store' })
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
  }, [category, subCategory, debouncedQuery, selectedPrefecture, activeKeywordId])

  // 検索ワードハイライト
  const highlightQuery = (text: string) => {
    if (!debouncedQuery || !text) return text
    const idx = text.toLowerCase().indexOf(debouncedQuery.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'none', color: T.gold, fontWeight: 700 }}>
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
        <h1 style={{ fontSize: 20, fontWeight: 800, color: T.dark, marginBottom: 16 }}>プロを探す</h1>

        {/* 説明テキスト */}
        <p style={{ fontSize: 14, color: T.textSub, marginBottom: 8, lineHeight: 1.6 }}>
          クライアントの声で証明されたプロが見つかります。悩みや不調をそのまま入力してみてください。
        </p>

        {/* 統合検索ボックス */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: T.textMuted }}>
            {'\uD83D\uDD0D'}
          </span>
          <input
            type="text"
            value={query}
            onChange={e => {
              const v = e.target.value
              setQuery(v)
              if (v.length > 0 && activeKeywordId) {
                setActiveKeywordId(null)
              }
            }}
            placeholder="悩み・不調・改善したいこと・名前で探す"
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

        {/* キーワードチップセクション(シンプル版・カテゴリ分けなし) */}
        {!chipsLoading && chips.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: T.dark, marginBottom: 10,
            }}>
              人気のキーワード
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(chipsExpanded ? chips : chips.slice(0, DEFAULT_VISIBLE_CHIPS)).map((chip) => {
                const active = activeKeywordId === chip.id
                return (
                  <button
                    key={chip.id}
                    onClick={() => {
                      setActiveKeywordId(chip.id)
                      setQuery('')
                    }}
                    style={{
                      padding: '5px 12px', borderRadius: 16, fontSize: 11, fontWeight: 500,
                      border: 'none',
                      background: active ? T.dark : '#F0EBE0',
                      color: active ? '#fff' : T.dark,
                      cursor: 'pointer', fontFamily: T.font,
                    }}
                  >
                    {chip.name}
                  </button>
                )
              })}
              {!chipsExpanded && chips.length > DEFAULT_VISIBLE_CHIPS && (
                <button
                  onClick={() => setChipsExpanded(true)}
                  style={{
                    padding: '5px 12px', borderRadius: 16, fontSize: 11, fontWeight: 500,
                    border: `1px dashed ${T.cardBorder}`,
                    background: 'transparent', color: T.textSub,
                    cursor: 'pointer', fontFamily: T.font,
                  }}
                >
                  もっと見る (+{chips.length - DEFAULT_VISIBLE_CHIPS})
                </button>
              )}
            </div>
          </div>
        )}

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
                  href={debouncedQuery && p.voiceMatchCount >= 1
                    ? `/card/${p.id}?tab=voices&highlight=${encodeURIComponent(debouncedQuery)}`
                    : `/card/${p.id}`
                  }
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
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: T.dark }}>
                          {debouncedQuery && p.profileMatchField === 'name' ? highlightQuery(p.name) : p.name}
                        </div>
                        {(p.recentProofs || 0) > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0, color: T.textSub }}>
                            {(p.recentProofs || 0) >= 15 ? '\uD83D\uDD25' : '\uD83D\uDFE2'} 今月 {p.recentProofs}人に評価されています
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: T.gold, fontWeight: 600, marginTop: 1 }}>
                        {debouncedQuery && p.profileMatchField === 'title' ? highlightQuery(p.title) : p.title}
                      </div>
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                        {debouncedQuery && p.profileMatchField === 'prefecture' ? highlightQuery(p.prefecture || '') : p.prefecture}
                        {p.area_description ? ` · ` : ''}
                        {p.area_description && debouncedQuery && p.profileMatchField === 'area'
                          ? highlightQuery(p.area_description)
                          : p.area_description || ''}
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
                        <span style={{ fontSize: 12 }}>{proof.votes >= SPECIALIST_THRESHOLD ? '🏆' : '\u2B50'}</span>
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
                  {(() => {
                    if (isPersonalityV2()) {
                      const cats = p.topPersonalitiesByCategory
                      if (!cats) return null
                      const labels: string[] = []
                      if (cats.inner) labels.push(cats.inner.personality_label || cats.inner.label)
                      if (cats.interpersonal) labels.push(cats.interpersonal.personality_label || cats.interpersonal.label)
                      if (cats.atmosphere) labels.push(cats.atmosphere.personality_label || cats.atmosphere.label)
                      if (labels.length === 0) return null
                      return (
                        <div style={{
                          marginTop: 6, fontSize: 12, color: T.textSub, fontWeight: 600,
                        }}>
                          {'\uD83D\uDCAC'} {labels.join(' × ')}
                        </div>
                      )
                    }
                    if (p.topPersonality) {
                      return (
                        <div style={{
                          marginTop: 6, fontSize: 12, color: T.textSub, fontWeight: 600,
                        }}>
                          {'\uD83D\uDCAC'} {p.topPersonality.label}
                        </div>
                      )
                    }
                    return null
                  })()}

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

                  {/* 検索マッチ（Dパターン） */}
                  {debouncedQuery && p.voiceMatchCount >= 1 && p.matchedVoice && (
                    <div style={{
                      marginTop: 10, background: '#1A1A2E', borderRadius: 12,
                      padding: '1rem 1.25rem',
                    }}>
                      <p style={{
                        fontSize: 11, color: T.gold, fontWeight: 500,
                        letterSpacing: '0.06em', margin: '0 0 6px',
                      }}>
                        {'\uD83D\uDCAC'} VOICE MATCH
                      </p>
                      <p style={{
                        fontSize: 17, fontWeight: 500, color: '#FAFAF7',
                        lineHeight: 1.5, margin: '0 0 6px',
                      }}>
                        {highlightQuery(p.matchedVoice)}
                      </p>
                      <a
                        href={`/card/${p.id}?tab=voices&highlight=${encodeURIComponent(debouncedQuery)}`}
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 12, color: 'rgba(250,250,247,0.5)', textDecoration: 'none' }}
                      >
                        続きはプロフィールで →
                      </a>
                    </div>
                  )}
                  {debouncedQuery && p.matchSource === 'proof' && p.matchedProofLabel && (
                    <div style={{ marginTop: 8, fontSize: 11, color: T.textSub, lineHeight: 1.5 }}>
                      <span>{'\uD83D\uDD0D'} 「{highlightQuery(p.matchedProofLabel)}」にマッチ</span>
                    </div>
                  )}

                  {/* CLIENT COMPOSITION バー */}
                  {(() => {
                    const total = (p.firstCount || 0) + (p.repeaterCount || 0) + (p.regularCount || 0)
                    if (total < 3) return null
                    const firstPct = Math.round(((p.firstCount || 0) / total) * 100)
                    const repeaterPct = Math.round(((p.repeaterCount || 0) / total) * 100)
                    const regularPct = 100 - firstPct - repeaterPct
                    return (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ background: '#E8E0D0', width: `${firstPct}%` }} />
                          <div style={{ background: '#C4A35A', width: `${repeaterPct}%` }} />
                          <div style={{ background: '#1A1A2E', width: `${regularPct}%` }} />
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: T.textMuted }}>
                          <span>{'\u25CB'} 初回 {p.firstCount || 0}人</span>
                          <span style={{ color: '#C4A35A' }}>{'\u25CF'} リピーター {p.repeaterCount || 0}人</span>
                          <span style={{ color: '#1A1A2E' }}>{'\u25CF'} 常連 {p.regularCount || 0}人</span>
                        </div>
                      </div>
                    )
                  })()}

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
