'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
// useUser removed — auth is now handled server-side in /api/card/[id]
import { Professional, VoteSummary, Vote } from '@/lib/types'
import { resolveProofLabels, resolvePersonalityLabels } from '@/lib/proof-labels'
import { COLORS, FONTS } from '@/lib/design-tokens'
import { trackPageView, trackEvent } from '@/lib/tracking'
import { PROVEN_THRESHOLD, SPECIALIST_THRESHOLD, MASTER_THRESHOLD, PROVEN_GOLD, TAB_DISPLAY_NAMES } from '@/lib/constants'
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

// SVGリングチャート（人柄プルーフ用 — 30票以上💎、50票以上★ティア）
function RingChart({ label, count, max, size: sizeProp }: { label: string; count: number; max: number; size?: number }) {
  const isMaster = count >= 50  // MASTER_THRESHOLD
  const isDiamond = count >= 30 // SPECIALIST_THRESHOLD
  const hasTier = isMaster || isDiamond
  const size = sizeProp || (hasTier ? 68 : 76)
  const strokeWidth = hasTier ? 2.5 : 4
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const pct = max > 0 ? count / max : 0
  const offset = circumference * (1 - pct)
  const bgFill = isMaster ? 'rgba(196,163,90,0.08)' : isDiamond ? 'rgba(196,163,90,0.06)' : 'none'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill={bgFill} stroke="#F0EDE6" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={T.gold} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 1.2s ease' }}
        />
        {hasTier ? (
          <>
            {/* ティアアイコン */}
            {isMaster ? (
              <g transform={`translate(${size / 2 - 8}, ${size / 2 - 16})`}>
                <path d="M8 1L10.2 5.5L15 6.2L11.5 9.6L12.4 14.4L8 12.1L3.6 14.4L4.5 9.6L1 6.2L5.8 5.5L8 1Z" fill="#C4A35A"/>
              </g>
            ) : (
              <text x={size / 2} y={size / 2 - 8} textAnchor="middle" dominantBaseline="central"
                fontSize="13">
                💎
              </text>
            )}
            {/* 数字（下） */}
            <text x={size / 2} y={size / 2 + 10} textAnchor="middle" dominantBaseline="central"
              fill={T.gold} fontSize="16" fontWeight="bold" fontFamily={T.fontMono}>
              {count}
            </text>
          </>
        ) : (
          <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
            fill={T.gold} fontSize="18" fontWeight="bold" fontFamily={T.fontMono}>
            {count}
          </text>
        )}
      </svg>
      <div style={{ fontSize: 11, fontWeight: 'bold', color: T.text, textAlign: 'center', marginTop: 6, lineHeight: 1.3 }}>
        {label}
      </div>
    </div>
  )
}

export default function CardPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params.id as string
  const tabParam = searchParams.get('tab')
  const highlightParam = searchParams.get('highlight') || ''
  const highlightScrollRef = useRef(false)
  // Clerk auth removed from client — handled server-side in /api/card/[id]
  const [pro, setPro] = useState<Professional | null>(null)
  const [votes, setVotes] = useState<VoteSummary[]>([])
  const [personalityVotes, setPersonalityVotes] = useState<{ category: string; vote_count: number }[]>([])
  const [comments, setComments] = useState<Vote[]>([])
  const [totalVotes, setTotalVotes] = useState(0)
  const [loading, setLoading] = useState(true)
  const initialTab = (tabParam === 'voices' || tabParam === 'certs') ? tabParam : 'strengths'
  const [activeTab, setActiveTab] = useState<'strengths' | 'certs' | 'voices'>(initialTab)
  const [animated, setAnimated] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [bookmarkLoading, setBookmarkLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [bookmarkCount, setBookmarkCount] = useState(0)
  const [orgs, setOrgs] = useState<{id: string; name: string; type: string}[]>([])
  const [credentialBadges, setCredentialBadges] = useState<{id: string; name: string; description: string | null; image_url: string | null; org_name: string; org_id: string}[]>([])
  const [sessionCounts, setSessionCounts] = useState<{ first: number; repeat: number; regular: number }>({ first: 0, repeat: 0, regular: 0 })
  const [expandedProofId, setExpandedProofId] = useState<string | null>(null)
  const [proofDatesCache, setProofDatesCache] = useState<Record<string, string[]>>({})
  const [proofDatesLoading, setProofDatesLoading] = useState<string | null>(null)
  const [topRank, setTopRank] = useState<{ categoryLabel: string; subLabel: string; rank: number } | null>(null)
  const [recentProofs, setRecentProofs] = useState(0)
  const [repeaterRate, setRepeaterRate] = useState<number | null>(null)
  const [firstTimerCount, setFirstTimerCount] = useState(0)
  const [repeaterCount, setRepeaterCount] = useState(0)
  const [regularCount, setRegularCount] = useState(0)

  const toggleProofDates = async (proofId: string) => {
    if (expandedProofId === proofId) {
      setExpandedProofId(null)
      return
    }
    setExpandedProofId(proofId)
    if (proofDatesCache[proofId]) return // already cached
    setProofDatesLoading(proofId)
    try {
      const res = await fetch(`/api/proof-votes/${id}/${proofId}`)
      const data = await res.json()
      setProofDatesCache(prev => ({ ...prev, [proofId]: data.dates || [] }))
    } catch {
      setProofDatesCache(prev => ({ ...prev, [proofId]: [] }))
    }
    setProofDatesLoading(null)
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/card/${id}`)
        if (!res.ok) {
          setLoading(false)
          return
        }
        const data = await res.json()

        if (!data.pro) {
          setLoading(false)
          return
        }

        if (data.pro.deactivated_at) {
          setPro({ ...data.pro, _deactivated: true } as any)
          setLoading(false)
          return
        }

        setPro(data.pro)

        // プルーフラベル解決
        if (data.voteSummary.length > 0 && data.proofItems.length > 0) {
          const labeledVotes = resolveProofLabels(data.voteSummary, data.proofItems, data.pro.custom_proofs || [])
          setVotes(labeledVotes)
        }

        // 人柄ラベル解決
        if (data.personalitySummary.length > 0 && data.personalityItems.length > 0) {
          const labeledPers = resolvePersonalityLabels(data.personalitySummary, data.personalityItems)
          setPersonalityVotes(labeledPers)
        }

        setComments(data.comments)
        setTotalVotes(data.totalVotes)
        setBookmarkCount(data.bookmarkCount)
        setIsBookmarked(data.isBookmarked)
        setCurrentUserId(data.currentUserId)

        // 所属団体
        if (data.orgMembers) {
          const allOrgs = data.orgMembers
            .filter((m: any) => m.organizations && !m.credential_level_id)
            .map((m: any) => ({
              id: m.organizations.id,
              name: m.organizations.name,
              type: m.organizations.type,
            }))
          const seen = new Set<string>()
          setOrgs(allOrgs.filter((o: any) => {
            if (seen.has(o.id)) return false
            seen.add(o.id)
            return true
          }))
        }

        // バッジ
        if (data.badgeMembers) {
          setCredentialBadges(data.badgeMembers
            .filter((m: any) => m.credential_levels && m.organizations)
            .map((m: any) => ({
              id: m.credential_levels.id,
              name: m.credential_levels.name,
              description: m.credential_levels.description,
              image_url: m.credential_levels.image_url,
              org_name: m.organizations.name,
              org_id: m.organizations.id,
            }))
          )
        }
        if (data.sessionCounts) setSessionCounts(data.sessionCounts)
        if (data.recentProofs !== undefined) setRecentProofs(data.recentProofs)
        if (data.repeaterRate !== undefined) setRepeaterRate(data.repeaterRate)
        if (data.firstTimerCount !== undefined) setFirstTimerCount(data.firstTimerCount)
        if (data.repeaterCount !== undefined) setRepeaterCount(data.repeaterCount)
        if (data.regularCount !== undefined) setRegularCount(data.regularCount)
      } catch (err) {
        console.error('Card load error:', err)
      }

      setLoading(false)
      setTimeout(() => setAnimated(true), 100)
    }
    load()
  }, [id])

  // カードページ PV トラッキング（tracking_events テーブル）
  useEffect(() => {
    if (id) {
      trackEvent(id, 'card_view')
    }
  }, [id])

  // ハイライトスクロール
  useEffect(() => {
    if (highlightParam && activeTab === 'voices' && !loading && !highlightScrollRef.current) {
      highlightScrollRef.current = true
      setTimeout(() => {
        const el = document.querySelector('[data-highlight-match="true"]')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 200)
    }
  }, [highlightParam, activeTab, loading])

  // 順位メダル取得（1つだけ）
  useEffect(() => {
    if (!id) return
    fetch(`/api/pro-rank/${id}`, { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data.rank) {
          setTopRank(data.rank)
        }
      })
      .catch(() => {})
  }, [id])

  const handleBookmarkToggle = async () => {
    if (!currentUserId) {
      window.location.href = `/sign-in?redirect_url=/card/${id}`
      return
    }
    setBookmarkLoading(true)
    try {
      if (isBookmarked) {
        const res = await fetch('/api/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete',
            table: 'bookmarks',
            query: { eq: { user_id: currentUserId, professional_id: id } }
          })
        })
        const result = await res.json()
        if (!result.error) setIsBookmarked(false)
      } else {
        const res = await fetch('/api/db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'insert',
            table: 'bookmarks',
            query: { data: { user_id: currentUserId, professional_id: id } }
          })
        })
        const result = await res.json()
        if (!result.error) setIsBookmarked(true)
      }
    } catch (e) {
      console.error('Bookmark toggle error:', e)
    } finally {
      setBookmarkLoading(false)
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '64px 0', color: T.textMuted }}>読み込み中...</div>
  if (!pro) return <div style={{ textAlign: 'center', padding: '64px 0', color: T.textMuted }}>プロフィールが見つかりません</div>
  if ((pro as any)._deactivated) return <div style={{ textAlign: 'center', padding: '80px 0', color: T.textMuted }}><p style={{ fontSize: 14 }}>このプロフィールは現在非公開です</p></div>

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
            {/* 名前（上の行、フル幅）+ velocity バッジ */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.dark }}>{pro.name}</div>
              {((pro as any).founding_member_status === 'achieved' || (pro as any).is_founding_member) && (
                <img
                  src="/images/founding-member-badge.png"
                  alt="Founding Member"
                  style={{ width: 28, height: 28, objectFit: 'contain' }}
                />
              )}
              {recentProofs > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: recentProofs >= 15 ? '#E65100' : '#2E7D32' }}>
                  {recentProofs >= 15 ? '\uD83D\uDD25' : '\uD83D\uDFE2'} 今月 {recentProofs}人に評価されています
                </span>
              )}
            </div>
            {topRank && (
              <div style={{ fontSize: 11, fontWeight: 800, color: T.dark, marginTop: 2 }}>
                {'\uD83E\uDD47'} {topRank.categoryLabel}・{topRank.subLabel} {topRank.rank}位
              </div>
            )}
            {pro.store_name && (
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{pro.store_name}</div>
            )}
            {/* タイトル + ブックマークボタン（同じ行） */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
              <div style={{ fontSize: 12, color: T.gold, fontWeight: 700, flex: 1, minWidth: 0 }}>{pro.title}</div>
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
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              {pro.prefecture && <span>{pro.prefecture}</span>}
              {pro.area_description && <span> · {pro.area_description}</span>}
              {pro.is_online_available && <span style={{ marginLeft: 6, color: T.gold }}>● オンライン対応</span>}
            </div>
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
          {(() => {
            const specialistCount = sortedVotes.filter(v => v.vote_count >= SPECIALIST_THRESHOLD).length
            const provenCount = sortedVotes.filter(v => v.vote_count >= PROVEN_THRESHOLD).length
            return (
              <>
                {specialistCount > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 20, fontWeight: 'bold', color: '#C4A35A', fontFamily: T.fontMono }}>{specialistCount}</span>
                    <span style={{ fontSize: 11, color: '#C4A35A', marginLeft: 4, fontWeight: 700 }}>specialist</span>
                  </div>
                )}
                {provenCount > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 20, fontWeight: 'bold', color: PROVEN_GOLD, fontFamily: T.fontMono }}>{provenCount}</span>
                    <span style={{ fontSize: 11, color: PROVEN_GOLD, marginLeft: 4, fontWeight: 700 }}>proven</span>
                  </div>
                )}
              </>
            )
          })()}
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
          {/* 常連表示（リピーター率行・velocity行は削除済み → CLIENT COMPOSITIONバーに統合） */}
          {repeaterRate === null && regularCount > 0 && (
            <div style={{
              background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14,
              padding: '14px 18px', marginBottom: 12,
            }}>
              <div style={{ fontSize: 12, color: T.gold, fontWeight: 600 }}>
                {'\u2728'} 常連 {regularCount}名
              </div>
            </div>
          )}

          {/* STRENGTH PROOFS */}
          {sortedVotes.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontFamily: T.fontMono, marginBottom: 10 }}>
                STRENGTH PROOFS
              </div>

              {/* Top 3 — バーチャート（票数でティア分け + PROVEN対応） */}
              {top3.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {top3.map((v, i) => {
                    const pct = (v.vote_count / maxVotes) * 100
                    const isSpecialist = v.vote_count >= SPECIALIST_THRESHOLD
                    const isProven = v.vote_count >= PROVEN_THRESHOLD
                    const tier = isSpecialist ? 'specialist' : v.vote_count > 10 ? 'strong' : 'normal'
                    const cardBg = tier === 'normal' ? T.cardBg : '#1A1A2E'
                    const cardBorder = tier === 'specialist' ? '#C4A35A' : tier === 'normal' ? T.cardBorder : '#2A2A3E'
                    const cardBorderWidth = tier === 'specialist' ? '1.5px' : '1px'
                    const labelColor = isSpecialist ? '#C4A35A' : tier === 'strong' ? '#FFFFFF' : T.text
                    const countColor = isSpecialist ? '#C4A35A' : tier === 'strong' ? '#FFFFFF' : T.gold
                    const barTrack = tier === 'normal' ? '#F0EDE6' : '#2A2A3E'
                    const barFill = isSpecialist
                      ? 'linear-gradient(90deg, #C4A35A, #E8D9A8)'
                      : isProven ? PROVEN_GOLD : getBarColor(i)
                    const barHeight = isSpecialist ? 5 : 8
                    return (
                      <div key={v.category} style={{
                        background: cardBg,
                        border: `${cardBorderWidth} solid ${cardBorder}`,
                        borderRadius: 14,
                        padding: 18,
                        cursor: 'pointer',
                        overflow: 'hidden',
                        position: 'relative' as const,
                      }}
                        onClick={() => v.proof_id && toggleProofDates(v.proof_id)}>
                        {/* SPECIALIST トップライン */}
                        {isSpecialist && (
                          <div style={{
                            position: 'absolute' as const, top: 0, left: 0, right: 0, height: 3,
                            background: 'linear-gradient(90deg, #C4A35A, #E8D9A8, #C4A35A)',
                          }} />
                        )}
                        {/* ティアラベル */}
                        {isSpecialist ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 500, letterSpacing: 0.5, color: '#1A1A2E',
                              background: '#C4A35A', padding: '2px 8px', borderRadius: 10,
                            }}>
                              🏆 SPECIALIST
                            </span>
                          </div>
                        ) : isProven ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: PROVEN_GOLD }}>
                              🛡 PROVEN
                            </span>
                          </div>
                        ) : null}
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: labelColor, lineHeight: 1.5, overflowWrap: 'anywhere' as const }}>
                              {v.strength_label || v.category}
                            </span>
                            <span style={{ fontSize: isSpecialist ? 18 : 16, fontWeight: 'bold', color: countColor, fontFamily: T.fontMono, flexShrink: 0 }}>{v.vote_count}</span>
                          </div>
                          {v.strength_label && (
                            <div style={{ fontSize: 11, color: tier === 'normal' ? T.textMuted : 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                              {v.category}
                            </div>
                          )}
                          {v.tab && TAB_DISPLAY_NAMES[v.tab] && (
                            <div style={{ marginTop: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(196,163,90,0.6)', background: 'rgba(196,163,90,0.08)', padding: '2px 8px', borderRadius: 4 }}>
                                {TAB_DISPLAY_NAMES[v.tab]}
                              </span>
                            </div>
                          )}
                        </div>
                        <div style={{ width: '100%', height: barHeight, background: barTrack, borderRadius: 99 }}>
                          <div style={{
                            height: barHeight, borderRadius: 99,
                            background: barFill,
                            width: animated ? `${pct}%` : '0%',
                            transition: `width 1.2s ease ${i * 0.08}s`,
                          }} />
                        </div>
                        {/* 次の目標テキスト */}
                        {isSpecialist && (
                          <div style={{ fontSize: 10, color: '#C4A35A', textAlign: 'right' as const, marginTop: 6 }}>
                            Next: MASTER (50)
                          </div>
                        )}
                        {!isSpecialist && isProven && (
                          <div style={{ fontSize: 10, color: 'rgba(250,250,247,0.4)', textAlign: 'right' as const, marginTop: 6 }}>
                            あと{SPECIALIST_THRESHOLD - v.vote_count}票でSPECIALIST
                          </div>
                        )}
                        {/* 日付アコーディオン */}
                        {v.proof_id && expandedProofId === v.proof_id && (
                          <div style={{ marginTop: 10, borderTop: `1px solid ${tier === 'normal' ? T.divider : '#3A3A4E'}`, paddingTop: 10 }}>
                            {proofDatesLoading === v.proof_id ? (
                              <div style={{ fontSize: 11, color: tier === 'normal' ? T.textMuted : 'rgba(255,255,255,0.5)' }}>読み込み中...</div>
                            ) : (proofDatesCache[v.proof_id] || []).length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: tier === 'normal' ? T.textMuted : 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 2 }}>投票日</div>
                                {(proofDatesCache[v.proof_id] || []).map((date, di) => (
                                  <div key={di} style={{ fontSize: 11, color: tier === 'normal' ? T.textSub : 'rgba(255,255,255,0.7)', fontFamily: T.fontMono }}>
                                    {date}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize: 11, color: tier === 'normal' ? T.textMuted : 'rgba(255,255,255,0.5)' }}>日付データなし</div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 残り — バーチャート（PROVEN対応） */}
              {rest.length > 0 && (
                <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: 18, marginBottom: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {rest.map((v, i) => {
                      const pct = (v.vote_count / maxVotes) * 100
                      const isSpecialist = v.vote_count >= SPECIALIST_THRESHOLD
                      const isProven = v.vote_count >= PROVEN_THRESHOLD
                      return (
                        <div key={v.category} style={{
                          width: '100%', cursor: 'pointer',
                          ...(isSpecialist ? { border: '1.5px solid #C4A35A', borderRadius: 10, padding: '10px 12px', background: '#1A1A2E', position: 'relative' as const, overflow: 'hidden' } : {}),
                        }}
                          onClick={() => v.proof_id && toggleProofDates(v.proof_id)}>
                          {/* SPECIALIST トップライン */}
                          {isSpecialist && (
                            <div style={{
                              position: 'absolute' as const, top: 0, left: 0, right: 0, height: 3,
                              background: 'linear-gradient(90deg, #C4A35A, #E8D9A8, #C4A35A)',
                            }} />
                          )}
                          {/* ティアラベル */}
                          {isSpecialist ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 500, letterSpacing: 0.5, color: '#1A1A2E',
                                background: '#C4A35A', padding: '2px 8px', borderRadius: 10,
                              }}>
                                🏆 SPECIALIST
                              </span>
                            </div>
                          ) : isProven ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: PROVEN_GOLD }}>
                                🛡 PROVEN
                              </span>
                            </div>
                          ) : null}
                          <div style={{ marginBottom: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: isSpecialist ? '#C4A35A' : isProven ? PROVEN_GOLD : T.text, lineHeight: 1.5, overflowWrap: 'anywhere' as const }}>
                                {v.strength_label || v.category}
                              </span>
                              <span style={{ fontSize: isSpecialist ? 15 : 13, color: isSpecialist ? '#C4A35A' : isProven ? PROVEN_GOLD : T.textMuted, fontFamily: T.fontMono, flexShrink: 0, fontWeight: isSpecialist ? 'bold' : undefined }}>{v.vote_count}</span>
                            </div>
                            {v.strength_label && (
                              <div style={{ fontSize: 10, color: isSpecialist ? 'rgba(255,255,255,0.55)' : T.textMuted, marginTop: 2 }}>
                                {v.category}
                              </div>
                            )}
                            {v.tab && TAB_DISPLAY_NAMES[v.tab] && (
                              <div style={{ marginTop: 3 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(196,163,90,0.6)', background: 'rgba(196,163,90,0.08)', padding: '2px 8px', borderRadius: 4 }}>
                                  {TAB_DISPLAY_NAMES[v.tab]}
                                </span>
                              </div>
                            )}
                          </div>
                          <div style={{ width: '100%', height: 5, background: isSpecialist ? '#2A2A3E' : '#F0EDE6', borderRadius: 99 }}>
                            <div style={{
                              height: 5, borderRadius: 99,
                              background: isSpecialist ? 'linear-gradient(90deg, #C4A35A, #E8D9A8)' : isProven ? PROVEN_GOLD : getBarColor(3),
                              width: animated ? `${pct}%` : '0%',
                              transition: `width 1.2s ease ${(i + 3) * 0.08}s`,
                            }} />
                          </div>
                          {/* 次の目標テキスト */}
                          {isSpecialist && (
                            <div style={{ fontSize: 10, color: '#C4A35A', textAlign: 'right' as const, marginTop: 4 }}>
                              Next: MASTER (50)
                            </div>
                          )}
                          {!isSpecialist && isProven && (
                            <div style={{ fontSize: 10, color: 'rgba(250,250,247,0.4)', textAlign: 'right' as const, marginTop: 4 }}>
                              あと{SPECIALIST_THRESHOLD - v.vote_count}票でSPECIALIST
                            </div>
                          )}
                          {/* 日付アコーディオン */}
                          {v.proof_id && expandedProofId === v.proof_id && (
                            <div style={{ marginTop: 8, borderTop: `1px solid ${isSpecialist ? '#3A3A4E' : T.divider}`, paddingTop: 8 }}>
                              {proofDatesLoading === v.proof_id ? (
                                <div style={{ fontSize: 11, color: isSpecialist ? 'rgba(255,255,255,0.5)' : T.textMuted }}>読み込み中...</div>
                              ) : (proofDatesCache[v.proof_id] || []).length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: isSpecialist ? 'rgba(255,255,255,0.5)' : T.textMuted, letterSpacing: 1, marginBottom: 2 }}>投票日</div>
                                  {(proofDatesCache[v.proof_id] || []).map((date, di) => (
                                    <div key={di} style={{ fontSize: 11, color: isSpecialist ? 'rgba(255,255,255,0.7)' : T.textSub, fontFamily: T.fontMono }}>
                                      {date}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: 11, color: isSpecialist ? 'rgba(255,255,255,0.5)' : T.textMuted }}>日付データなし</div>
                              )}
                            </div>
                          )}
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

          {/* CLIENT COMPOSITION BAR */}
          {(() => {
            const total = sessionCounts.first + sessionCounts.repeat + sessionCounts.regular
            if (total === 0) return null
            const pFirst = Math.round((sessionCounts.first / total) * 100)
            const pRepeat = Math.round((sessionCounts.repeat / total) * 100)
            const pRegular = 100 - pFirst - pRepeat
            const segments = [
              { key: 'first', label: '初回投票', count: sessionCounts.first, pct: pFirst, bg: '#E8E4D9', color: '#444441' },
              { key: 'repeat', label: 'リピーター', count: sessionCounts.repeat, pct: pRepeat, bg: '#C4A35A', color: '#412402' },
              { key: 'regular', label: '常連', count: sessionCounts.regular, pct: pRegular, bg: '#1A1A2E', color: '#C4A35A' },
            ]
            return (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontFamily: T.fontMono, marginBottom: 10, marginTop: 16 }}>
                  CLIENT COMPOSITION
                </div>
                <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: 18 }}>
                  <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden' }}>
                    {segments.map(s => s.pct > 0 ? (
                      <div key={s.key} style={{ width: `${s.pct}%`, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {s.pct >= 10 && <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.pct}%</span>}
                      </div>
                    ) : null)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                    {segments.map(s => (
                      <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: T.textSub }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.bg, display: 'inline-block', border: s.key === 'first' ? '1px solid #ccc' : 'none' }} />
                        {s.label} <span style={{ fontWeight: 700, color: T.text }}>{s.count}人</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )
          })()}

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
          {(displayBadges.length > 0 || credentialBadges.length > 0) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* credential_levels経由のバッジ（新方式） */}
              {credentialBadges.map((badge) => (
                <a
                  key={badge.id}
                  href={`/org/${badge.org_id}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div
                    style={{
                      background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14,
                      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
                      cursor: 'pointer', transition: 'border-color 0.2s, opacity 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = T.gold
                      e.currentTarget.style.opacity = '0.85'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = T.cardBorder
                      e.currentTarget.style.opacity = '1'
                    }}
                  >
                    {badge.image_url ? (
                      <img src={badge.image_url} alt={badge.name} style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: 12, background: `linear-gradient(135deg, ${T.gold}, #D4B96A)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
                        {badge.name.charAt(0)}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 'bold', color: T.text }}>{badge.name}</div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{badge.org_name}</div>
                    </div>
                    <svg style={{ width: 14, height: 14, color: T.textMuted, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </a>
              ))}

              {/* pro.badges経由のバッジ（旧方式・互換性維持） */}
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
              {comments.map((c: Vote) => {
                const isMatch = highlightParam && c.comment?.includes(highlightParam)
                return (
                  <div key={c.id}
                    data-highlight-match={isMatch ? 'true' : undefined}
                    style={{
                      background: isMatch
                        ? 'linear-gradient(170deg, #FFF8E1 0%, #FFF3CD 100%)'
                        : 'linear-gradient(170deg, #FAF8F4 0%, #F3EFE7 100%)',
                      border: isMatch ? '1.5px solid #C4A35A' : '1px solid #E8E4DC',
                      borderRadius: 14, padding: '20px',
                    }}
                  >
                    {/* 引用符 */}
                    <div style={{ fontSize: 32, color: 'rgba(196, 163, 90, 0.3)', fontFamily: 'Georgia, serif', lineHeight: 1 }}>&ldquo;</div>
                    {/* コメント */}
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', lineHeight: 1.8, margin: '4px 0 10px' }}>
                      {highlightParam && c.comment?.includes(highlightParam)
                        ? (() => {
                            const parts = c.comment.split(highlightParam)
                            return parts.map((part, i) => (
                              <span key={i}>
                                {part}
                                {i < parts.length - 1 && (
                                  <mark style={{ background: 'rgba(196,163,90,0.25)', color: '#1A1A2E', padding: '0 2px', borderRadius: 2 }}>
                                    {highlightParam}
                                  </mark>
                                )}
                              </span>
                            ))
                          })()
                        : c.comment}
                    </div>
                    {/* リピーター・常連マーク + 日付 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.fontMono }}>
                        {new Date(c.created_at).toLocaleDateString('ja-JP')}
                      </div>
                      {(c as any).voter_vote_count >= 3 && (
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#C4A35A' }}>
                          ⭐ 常連
                        </div>
                      )}
                      {(c as any).voter_vote_count === 2 && (
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#999' }}>
                          🔄 リピーター
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
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
            onClick={() => trackEvent(id, 'booking_click')}
            style={{
              display: 'block', textAlign: 'center', padding: 15, borderRadius: 14,
              background: T.dark, color: T.gold, fontWeight: 700, fontSize: 14,
              textDecoration: 'none', fontFamily: T.font,
            }}>
            予約する
          </a>
        )}
        {pro.contact_email && (
          <a href={(() => { const subject = encodeURIComponent(`REAL PROOFを見て相談：${pro.name}さん`); const body = encodeURIComponent(`${pro.name}さん\n\nREAL PROOFであなたのプロフィールを拝見し、ご相談したくご連絡しました。\n\n`); return `mailto:${pro.contact_email}?subject=${subject}&body=${body}` })()}
            onClick={() => trackEvent(id, 'consultation_click')}
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
            // S1(自分のカード) vs S2(他者のカード) 判定
            const isSelf = !!(currentUserId && pro && currentUserId === pro.user_id)
            trackPageView(
              isSelf ? 'share_profile_self' : 'share_profile_other',
              id
            )
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
