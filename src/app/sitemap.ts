import { MetadataRoute } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'

// 1 時間ごとに再生成（プロ追加・更新を翌時間までに反映）
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
  ]

  // 公開カードページ（setup_completed=true & deactivated でないプロのみ）
  try {
    const supabase = getSupabaseAdmin()
    const { data: professionals } = await supabase
      .from('professionals')
      .select('id, updated_at')
      .eq('setup_completed', true)
      .is('deactivated_at', null)
      .order('updated_at', { ascending: false })

    const proPages: MetadataRoute.Sitemap = (professionals || []).map((pro) => ({
      url: `${baseUrl}/card/${pro.id}`,
      lastModified: pro.updated_at ? new Date(pro.updated_at) : new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    }))

    return [...staticPages, ...proPages]
  } catch (err) {
    // サイトマップ生成失敗時は静的ページだけ返す（ビルドを止めない）
    console.error('[sitemap] professionals fetch failed:', err)
    return staticPages
  }
}
