'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { COLORS, FONTS } from '@/lib/design-tokens'
import Logo from '@/components/Logo'

const T = { ...COLORS, font: FONTS.main, fontMono: FONTS.mono, fontSerif: FONTS.serif }

interface VoiceShareData {
  id: string
  hash: string
  include_profile: boolean
  view_count: number
  votes: { comment: string; created_at: string }
  professionals: {
    id: string; name: string; title: string; prefecture: string | null;
    area_description: string | null; photo_url: string | null
  }
  gratitude_phrases: { text: string }
}

export default function VoiceHashPage() {
  const params = useParams()
  const hash = params.hash as string
  const supabase = createClient()
  const [share, setShare] = useState<VoiceShareData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await (supabase as any)
        .from('voice_shares')
        .select(`
          id, hash, include_profile, view_count,
          votes!inner(comment, created_at),
          professionals!inner(id, name, title, prefecture, area_description, photo_url),
          gratitude_phrases!inner(text)
        `)
        .eq('hash', hash)
        .maybeSingle()

      if (!data) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setShare(data)

      // 閲覧数インクリメント
      await (supabase as any)
        .from('voice_shares')
        .update({ view_count: (data.view_count || 0) + 1 })
        .eq('id', data.id)

      setLoading(false)
    }
    load()
  }, [hash])

  if (loading) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: T.textMuted, fontSize: 14 }}>読み込み中...</div>
      </div>
    )
  }

  if (notFound || !share) {
    return (
      <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ color: T.textMuted, fontSize: 14 }}>この声は見つかりませんでした</div>
        <a href="/" style={{ color: T.gold, fontSize: 13, textDecoration: 'none' }}>トップページへ</a>
      </div>
    )
  }

  const { votes: vote, professionals: pro, gratitude_phrases: phrase } = share

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: T.font }}>
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '32px 16px' }}>

        {/* ① Voice表示 */}
        <div style={{
          background: T.dark, borderRadius: 18, padding: '28px 22px', marginBottom: 16,
        }}>
          {/* 引用符 */}
          <div style={{ fontSize: 48, color: `${T.gold}40`, fontFamily: 'Georgia, serif', lineHeight: 1 }}>&ldquo;</div>

          {/* コメント */}
          <div style={{
            color: '#fff', fontSize: 20, fontFamily: T.fontSerif,
            fontWeight: 700, lineHeight: 2.0, margin: '8px 0 20px',
          }}>
            {vote.comment}
          </div>

          {/* 区切り + 感謝フレーズ */}
          <div style={{ height: 1, background: '#333', marginBottom: 12 }} />
          <div style={{ color: T.gold, fontSize: 12, fontStyle: 'italic', fontWeight: 700 }}>
            ── {phrase.text}
          </div>
        </div>

        {/* ② プロフィール（include_profile=trueの場合のみ） */}
        {share.include_profile && (
          <div style={{
            background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 16,
            padding: '20px 18px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {pro.photo_url ? (
                <img src={pro.photo_url} alt={pro.name}
                  style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', background: T.dark,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 20, fontWeight: 'bold', flexShrink: 0,
                }}>
                  {pro.name.charAt(0)}
                </div>
              )}
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: T.dark }}>{pro.name}</div>
                <div style={{ fontSize: 11, color: T.gold, fontWeight: 500, marginTop: 2 }}>{pro.title}</div>
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>
                  {pro.prefecture}{pro.area_description ? ` · ${pro.area_description}` : ''}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <a href={`/card/${pro.id}`}
                style={{
                  color: T.gold, fontSize: 12, fontWeight: 600, textDecoration: 'none',
                }}
              >
                このプロのカードを見る →
              </a>
            </div>
          </div>
        )}

        {/* ③ CTA */}
        <div style={{
          background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 16,
          padding: '24px 20px', textAlign: 'center', marginBottom: 16,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.dark, marginBottom: 8 }}>
            あなたも強みを証明しませんか？
          </div>
          <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.8, marginBottom: 16 }}>
            REALPROOFは、クライアントからの声が<br />
            あなたの価値を証明するプラットフォームです。
          </div>
          <a
            href="/login?role=pro"
            style={{
              display: 'inline-block', padding: '12px 32px', borderRadius: 12,
              background: T.dark, color: T.gold, fontSize: 13, fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            プロとして登録する
          </a>
        </div>

        {/* ④ REALPROOF説明 + Logo */}
        <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
          <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: 3, fontFamily: T.font, marginBottom: 10 }}>
            強みが、あなたを定義する。
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Logo size={0.6} dark={false} />
          </div>
        </div>
      </div>
    </div>
  )
}
