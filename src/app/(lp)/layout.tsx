import Link from 'next/link'

/**
 * (lp) レイアウト — 販売LP・特商法など「アプリ外」の公開ページ用。
 * (main) と違い Navbar / AnnouncementBanner / max-w 制約を持たない（フルブリード）。
 * フッターに特商法リンクとコピーライトのみ。
 */
export default function LpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      {children}
      <footer className="bg-[#1A1A2E] text-center py-8 px-4 text-xs text-gray-400 space-y-2">
        <div>
          <Link href="/legal" className="hover:text-[#C4A35A] transition">
            特定商取引法に基づく表記
          </Link>
        </div>
        {/* TODO(Phase 2.5): COMPANY_INFO.name に差し替え */}
        <div>&copy; 2026 株式会社 Le grand chariot</div>
      </footer>
    </div>
  )
}
