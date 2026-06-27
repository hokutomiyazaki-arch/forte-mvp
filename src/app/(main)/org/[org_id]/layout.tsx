import type { Metadata } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'

/**
 * 団体公開ページ /org/[org_id] の SEO / OGP metadata。
 *   既存 page.tsx は 'use client' のまま温存し、metadata だけを
 *   この Server Component layout で付与する（page は一切編集しない）。
 *
 *   OG 画像は /api/og/org/[org_id] で動的生成（プルーフ集積の数値を描画）。
 *   構造は /card/[id] の generateMetadata と同型（card → org 置換）。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ org_id: string }>
}): Promise<Metadata> {
  const { org_id } = await params

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'
  const supabase = getSupabaseAdmin()

  const { data: org } = await supabase
    .from('organizations')
    .select('name, description, logo_url')
    .eq('id', org_id)
    .maybeSingle()

  const orgName = (org?.name || '').trim() || 'REALPROOF 団体'
  const title = `${orgName} | REALPROOF`
  const description =
    (org?.description || '').trim() ||
    `${orgName}のREALPROOF団体ページ — 所属プロがクライアントから証明された実績`

  const ogImageUrl = `${baseUrl}/api/og/org/${org_id}`
  const orgUrl = `${baseUrl}/org/${org_id}`

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
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
