import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://realproof.jp'

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/card/', // 公開カードページ
        ],
        disallow: [
          '/api/', // API routes
          '/dashboard', // プロダッシュボード
          '/admin', // 管理画面
          '/mycard', // クライアントマイカード（個人情報）
          '/sign-in',
          '/sign-up',
          '/vote/', // 投票ページ（QR経由で直接アクセスされるべき）
          '/vote-confirmed', // 投票完了ページ
          '/badge/claim', // バッジ付与ページ
          '/org/dashboard', // オーナーダッシュボード
          '/org/register', // 団体登録ページ
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
