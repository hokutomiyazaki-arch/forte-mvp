import type { Metadata } from 'next'
import { cache } from 'react'
import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * 団体公開ページ /org/[org_id] の SEO / OGP / 構造化データ。
 *   既存 page.tsx は 'use client' のまま温存し、metadata と JSON-LD だけを
 *   この Server Component layout で付与する（page は一切編集しない）。
 *
 *   OG 画像は /api/og/org/[org_id] で動的生成（プルーフ集積の数値を描画）。
 *   構造は /card/[id] の generateMetadata / JSON-LD と同型（card → org 置換）。
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'

/**
 * 団体の SEO データを 1 リクエスト内で 1 回だけ取得し、
 * generateMetadata と layout 本体（JSON-LD）で共用する（二重クエリ回避）。
 * クエリ形・VIEW カラム名は /api/og/org/[org_id] と同一。
 */
const getOrgSeoData = cache(async (orgId: string) => {
  const supabase = getSupabaseAdmin()

  const { data: org } = await supabase
    .from('organizations')
    .select('name, description, logo_url')
    .eq('id', orgId)
    .maybeSingle()

  const { data: agg } = await supabase
    .from('org_aggregate')
    .select('active_member_count, total_org_votes')
    .eq('organization_id', orgId)
    .maybeSingle()

  return { org, agg }
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org_id: string }>
}): Promise<Metadata> {
  const { org_id } = await params

  const { org } = await getOrgSeoData(org_id)

  const orgName = (org?.name || '').trim() || 'REALPROOF 団体'
  const title = `${orgName} | REALPROOF`
  const description =
    (org?.description || '').trim() ||
    `${orgName}のREALPROOF団体ページ — 所属プロがクライアントから証明された実績`

  const ogImageUrl = `${BASE_URL}/api/og/org/${org_id}`
  const orgUrl = `${BASE_URL}/org/${org_id}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: orgUrl,
      siteName: 'REALPROOF',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${orgName}のREALPROOF団体ページ`,
        },
      ],
      locale: 'ja_JP',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ org_id: string }>
}) {
  const { org_id } = await params

  const { org, agg } = await getOrgSeoData(org_id)

  // 団体が取れない場合は JSON-LD を付けずに children のみ返す（card 版と同方針）
  const orgName = (org?.name || '').trim()
  if (!orgName) {
    return <>{children}</>
  }

  const totalVotes = Number(agg?.total_org_votes) || 0

  // Schema.org Organization。
  // REALPROOF の票は賛成票のみのため ratingValue=5 固定（bestRating=worstRating=5）、
  // ratingCount = 所属プロ累計の confirmed 投票数（= 累計証明数）。
  // 票が 0 のとき aggregateRating は付けない（card 版と同方針）。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgSchema: any = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: orgName,
    url: `${BASE_URL}/org/${org_id}`,
  }

  const description = (org?.description || '').trim()
  if (description) {
    orgSchema.description = description
  }

  if (org?.logo_url) {
    orgSchema.logo = org.logo_url
  }

  if (totalVotes > 0) {
    orgSchema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: '5',
      ratingCount: totalVotes,
      bestRating: '5',
      worstRating: '5',
    }
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
      />
      {children}
    </>
  )
}
