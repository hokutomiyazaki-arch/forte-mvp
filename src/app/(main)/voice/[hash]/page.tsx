import { getSupabaseAdmin } from '@/lib/supabase'
import { sanitizeVoiceForDisplay } from '@/lib/voice-sanitize'
import { COLORS, FONTS } from '@/lib/design-tokens'
import ViewCountPing from './ViewCountPing'

// §2-6広域適用(2026-08-08 CEO GO): このページは外部に共有されるVoiceの単独表示ページのため、
// サーバー側で取得→AI変換した本文だけをレンダリングする(クライアント側で原文が一度でも
// DOMに載ると外部露出になるため)。あわせて他のSSRページ(/r/[slug]・/card/[id])と同じ
// force-dynamic/getSupabaseAdmin直読みパターンに揃える。
export const dynamic = 'force-dynamic'

const T = { ...COLORS, font: FONTS.main, fontMono: FONTS.mono, fontSerif: FONTS.serif }

interface VoiceShareRow {
  id: string
  hash: string
  include_profile: boolean
  view_count: number | null
  votes: { id: string; comment: string; created_at: string } | null
  professionals: {
    id: string; name: string; title: string; prefecture: string | null
    area_description: string | null; photo_url: string | null
  } | null
  gratitude_phrases: { text: string } | null
}

function NotFoundView({ message }: { message: string }) {
  return (
    <div style={{ background: T.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ color: T.textMuted, fontSize: 14 }}>{message}</div>
      <a href="/" style={{ color: T.gold, fontSize: 13, textDecoration: 'none' }}>トップページへ</a>
    </div>
  )
}

export default async function VoiceHashPage({
  params,
}: {
  params: Promise<{ hash: string }>
}) {
  const { hash } = await params
  const supabase = getSupabaseAdmin()

  const { data } = await supabase
    .from('voice_shares')
    .select(`
      id, hash, include_profile, view_count,
      votes!inner(id, comment, created_at),
      professionals!inner(id, name, title, prefecture, area_description, photo_url),
      gratitude_phrases!inner(text)
    `)
    .eq('hash', hash)
    .maybeSingle()

  if (!data) {
    return <NotFoundView message="この声は見つかりませんでした" />
  }

  const share = data as unknown as VoiceShareRow
  const vote = share.votes
  const pro = share.professionals
  const phrase = share.gratitude_phrases

  if (!vote || !pro || !phrase) {
    return <NotFoundView message="この声は見つかりませんでした" />
  }

  // §2-6広域適用(2026-08-08 CEO GO): 共有Voiceページの本文もAI変換を通す。
  // 変換不能(非表示判定)ならページ自体を「表示できません」で返す(原文は絶対に出さない)。
  const sanitizedComment = await sanitizeVoiceForDisplay(vote.id, vote.comment)
  if (!sanitizedComment) {
    return <NotFoundView message="このVoiceは表示できません" />
  }

  // 閲覧数インクリメントはクライアント側(ViewCountPing)で行う。サーバー側で加算すると
  // OGPクローラのGETでもカウントが増え、共有指標の意味が変わるため(レビュー指摘)。

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: T.font }}>
      <ViewCountPing shareId={share.id} viewCount={share.view_count || 0} />
      <div style={{ maxWidth: 420, margin: '0 auto', padding: '32px 16px' }}>

        {/* ① Voice表示（クリーム背景） */}
        <div style={{
          background: 'linear-gradient(170deg, #FAF8F4 0%, #F3EFE7 100%)',
          border: '1px solid #E8E4DC',
          borderRadius: 18, padding: '28px 22px', marginBottom: 16,
        }}>
          {/* 引用符 */}
          <div style={{ fontSize: 48, color: 'rgba(196, 163, 90, 0.3)', fontFamily: 'Georgia, serif', lineHeight: 1 }}>&ldquo;</div>

          {/* コメント */}
          <div style={{
            color: '#1A1A2E', fontSize: 20, fontFamily: T.fontSerif,
            fontWeight: 700, lineHeight: 2.0, margin: '8px 0 20px',
          }}>
            {sanitizedComment}
          </div>

          {/* 区切り + 感謝フレーズ */}
          <div style={{ height: 1, background: 'rgba(196, 163, 90, 0.3)', marginBottom: 12 }} />
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
                <div style={{ fontSize: 11, color: T.gold, fontWeight: 600, marginTop: 2 }}>{pro.title}</div>
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

        {/* ④ フッター */}
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1A2E', letterSpacing: '2px' }}>REALPROOF</div>
          <div style={{ fontSize: 10, color: '#888888', marginTop: 4 }}>強みが、あなたを定義する。</div>
        </div>
      </div>
    </div>
  )
}
