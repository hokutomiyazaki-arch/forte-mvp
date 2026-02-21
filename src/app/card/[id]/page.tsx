'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getSessionSafe } from '@/lib/auth-helper'
import { Professional, VoteSummary, Vote } from '@/lib/types'
import { resolveProofLabels, resolvePersonalityLabels } from '@/lib/proof-labels'
import { COLORS, FONTS } from '@/lib/design-tokens'
// VoiceShareModal removed — public card is view-only
import RelatedPros from '@/components/RelatedPros'

// デザイントークンのローカルショートカット
const T = {
  ...COLORS,
  font: FONTS.main,
  fontMono: FONTS.mono,
  fontSerif: FONTS.serif,
}

// バッジ階層: FNTはBDCの上位資格。同レベルのFNTを持っていたらBDCは非表示
const BADGE_ORDER: Record<string, number> = {
  'bdc-elite': 1,
  'fnt-basic': 2,
  'bdc-pro': 3,
  'fnt-advance': 4,
  'bdc-legend': 5,
  'fnt-master': 6,
}

const BDC_TO_FNT_UPGRADE: Record<string, string> = {
  'bdc-elite': 'fnt-basic',
  'bdc-pro': 'fnt-advance',
  'bdc-legend': 'fnt-master',
}

function filterAndSortBadges(badges: { id: string; label: string; image_url: string }[]) {
  if (!badges || badges.length === 0) return []
  const ids = new Set(badges.map(b => b.id))
  const filtered = badges.filter(b => {
    const upgradeId = BDC_TO_FNT_UPGRADE[b.id]
    if (upgradeId && ids.has(upgradeId)) return false
    return true
  })
  filtered.sort((a, b) => (BADGE_ORDER[a.id] || 99) - (BADGE_ORDER[b.id] || 99))
  return filtered
}

// FNTバッジのリンクURL判定
const FNT_BADGE_IDS = new Set(['fnt-basic', 'fnt-advance', 'fnt-master', 'tbu'])
const FNT_WORKSHOP_URL = 'https://functional.neuro-training.jp/workshop/'

function getBadgeUrl(badgeId: string): string | null {
  return FNT_BADGE_IDS.has(badgeId) ? FNT_WORKSHOP_URL : null
}

// バーの色（ランク順）
function getBarColor(rank: number): string {
  if (rank === 0) return '#C4A35AFF'
  if (rank === 1) return '#C4A35ACC'
  if (rank === 2) return '#C4A35A99'
  return '#C4A35A55'
}

// SVGリングチャート
function RingChart({ label, count, max, size = 76 }: { label: string; count: number; max: number; size?: number }) {
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const pct = max > 0 ? count / max : 0
  const offset = circumference * (1 - pct)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#F0EDE6" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={T.gold} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1.2s ease' }}
        />
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
          fill={T.gold} fontSize="18" fontWeight="bold" fontFamily={T.fontMono}>
          {count}
        </text>
      </svg>
      <div style={{ fontSize: 11, fontWeight: 'bold', color: T.text, textAlign: 'center', marginTop: 6, lineHeight: 1.3 }}>
        {label}
      </div>
    </div>
  )
}

export default function CardPage() {
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()
  const [pro, setPro] = useState<Professional | null>(null)
  const [votes, setVotes] = useState<VoteSummary[]>([])
  const [personalityVotes, setPersonalityVotes] = useState<{ category: string; vote_count: number }[]>([])
  const [comments, setComments] = useState<Vote[]>([])
  const [totalVotes, setTotalVotes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'strengths' | 'certs' | 'voices'>('strengths')
  const [animated, setAnimated] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [bookmarkLoading, setBookmarkLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [bookmarkCount, setBookmarkCount] = useState(0)
  const [orgs, setOrgs] = useState<{id: string; name: string; type: string}[]>([])

  useEffect(() => {
    async function load() {
      const { data: proData } = await supabase
        .from('professionals').select('*').eq('id', id).maybeSingle() as any
      if (proData) setPro(proData)

      const { data: rawVoteData } = await supabase
        .from('vote_summary').select('*').eq('professional_id', id) as any
      if (rawVoteData && proData) {
        const { data: piData } = await supabase
          .from('proof_items').select('id, label') as any
        if (piData) {
          const labeledVotes = resolveProofLabels(rawVoteData, piData, proData.custom_proofs || [])
          setVotes(labeledVotes)
        }
      }

      const { data: rawPersData } = await supabase
        .from('personality_summary').select('*').eq('professional_id', id) as any
      if (rawPersData) {
        const { data: persItems } = await supabase
          .from('personality_items').select('id, label') as any
        if (persItems) {
          const labeledPers = resolvePersonalityLabels(rawPersData, persItems)
          setPersonalityVotes(labeledPers)
        }
      }

      const { data: commentData } = await supabase
        .from('votes').select('id, comment, created_at')
        .eq('professional_id', id).eq('status', 'confirmed')
        .not('comment', 'is', null).neq('comment', '')
        .order('created_at', { ascending: false }) as any
      if (commentData) setComments(commentData)

      const { count } = await supabase
        .from('votes').select('*', { count: 'exact', head: true })
        .eq('professional_id', id).eq('status', 'confirmed') as any
      setTotalVotes(count || 0)

      // ブックマーク数を取得
      const { count: bmCount } = await (supabase as any)
        .from('bookmarks')
        .select('*', { count: 'exact', head: true })
        .eq('professional_id', id)
      setBookmarkCount(bmCount || 0)

      // セッション取得 + ブックマーク状態チェック
      const { user: sessionUser } = await getSessionSafe()
      if (sessionUser) {
        setCurrentUserId(sessionUser.id)
        const { data: bookmark } = await (supabase as any)
          .from('bookmarks')
          .select('id')
          .eq('user_id', sessionUser.id)
          .eq('professional_id', id)
          .maybeSingle()
        setIsBookmarked(!!bookmark)
      }

      // 所属団体を取得
      const { data: memberData } = await (supabase as any)
        .from('org_members')
        .select('organization_id, organizations(id, name, type)')
        .eq('professional_id', id)
        .eq('status', 'active')

      if (memberData) {
        setOrgs(memberData
          .filter((m: any) => m.organizations)
          .map((m: any) => ({
            id: m.organizations.id,
            name: m.organizations.name,
            type: m.organizations.type,
          }))
        )
      }

      setLoading(false)
      // バーアニメーション開始を少し遅延
      setTimeout(() => setAnimated(true), 100)
    }
    load()
  }, [id])

  const handleBookmarkToggle = async () => {
    if (!currentUserId) {
      window.location.href = `/login?redirect=/card/${id}`
      return
    }
    setBookmarkLoading(true)
    if (isBookmarked) {
      await (supabase as any)
        .from('bookmarks')
        .delete()
        .eq('user_id', currentUserId)
        .eq('professional_id', id)
      setIsBookmarked(false)
    } else {
      await (supabase as any)
        .from('bookmarks')
        .insert({ user_id: currentUserId, professional_id: id })
      setIsBookmarked(true)
    }
    setBookmarkLoading(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '64px 0', color: T.textMuted }}>読み込み中...</div>
  if (!pro) return <div style={{ textAlign: 'center', padding: '64px 0', color: T.textMuted }}>プロフィールが見つかりません</div>

  const displayBadges = filterAndSortBadges(pro.badges || [])
  const sortedVotes = [...votes].sort((a, b) => b.vote_count - a.vote_count)
  const sortedPersonality = [...personalityVotes].sort((a, b) => b.vote_count - a.vote_count)
  const rawMax = Math.max(...sortedVotes.map(v => v.vote_count), 1)
  const maxVotes = Math.ceil(rawMax * 1.5)
  const totalPersonality = sortedPersonality.reduce((s, v) => s + v.vote_count, 0)
  const maxPersonality = Math.max(...sortedPersonality.map(v => v.vote_count), 1)
  const voiceCount = comments.length

  const top3 = sortedVotes.slice(0, 3)
  const rest = sortedVotes.slice(3)

  return (
    <div style={{ background: T.bg, minHeight: '100vh', maxWidth: 420, margin: '0 auto', padding: 16, fontFamily: T.font }}>

      {/* ═══ ヘッダーカード ═══ */}
      <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 20, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {pro.photo_url ? (
            <img src={pro.photo_url} alt={pro.name}
              style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: T.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 'bold', flexShrink: 0 }}>
              {pro.name.charAt(0)}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.dark }}>{pro.name}</div>
              {/* ブックマークボタン — プロ自身は非表示 */}
              {currentUserId !== pro?.user_id && (
                <button
                  onClick={handleBookmarkToggle}
                  disabled={bookmarkLoading}
                  style={{
                    background: isBookmarked ? 'rgba(196,163,90,0.08)' : 'transparent',
                    border: isBookmarked ? '1.5px solid #C4A35A' : '1.5px solid #D0CCC4',
                    borderRadius: 10,
                    padding: '6px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                    opacity: bookmarkLoading ? 0.5 : 1,
                  }}
                >
                  <span style={{ fontSize: 14, color: isBookmarked ? '#C4A35A' : '#999' }}>
                    {isBookmarked ? '♥' : '♡'}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: isBookmarked ? '#C4A35A' : '#999', fontFamily: T.font }}>
                    気になる
                  </span>
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: T.gold, fontWeight: 700, marginTop: 2 }}>{pro.title}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              {pro.prefecture && <span>{pro.prefecture}</span>}
              {pro.area_description && <span> · {pro.area_description}</span>}
              {pro.is_online_available && <span style={{ marginLeft: 6, color: T.gold }}>● オンライン対応</span>}
            </div>
            {(pro as any).founding_member_status === 'achieved' && (
              <span style={{
                display: 'inline-block', marginTop: 6,
                fontFamily: "'Inter', sans-serif",
                fontSize: 10, fontWeight: 700, letterSpacing: 2,
                textTransform: 'uppercase' as const,
                color: '#C4A35A',
                background: 'rgba(196,163,90,0.12)',
                border: '1px solid rgba(196,163,90,0.3)',
                borderRadius: 4, padding: '4px 10px',
              }}>
                FOUNDING MEMBER
              </span>
            )}
            {orgs.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {orgs.map(o => (
                  <a
                    key={o.id}
                    href={`/org/${o.id}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11, fontWeight: 600, color: T.textMuted,
                      background: '#F5F3EF', borderRadius: 6, padding: '3px 10px',
                      textDecoration: 'none', transition: 'color 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = T.gold)}
                    onMouseLeave={e => (e.currentTarget.style.color = T.textMuted)}
                  >
                    <span style={{ fontSize: 10 }}>{o.type === 'store' ? '🏪' : o.type === 'credential' ? '🎓' : '📚'}</span>
                    {o.name}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ height: 1, background: T.divider, margin: '16px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: 30, fontWeight: 'bold', color: T.gold, fontFamily: T.fontMono }}>{totalVotes}</span>
            <span style={{ fontSize: 13, color: T.textSub, marginLeft: 6 }}>proofs</span>
          </div>
          {bookmarkCount > 0 && (
            <div style={{ textAlign: 'center' }}>
              <span style={{ fontSize: 20, fontWeight: 'bold', color: T.text, fontFamily: T.fontMono }}>{bookmarkCount}</span>
              <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 4 }}>♡</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ BIO ═══ */}
      {pro.bio && (
        <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: T.textSub, lineHeight: 1.9, whiteSpace: 'pre-wrap', margin: 0, fontWeight: 500 }}>{pro.bio}</p>
        </div>
      )}

      {/* ═══ タブ切替 ═══ */}
      <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: 3, display: 'flex', marginBottom: 12 }}>
        {([
          { key: 'strengths' as const, label: '強み' },
          { key: 'certs' as const, label: '認定・資格' },
          { key: 'voices' as const, label: 'Voices', badge: voiceCount },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer',
              borderRadius: 10, fontSize: 12, fontWeight: 700, fontFamily: T.font,
              background: activeTab === tab.key ? T.dark : 'transparent',
              color: activeTab === tab.key ? T.gold : T.textMuted,
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span style={{
                fontSize: 10, background: activeTab === tab.key ? T.gold : T.textMuted,
                color: activeTab === tab.key ? T.dark : '#fff',
                borderRadius: 99, padding: '1px 6px', fontWeight: 700,
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ タブコンテンツ: 強み ═══ */}
      {activeTab === 'strengths' && (
        <div style={{ marginBottom: 12 }}>
          {/* STRENGTH PROOFS */}
          {sortedVotes.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontFamily: T.fontMono, marginBottom: 10 }}>
                STRENGTH PROOFS
              </div>

              {/* Top 3 — バーチャート（ラベル上段+バー下段で折り返し確保） */}
              {top3.length > 0 && (
                <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: 18, marginBottom: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {top3.map((v, i) => {
                      const pct = (v.vote_count / maxVotes) * 100
                      return (
                        <div key={v.category} style={{ width: '100%' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.5, overflowWrap: 'anywhere' as const, minWidth: 0 }}>{v.category}</span>
                            <span style={{ fontSize: 16, fontWeight: 'bold', color: T.gold, fontFamily: T.fontMono, flexShrink: 0 }}>{v.vote_count}</span>
                          </div>
                          <div style={{ width: '100%', height: 8, background: '#F0EDE6', borderRadius: 99 }}>
                            <div style={{
                              height: 8, borderRadius: 99, background: getBarColor(i),
                              width: animated ? `${pct}%` : '0%',
                              transition: `width 1.2s ease ${i * 0.08}s`,
                            }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 残り — バーチャート */}
              {rest.length > 0 && (
                <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: 18, marginBottom: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {rest.map((v, i) => {
                      const pct = (v.vote_count / maxVotes) * 100
                      return (
                        <div key={v.category} style={{ width: '100%' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.5, overflowWrap: 'anywhere' as const, minWidth: 0 }}>{v.category}</span>
                            <span style={{ fontSize: 13, color: T.textMuted, fontFamily: T.fontMono, flexShrink: 0 }}>{v.vote_count}</span>
                          </div>
                          <div style={{ width: '100%', height: 5, background: '#F0EDE6', borderRadius: 99 }}>
                            <div style={{
                              height: 5, borderRadius: 99, background: getBarColor(3),
                              width: animated ? `${pct}%` : '0%',
                              transition: `width 1.2s ease ${(i + 3) * 0.08}s`,
                            }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* PERSONALITY PROOFS */}
          {sortedPersonality.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontFamily: T.fontMono, marginBottom: 10, marginTop: 16 }}>
                PERSONALITY PROOFS
              </div>
              <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                  {sortedPersonality.slice(0, 3).map(v => (
                    <RingChart key={v.category} label={v.category} count={v.vote_count} max={maxPersonality} />
                  ))}
                </div>
                <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12, color: T.textSub }}>
                  パーソナリティへの投票 計 <span style={{ fontWeight: 'bold', color: T.gold }}>{totalPersonality}</span>
                </div>
              </div>
            </>
          )}

          {/* BOOKMARK ENGAGEMENT */}
          {bookmarkCount > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontFamily: T.fontMono, marginBottom: 10, marginTop: 16 }}>
                ENGAGEMENT
              </div>
              <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>♡ ブックマーク</span>
                  <span style={{ fontSize: 16, fontWeight: 'bold', color: T.gold, fontFamily: T.fontMono, flexShrink: 0 }}>{bookmarkCount}</span>
                </div>
                <div style={{ width: '100%', height: 8, background: '#F0EDE6', borderRadius: 99 }}>
                  <div style={{
                    height: 8, borderRadius: 99, background: 'linear-gradient(90deg, #C4A35A, #D4B96A)',
                    width: animated ? `${Math.min(bookmarkCount * 10, 100)}%` : '0%',
                    transition: 'width 1.2s ease 0.3s',
                  }} />
                </div>
                <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: T.textMuted }}>
                  {bookmarkCount}人がこのプロに注目しています
                </div>
              </div>
            </>
          )}

          {sortedVotes.length === 0 && sortedPersonality.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: T.textMuted, fontSize: 13 }}>
              まだプルーフがありません
            </div>
          )}
        </div>
      )}

      {/* ═══ タブコンテンツ: 認定・資格 ═══ */}
      {activeTab === 'certs' && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontFamily: T.fontMono, marginBottom: 10 }}>
            CERTIFICATIONS & BADGES
          </div>
          {displayBadges.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {displayBadges.map((badge, i) => {
                const badgeUrl = getBadgeUrl(badge.id)
                const badgeContent = (
                  <div key={i}
                    style={{
                      background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14,
                      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
                      cursor: badgeUrl ? 'pointer' : 'default', transition: 'border-color 0.2s, opacity 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = T.gold
                      if (badgeUrl) e.currentTarget.style.opacity = '0.85'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = T.cardBorder
                      e.currentTarget.style.opacity = '1'
                    }}
                  >
                    {badge.image_url ? (
                      <img src={badge.image_url} alt={badge.label} style={{ width: 56, height: 56, objectFit: 'contain' }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: 12, background: `linear-gradient(135deg, ${T.gold}, #D4B96A)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
                        IMG
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 'bold', color: T.text }}>{badge.label}</div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>認定バッジ</div>
                    </div>
                    {badgeUrl && (
                      <svg style={{ width: 14, height: 14, color: T.textMuted, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    )}
                  </div>
                )
                return badgeUrl ? (
                  <a key={i} href={badgeUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                    {badgeContent}
                  </a>
                ) : (
                  badgeContent
                )
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0', color: T.textMuted, fontSize: 13 }}>
              認定・資格はまだ登録されていません
            </div>
          )}
        </div>
      )}

      {/* ═══ タブコンテンツ: Voices（閲覧専用） ═══ */}
      {activeTab === 'voices' && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontFamily: T.fontMono, marginBottom: 10 }}>
            VOICES — {voiceCount} COMMENTS
          </div>
          {voiceCount > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {comments.map((c: Vote) => (
                <div key={c.id}
                  style={{
                    background: 'linear-gradient(170deg, #FAF8F4 0%, #F3EFE7 100%)',
                    border: '1px solid #E8E4DC',
                    borderRadius: 14, padding: '20px',
                  }}
                >
                  {/* 引用符 */}
                  <div style={{ fontSize: 32, color: 'rgba(196, 163, 90, 0.3)', fontFamily: 'Georgia, serif', lineHeight: 1 }}>&ldquo;</div>
                  {/* コメント */}
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', lineHeight: 1.8, margin: '4px 0 10px' }}>{c.comment}</div>
                  {/* 日付 */}
                  <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono }}>
                    {new Date(c.created_at).toLocaleDateString('ja-JP')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0', color: T.textMuted, fontSize: 13 }}>
              コメントがまだありません
            </div>
          )}
        </div>
      )}

      {/* ═══ CTA ═══ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {pro.booking_url && (
          <a href={pro.booking_url} target="_blank" rel="noopener"
            style={{
              display: 'block', textAlign: 'center', padding: 15, borderRadius: 14,
              background: T.dark, color: T.gold, fontWeight: 700, fontSize: 14,
              textDecoration: 'none', fontFamily: T.font,
            }}>
            予約する
          </a>
        )}
        {pro.contact_email && (
          <a href={`mailto:${pro.contact_email}?subject=${encodeURIComponent(`REAL PROOFを見て相談：${pro.name}さん`)}&body=${encodeURIComponent(`${pro.name}さん\n\nREAL PROOFであなたのプロフィールを拝見し、ご相談したくご連絡しました。\n\n`)}`}
            style={{
              display: 'block', textAlign: 'center', padding: 14, borderRadius: 14,
              background: 'transparent', border: `1.5px solid ${T.dark}`, color: T.dark,
              fontWeight: 700, fontSize: 14, textDecoration: 'none', fontFamily: T.font,
            }}>
            このプロに相談する
          </a>
        )}
        <div style={{
          background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14,
          padding: '12px 16px', fontSize: 11, color: T.textMuted, textAlign: 'center',
        }}>
          プルーフはセッション後にプロが発行する24時間限定QRコードからのみ贈れます
        </div>
      </div>

      {/* ═══ 同地域のプロ ═══ */}
      {pro.prefecture && (
        <RelatedPros currentProId={id} prefecture={pro.prefecture} maxDisplay={3} />
      )}

      {/* ═══ 紹介リンク ═══ */}
      <div style={{
        background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14,
        padding: '20px 18px', textAlign: 'center', marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.dark, marginBottom: 6 }}>
          このプロを友だちに紹介する
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 14 }}>
          あなたの紹介で信頼がつながります
        </div>
        <button
          onClick={async () => {
            const url = `${window.location.origin}/card/${id}`
            if (navigator.share) {
              try {
                await navigator.share({ title: `${pro.name}のカード`, url })
              } catch { /* cancelled */ }
            } else {
              await navigator.clipboard.writeText(url)
              setShareCopied(true)
              setTimeout(() => setShareCopied(false), 2000)
            }
          }}
          style={{
            width: '100%', padding: '12px', border: 'none', borderRadius: 12,
            background: T.gold, color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: T.font,
          }}
        >
          {shareCopied ? 'コピーしました！' : 'リンクをシェア'}
        </button>
      </div>

      {/* ═══ フッター ═══ */}
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1A2E', letterSpacing: '2px' }}>REALPROOF</div>
        <div style={{ fontSize: 10, color: '#888888', marginTop: 4 }}>強みが、あなたを定義する。</div>
      </div>
    </div>
  )
}
