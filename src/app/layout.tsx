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
      <body className="min-h-screen" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans JP", sans-serif' }}>
        <Navbar />
        <main className="max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="text-center py-8 text-sm text-gray-400">
          © 2026 REAL PROOF｜株式会社Legrand chariot
        </footer>
      </body>
    </html>
  )
}
