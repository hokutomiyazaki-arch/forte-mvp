import type { Metadata } from 'next'
import './globals.css'
import dynamic from 'next/dynamic'

const Navbar = dynamic(() => import('@/components/Navbar'), {
  ssr: false,
  loading: () => (
    <nav className="bg-[#1A1A2E] text-white px-6 py-3 flex items-center justify-between">
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 800, color: '#FAFAF7', letterSpacing: '2px' }}>REALPROOF</span>
      <div style={{ width: 200 }} />
    </nav>
  ),
})

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
    <html lang="ja" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Noto+Sans+JP:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen" suppressHydrationWarning style={{ fontFamily: "'Noto Sans JP', 'Inter', sans-serif", fontWeight: 500, color: '#1A1A2E', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' as any }}>
        <Navbar />
        <main className="max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="text-center py-8 text-sm text-gray-500 space-y-2">
          <div>
            <a href="/legal" className="hover:text-[#C4A35A] transition">特定商取引法に基づく表記</a>
          </div>
          <div>© 2026 REAL PROOF｜株式会社Legrand chariot</div>
        </footer>
      </body>
    </html>
  )
}
