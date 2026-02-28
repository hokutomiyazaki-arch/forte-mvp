import type { Metadata } from 'next'
import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import { jaJP } from '@clerk/localizations'

// 全ページをダイナミックレンダリングにする（env変数がビルド時に不在のため）
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'REALPROOF — 強みが、あなたを定義する。',
  description: 'クライアントの信頼が資産に変わるデジタル名刺。対面のプロフェッショナルのための強み証明プラットフォーム。',
  openGraph: {
    title: 'REALPROOF — 強みが、あなたを定義する。',
    description: 'クライアントの信頼が資産に変わるデジタル名刺。対面のプロフェッショナルのための強み証明プラットフォーム。',
    images: [
      {
        url: 'https://forte-mvp.vercel.app/images/hero_ogp.png',
        width: 1200,
        height: 630,
        alt: 'REALPROOF',
      },
    ],
    siteName: 'REALPROOF',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'REALPROOF — 強みが、あなたを定義する。',
    description: 'クライアントの信頼が資産に変わるデジタル名刺。',
    images: ['https://forte-mvp.vercel.app/images/hero_ogp.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider localization={jaJP}>
      <html lang="ja">
        <head>
          <link rel="manifest" href="/manifest.json" />
          <meta name="theme-color" content="#1A1A2E" />
          <link rel="icon" href="/icon-192.svg" type="image/svg+xml" />
          <link rel="apple-touch-icon" href="/icon-192.svg" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Noto+Sans+JP:wght@400;500;600;700;800;900&display=swap"
            rel="stylesheet"
          />
        </head>
        <body className="min-h-screen">
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
