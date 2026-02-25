import Navbar from '@/components/Navbar'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="text-center py-8 text-sm text-gray-500 space-y-2">
        <div>
          <a href="/legal" className="hover:text-[#C4A35A] transition">特定商取引法に基づく表記</a>
        </div>
        <div>&copy; 2026 REAL PROOF｜株式会社Legrand chariot</div>
      </footer>
    </>
  )
}
