import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FORTE — 本物が輝く社会へ',
  description: '実力が正当に評価され、蓄積され、検索される。人が人の価値を証明し合うプラットフォーム。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans JP", sans-serif' }}>
        <nav className="bg-[#1A1A2E] text-white px-6 py-3 flex items-center justify-between">
          <a href="/" className="text-xl font-bold tracking-wider">FORTE</a>
          <div className="flex gap-4 text-sm">
            <a href="/explore" className="hover:text-[#C4A35A] transition">プロを探す</a>
            <a href="/login" className="hover:text-[#C4A35A] transition">ログイン</a>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="text-center py-8 text-sm text-gray-400">
          © {new Date().getFullYear()} FORTE by Legrand chariot
        </footer>
      </body>
    </html>
  )
}
