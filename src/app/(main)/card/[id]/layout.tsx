import { Metadata } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * generateMetadata — Step 4a で拡張:
 *   description に Voice 数 + top proof（strength_label）を動的埋込。
 *   vote_summary(professional_id, proof_id, vote_count) + proof_items(id, strength_label)
 *   を JOIN して上位2件を抽出。失敗時は proTitle にフォールバック。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'
  const supabase = getSupabaseAdmin()

  // プロ情報
  const { data: pro } = await supabase
    .from('professionals')
    .select('name, title, prefecture')
    .eq('id', id)
    .maybeSingle()

  const proName = pro?.name || 'プロフェッショナル'
  const proTitle = pro?.title || '強みが、あなたを定義する。'
  const ogImageUrl = `${baseUrl}/images/hero_ogp.png`

  // description 組み立て — 初期値は proTitle
  let description = proTitle

  try {
    // 投票サマリ: 上位2件の proof_id + vote_count
    const { data: voteStats } = await supabase
      .from('vote_summary')
      .select('proof_id, vote_count')
      .eq('professional_id', id)
      .order('vote_count', { ascending: false })
      .limit(2)

    // 総投票数（status=confirmed のみ）
    const { count: totalVotes } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('professional_id', id)
      .eq('status', 'confirmed')

    if (totalVotes && totalVotes > 0 && voteStats && voteStats.length > 0) {
      // proof_id → strength_label をまとめて解決
      const proofIds = voteStats
        .map((v) => v.proof_id)
        .filter((pid): pid is string => !!pid)
      let topProofs = ''
      if (proofIds.length > 0) {
        const { data: labels } = await supabase
          .from('proof_items')
          .select('id, strength_label, label')
          .in('id', proofIds)
        if (labels && labels.length > 0) {
          const labelMap = new Map<string, string>()
          for (const item of labels) {
            const display = item.strength_label || item.label
            if (display) labelMap.set(item.id, display)
          }
          topProofs = voteStats
            .map((v) => labelMap.get(v.proof_id))
            .filter((s): s is string => !!s)
            .slice(0, 2)
            .join('・')
        }
      }

      if (topProofs) {
        description = `【${totalVotes}人のクライアントから証明】${topProofs}で評価されるプロフェッショナル。${proTitle}`
      } else {
        description = `${totalVotes}人のクライアントから信頼されるプロフェッショナル。${proTitle}`
      }
    }
  } catch (err) {
    console.error('[card/layout] vote_summary lookup failed:', err)
    // description は proTitle のまま
  }

  // 地域を先頭に
  if (pro?.prefecture) {
    description = `${pro.prefecture} | ${description}`
  }

  // Google 推奨の 160 文字に切り詰め
  if (description.length > 160) {
    description = description.substring(0, 157) + '...'
  }

  return {
    title: `${proName} | REALPROOF`,
    description,
    openGraph: {
      title: `${proName} | REALPROOF`,
      description,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
        },
      ],
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${proName} | REALPROOF`,
      description,
      images: [ogImageUrl],
    },
  }
}

/**
 * CardLayout — Step 4a で拡張:
 *   Schema.org Person + AggregateRating の JSON-LD を埋込。
 *   Google 検索結果で Person として認識され、投票数>0 なら★リッチリザルト対象に。
 */
export default async function CardLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'
  const supabase = getSupabaseAdmin()

  const { data: pro } = await supabase
    .from('professionals')
    .select('name, title, bio, photo_url, prefecture')
    .eq('id', id)
    .maybeSingle()

  if (!pro || !pro.name) {
    return <>{children}</>
  }

  const { count: totalVotes } = await supabase
    .from('votes')
    .select('*', { count: 'exact', head: true })
    .eq('professional_id', id)
    .eq('status', 'confirmed')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personSchema: any = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: pro.name,
    description: pro.title || pro.bio || 'プロフェッショナル',
    url: `${baseUrl}/card/${id}`,
  }

  if (pro.photo_url) {
    personSchema.image = pro.photo_url
  }

  if (pro.prefecture) {
    personSchema.address = {
      '@type': 'PostalAddress',
      addressRegion: pro.prefecture,
      addressCountry: 'JP',
    }
  }

  // AggregateRating は投票数があるときのみ。
  // REALPROOF は賛成票のみなので ratingValue=5 固定（bestRating=worstRating=5）。
  if (totalVotes && totalVotes > 0) {
    personSchema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: '5',
      reviewCount: totalVotes,
      bestRating: '5',
      worstRating: '5',
    }
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />
      {children}
    </>
  )
}
