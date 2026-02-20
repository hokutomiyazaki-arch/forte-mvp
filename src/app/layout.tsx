import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'REAL PROOF — 本物が輝く社会へ',
  description: '強みが正当に評価され、蓄積され、検索される。人が人の価値を証明し合うプラットフォーム。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700;900&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300&family=Noto+Serif+JP:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans JP", sans-serif' }}>
        <Navbar />
        <main className="max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="text-center py-8 text-sm text-gray-400 space-y-2">
          <div>
            <a href="/legal" className="hover:text-[#C4A35A] transition">特定商取引法に基づく表記</a>
          </div>
          <div>© 2026 REAL PROOF｜株式会社Legrand chariot</div>
        </footer>
      </body>
    </html>
  )
}
