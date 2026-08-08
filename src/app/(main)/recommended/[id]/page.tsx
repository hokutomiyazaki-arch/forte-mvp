import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getDelegateCandidates } from '@/lib/referral-delegate-criteria'
import { DelegateCandidatesBlock } from '@/components/card/DelegateCandidatesBlock'

export const dynamic = 'force-dynamic'

/**
 * オススメのプロ（§16-32・CEO決定 2026-08-06）
 *
 * 予約を止めているプロのカードから来る専用ページ。
 * **カードには一覧を載せない**（ヘッダーの狭い枠に押し込んで縦書きに潰れた事故があったため）。
 * カードは1行の説明＋「オススメのプロ」ボタンだけにして、実際の一覧はここで出す。
 */
export async function generateMetadata({ params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin()
  const { data: pro } = await supabase
    .from('professionals')
    .select('name')
    .eq('id', params.id)
    .is('deactivated_at', null)
    .maybeSingle()
  return {
    title: pro ? `${pro.name}さんのオススメ | REAL PROOF` : 'オススメのプロ | REAL PROOF',
    robots: { index: false, follow: false },
  }
}

const T = {
  dark: '#1A1A2E',
  gold: '#C4A35A',
  bg: '#FAFAF7',
  border: '#E8E4DC',
  muted: '#6B7280',
  faint: '#9CA3AF',
}

export default async function RecommendedPage({ params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin()

  const { data: pro } = await supabase
    .from('professionals')
    .select('id, name, photo_url, delegate_criteria')
    .eq('id', params.id)
    .is('deactivated_at', null)
    .maybeSingle()

  if (!pro) notFound()

  const result = await getDelegateCandidates(supabase, {
    id: pro.id,
    delegate_criteria: (pro as any).delegate_criteria,
  })

  const candidates = result?.candidates || []

  // 見出しの根拠。**言えることだけ言う**（CEO質問「団体トップがプルーフを集めてない場合」への対応）。
  // 本人に評価済みの強みがあれば「同じ強み◯◯を持つ」と言えるが、無ければ強みには触れず
  // 「同じ団体の先生」とだけ言う。持っていない根拠を語らない。
  const matchedLabels = Array.from(
    new Set(candidates.flatMap(c => c.matchedProofLabels || []))
  ).slice(0, 3)
  const isOrg = result?.source === 'org'

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 20px 60px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ marginBottom: 20 }}>
        <a href={`/card/${pro.id}`} style={{ fontSize: 12, color: T.gold, textDecoration: 'none' }}>
          ← {pro.name}さんのページに戻る
        </a>
      </div>

      <h1 style={{ fontSize: 18, fontWeight: 700, color: T.dark, lineHeight: 1.7, marginBottom: 8 }}>
        {pro.name}さんのオススメ
      </h1>

      {/* トップの説明。根拠のある言い方だけをする */}
      <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.9, marginBottom: 4 }}>
        {matchedLabels.length > 0 && isOrg && result?.orgName
          ? <>
              {pro.name}さんと同じ強み
              <strong style={{ color: T.dark }}>「{matchedLabels.join('」「')}」</strong>
              を持つ、{result.orgName}の先生です。
            </>
          : isOrg && result?.orgName
            ? <>{pro.name}さんと同じ{result.orgName}に所属する先生です。</>
            : <>{pro.name}さんが信頼している先生です。</>}
      </p>
      <p style={{ fontSize: 12, color: T.faint, lineHeight: 1.8, marginBottom: 24 }}>
        {pro.name}さんは今ご予約を受け付けていないため、代わりにご案内しています。
      </p>

      {candidates.length === 0 ? (
        <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.8 }}>
            ご案内できる先生が今は見つかりませんでした。
          </p>
          <a href={`/card/${pro.id}`} style={{ display: 'inline-block', marginTop: 16, fontSize: 13, color: T.gold, textDecoration: 'none' }}>
            ← {pro.name}さんのページに戻る
          </a>
        </div>
      ) : (
        <DelegateCandidatesBlock
          source={result!.source}
          orgId={result!.orgId}
          orgName={result!.orgName}
          candidates={candidates}
          excludeProId={pro.id}
        />
      )}
    </div>
  )
}
