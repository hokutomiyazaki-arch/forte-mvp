import { Metadata } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'
  const supabase = getSupabaseAdmin()

  // プロ情報取得（実在カラムのみ）
  const { data: pro } = await supabase
    .from('professionals')
    .select('name, title')
    .eq('id', id)
    .maybeSingle()

  const proName = pro?.name || 'プロフェッショナル'
  const proTitle = pro?.title || '強みが、あなたを定義する。'
  const ogImageUrl = `${baseUrl}/hero_ogp.png`

  return {
    title: `${proName} | REALPROOF`,
    description: proTitle,
    openGraph: {
      title: `${proName} | REALPROOF`,
      description: proTitle,
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
      description: proTitle,
      images: [ogImageUrl],
    },
  }
}

export default function CardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
