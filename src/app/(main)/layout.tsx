import Navbar from '@/components/Navbar'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import { SharedDataProvider } from '@/contexts/SharedDataContext'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <SharedDataProvider>
      <Navbar />
      <AnnouncementBanner />
      <main className="max-w-5xl mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="text-center py-8 text-sm text-gray-500 space-y-2">
        <div className="flex items-center justify-center gap-4">
          <a href="/legal" className="hover:text-[#C4A35A] transition">特定商取引法に基づく表記</a>
          <span className="text-gray-300">|</span>
          <a href="/bug-report" className="hover:text-[#C4A35A] transition">不具合・エラーのご報告</a>
        </div>
        <div>&copy; 2026 REAL PROOF｜株式会社Legrand chariot</div>
      </footer>
    </SharedDataProvider>
  )
}
