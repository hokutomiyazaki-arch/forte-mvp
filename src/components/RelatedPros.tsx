'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { COLORS, FONTS } from '@/lib/design-tokens'

const T = { ...COLORS, font: FONTS.main, fontMono: FONTS.mono }

interface RelatedProsProps {
  currentProId: string
  prefecture: string
  maxDisplay?: number
  title?: string
  showWhenEmpty?: boolean
}

interface RelatedPro {
  id: string
  name: string
  title: string
  photo_url: string | null
  prefecture: string | null
  area_description: string | null
  topProofs: { label: string; count: number }[]
}

export default function RelatedPros({
  currentProId,
  prefecture,
  maxDisplay = 3,
  title = 'この地域で活躍するプロ',
  showWhenEmpty = false,
}: RelatedProsProps) {
  const supabase = createClient()
  const [pros, setPros] = useState<RelatedPro[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // 同じ都道府県のプロ（現在のプロを除外）
      const { data: proData } = await (supabase as any)
        .from('professionals')
        .select('id, name, title, photo_url, prefecture, area_description')
        .eq('prefecture', prefecture)
        .neq('id', currentProId)
        .not('name', 'is', null)
        .neq('name', '')
        .order('created_at', { ascending: false })
        .limit(maxDisplay)

      if (!proData || proData.length === 0) {
        setLoading(false)
        return
      }

      // 各プロのトッププルーフを取得
      const proIds = proData.map((p: any) => p.id)
      const { data: voteData } = await (supabase as any)
        .from('vote_summary')
        .select('professional_id, proof_id, vote_count')
        .in('professional_id', proIds)
        .order('vote_count', { ascending: false })

      // proof_items からラベルを取得
      const { data: piData } = await (supabase as any)
        .from('proof_items')
        .select('id, label')

      const proofLabelMap = new Map<string, string>()
      if (piData) {
        for (const pi of piData) proofLabelMap.set(pi.id, pi.label)
      }

      // プロ別にグルーピングしてtop2を表示
      const votesByPro = new Map<string, { label: string; count: number }[]>()
      if (voteData) {
        for (const v of voteData) {
          const label = proofLabelMap.get(v.proof_id) || ''
          if (!label) continue
          const arr = votesByPro.get(v.professional_id) || []
          if (arr.length < 2) {
            arr.push({ label, count: v.vote_count })
            votesByPro.set(v.professional_id, arr)
          }
        }
      }

      const result: RelatedPro[] = proData.map((p: any) => ({
        ...p,
        topProofs: votesByPro.get(p.id) || [],
      }))

      setPros(result)
      setLoading(false)
    }
    load()
  }, [currentProId, prefecture, maxDisplay])

  if (loading) return null
  if (pros.length === 0 && !showWhenEmpty) return null

  return (
    <div style={{ background: T.bg, padding: '16px 0' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.dark, marginBottom: 14, fontFamily: T.font }}>
        {title}
      </div>

      {pros.length > 0 ? (
        <>
          {/* 横スクロールカルーセル */}
          <div style={{
            display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8,
            scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch',
          }}>
            {pros.map(p => (
              <a
                key={p.id}
                href={`/card/${p.id}`}
                style={{
                  flex: '0 0 200px', scrollSnapAlign: 'start',
                  background: T.cardBg, borderRadius: 14, padding: 16,
                  border: `1px solid ${T.cardBorder}`, textDecoration: 'none',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                }}
              >
                {/* 写真 */}
                {p.photo_url ? (
                  <img src={p.photo_url} alt={p.name}
                    style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', marginBottom: 10 }} />
                ) : (
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%', background: T.dark,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 10,
                  }}>
                    {p.name.charAt(0)}
                  </div>
                )}

                {/* 名前 */}
                <div style={{ fontSize: 14, fontWeight: 'bold', color: T.dark, textAlign: 'center' }}>{p.name}</div>
                {/* 肩書き */}
                <div style={{ fontSize: 11, color: T.textSub, textAlign: 'center', marginTop: 2 }}>{p.title}</div>
                {/* エリア */}
                <div style={{ fontSize: 10, color: T.textMuted, textAlign: 'center', marginTop: 2 }}>
                  {p.prefecture}{p.area_description ? ` · ${p.area_description}` : ''}
                </div>

                {/* トッププルーフ */}
                {p.topProofs.length > 0 && (
                  <div style={{ width: '100%', marginTop: 10, borderTop: `1px solid ${T.divider}`, paddingTop: 8 }}>
                    {p.topProofs.map((tp, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: i < p.topProofs.length - 1 ? 4 : 0,
                      }}>
                        <span style={{
                          fontSize: 11, color: T.text, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                        }}>
                          {tp.label}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 'bold', color: T.gold,
                          background: `${T.gold}15`, borderRadius: 99, padding: '1px 8px',
                          marginLeft: 6, flexShrink: 0, fontFamily: T.fontMono,
                        }}>
                          {tp.count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </a>
            ))}
          </div>

          {/* もっと見る */}
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <a href="/search" style={{ color: T.gold, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              もっと見る →
            </a>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '16px 0', color: T.textMuted, fontSize: 13 }}>
          この地域のプロはまだ登録されていません
        </div>
      )}
    </div>
  )
}
