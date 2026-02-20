'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Professional, VoteSummary, Vote } from '@/lib/types'
import { resolveProofLabels, resolvePersonalityLabels } from '@/lib/proof-labels'
import { COLORS, FONTS } from '@/lib/design-tokens'
import Logo from '@/components/Logo'
import VoiceShareModal from '@/components/VoiceShareCard'

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

interface GratitudePhrase {
  id: number
  text: string
  is_default: boolean
  sort_order: number
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
  const [expandedVoice, setExpandedVoice] = useState<string | null>(null)
  const [phraseSelecting, setPhraseSelecting] = useState<string | null>(null)
  const [selectedPhrases, setSelectedPhrases] = useState<Record<string, number>>({})
  const [phrases, setPhrases] = useState<GratitudePhrase[]>([])
  const [animated, setAnimated] = useState(false)
  const [shareModalVoice, setShareModalVoice] = useState<Vote | null>(null)

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

      // 感謝フレーズ
      const { data: phrasesData } = await supabase
        .from('gratitude_phrases').select('*').order('sort_order') as any
      if (phrasesData) setPhrases(phrasesData)

      setLoading(false)
      // バーアニメーション開始を少し遅延
      setTimeout(() => setAnimated(true), 100)
    }
    load()
  }, [id])

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {pro.photo_url ? (
            <img src={pro.photo_url} alt={pro.name}
              style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: T.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 'bold', flexShrink: 0 }}>
              {pro.name.charAt(0)}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: T.dark }}>{pro.name}</div>
            <div style={{ fontSize: 12, color: T.gold, fontWeight: 500, marginTop: 2 }}>{pro.title}</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              {pro.prefecture && <span>{pro.prefecture}</span>}
              {pro.area_description && <span> · {pro.area_description}</span>}
              {pro.is_online_available && <span style={{ marginLeft: 6, color: T.gold }}>● オンライン対応</span>}
            </div>
            {pro.is_founding_member && (
              <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 8px', background: T.gold, color: '#fff', fontSize: 10, borderRadius: 99, fontWeight: 500 }}>
                Founding Member
              </span>
            )}
          </div>
        </div>
        <div style={{ height: 1, background: T.divider, margin: '16px 0' }} />
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: 30, fontWeight: 'bold', color: T.gold, fontFamily: T.fontMono }}>{totalVotes}</span>
          <span style={{ fontSize: 13, color: T.textSub, marginLeft: 6 }}>proofs</span>
        </div>
      </div>

      {/* ═══ BIO ═══ */}
      {pro.bio && (
        <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: T.textSub, lineHeight: 1.9, whiteSpace: 'pre-wrap', margin: 0 }}>{pro.bio}</p>
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
              borderRadius: 10, fontSize: 12, fontWeight: 600, fontFamily: T.font,
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

              {/* Top 3 */}
              {top3.length > 0 && (
                <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: 18, marginBottom: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {top3.map((v, i) => {
                      const pct = (v.vote_count / maxVotes) * 100
                      return (
                        <div key={v.category}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 'bold', color: T.text }}>{v.category}</span>
                            <span style={{ fontSize: 16, fontWeight: 'bold', color: T.gold, fontFamily: T.fontMono }}>{v.vote_count}</span>
                          </div>
                          <div style={{ height: 8, background: '#F0EDE6', borderRadius: 99 }}>
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

              {/* 残り */}
              {rest.length > 0 && (
                <div style={{ background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: 18, marginBottom: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {rest.map((v, i) => {
                      const pct = (v.vote_count / maxVotes) * 100
                      return (
                        <div key={v.category}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, color: T.text }}>{v.category}</span>
                            <span style={{ fontSize: 13, color: T.textMuted, fontFamily: T.fontMono }}>{v.vote_count}</span>
                          </div>
                          <div style={{ height: 5, background: '#F0EDE6', borderRadius: 99 }}>
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
              {displayBadges.map((badge, i) => (
                <div key={i}
                  style={{
                    background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14,
                    padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
                    cursor: 'pointer', transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = T.gold)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = T.cardBorder)}
                >
                  {badge.image_url ? (
                    <img src={badge.image_url} alt={badge.label} style={{ width: 56, height: 56, objectFit: 'contain' }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: 12, background: `linear-gradient(135deg, ${T.gold}, #D4B96A)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
                      IMG
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 'bold', color: T.text }}>{badge.label}</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>認定バッジ</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0', color: T.textMuted, fontSize: 13 }}>
              認定・資格はまだ登録されていません
            </div>
          )}
        </div>
      )}

      {/* ═══ タブコンテンツ: Voices ═══ */}
      {activeTab === 'voices' && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: 2, textTransform: 'uppercase', fontFamily: T.fontMono, marginBottom: 10 }}>
            VOICES — {voiceCount} COMMENTS
          </div>
          {voiceCount > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {comments.map((c: Vote) => {
                const isExpanded = expandedVoice === c.id
                const isSelectingPhrase = phraseSelecting === c.id
                const selectedPhraseId = selectedPhrases[c.id]
                const selectedPhraseText = phrases.find(p => p.id === selectedPhraseId)?.text
                  || phrases.find(p => p.is_default)?.text || ''

                return (
                  <div key={c.id}
                    onClick={() => {
                      if (!isExpanded) setExpandedVoice(c.id)
                    }}
                    style={{
                      background: T.dark, borderRadius: 14, padding: '18px 16px',
                      cursor: !isExpanded ? 'pointer' : 'default',
                      transition: 'all 0.3s',
                    }}
                  >
                    {/* 引用符 */}
                    <div style={{ fontSize: 32, color: `${T.gold}40`, fontFamily: 'Georgia, serif', lineHeight: 1 }}>&ldquo;</div>
                    {/* コメント */}
                    <div style={{ fontSize: 13, color: '#fff', lineHeight: 1.9, margin: '4px 0 10px' }}>{c.comment}</div>
                    {/* 日付 */}
                    <div style={{ fontSize: 11, color: '#444', fontFamily: T.fontMono }}>
                      {new Date(c.created_at).toLocaleDateString('ja-JP')}
                    </div>

                    {/* 展開部分 */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #333', marginTop: 14, paddingTop: 14 }}
                        onClick={e => e.stopPropagation()}>
                        {/* 感謝フレーズ */}
                        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>感謝のひとこと</div>

                        {isSelectingPhrase ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                            {phrases.map(p => (
                              <button key={p.id}
                                onClick={() => {
                                  setSelectedPhrases(prev => ({ ...prev, [c.id]: p.id }))
                                  setPhraseSelecting(null)
                                }}
                                style={{
                                  background: selectedPhraseId === p.id ? T.gold : '#2a2a3e',
                                  color: selectedPhraseId === p.id ? T.dark : '#ccc',
                                  border: 'none', borderRadius: 8, padding: '8px 12px',
                                  fontSize: 12, cursor: 'pointer', textAlign: 'left',
                                  fontFamily: T.font,
                                }}
                              >
                                {p.text}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div
                            onClick={() => setPhraseSelecting(c.id)}
                            style={{
                              background: '#2a2a3e', borderRadius: 8, padding: '8px 12px',
                              fontSize: 12, color: T.gold, cursor: 'pointer', marginBottom: 12,
                              fontStyle: 'italic',
                            }}
                          >
                            ── {selectedPhraseText || '感謝フレーズを選ぶ'}
                          </div>
                        )}

                        {/* お礼ボタン → モーダル */}
                        <button
                          onClick={() => setShareModalVoice(c)}
                          style={{
                            width: '100%', padding: '10px', border: `1px solid ${T.gold}`,
                            background: 'transparent', color: T.gold, borderRadius: 10,
                            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.font,
                          }}
                        >
                          この声にお礼する
                        </button>
                      </div>
                    )}
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
            style={{
              display: 'block', textAlign: 'center', padding: 15, borderRadius: 14,
              background: T.dark, color: T.gold, fontWeight: 600, fontSize: 14,
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
              fontWeight: 600, fontSize: 14, textDecoration: 'none', fontFamily: T.font,
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

      {/* ★ タスク11で RelatedPros をここに追加 ★ */}

      {/* Voice Share Modal */}
      {shareModalVoice && pro && (
        <VoiceShareModal
          isOpen={true}
          onClose={() => setShareModalVoice(null)}
          voice={shareModalVoice}
          phraseId={selectedPhrases[shareModalVoice.id] || phrases.find(p => p.is_default)?.id || 1}
          phraseText={
            phrases.find(p => p.id === selectedPhrases[shareModalVoice.id])?.text
            || phrases.find(p => p.is_default)?.text || ''
          }
          proId={pro.id}
          proName={pro.name}
          proTitle={pro.title}
          proPhotoUrl={pro.photo_url}
          proPrefecture={pro.prefecture}
          proAreaDescription={pro.area_description}
          totalProofs={totalVotes}
          topStrengths={sortedVotes.slice(0, 3).map(v => ({ label: v.category, count: v.vote_count }))}
        />
      )}

      {/* ═══ フッター ═══ */}
      <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
        <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: 3, fontFamily: T.font, marginBottom: 10 }}>
          強みが、あなたを定義する。
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Logo size={0.6} dark={false} />
        </div>
      </div>
    </div>
  )
}
