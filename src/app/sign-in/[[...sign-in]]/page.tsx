import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import LineSignInSection from '@/components/LineSignInSection'

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Navbar />
      <div className="flex flex-col items-center justify-center pt-20 pb-12 px-4">
        <SignIn
          fallbackRedirectUrl="/auth-redirect"
          appearance={{
            elements: {
              rootBox: 'mx-auto',
              card: 'bg-white shadow-lg',
              headerTitle: 'text-[#1A1A2E]',
              headerSubtitle: 'text-gray-500',
              socialButtonsBlockButton: 'border-gray-200',
              formButtonPrimary: 'bg-[#1A1A2E] hover:bg-[#2a2a4e]',
              // PWA非互換のClerk標準LINEボタンを非表示 → 自前LINEボタン(LineSignInSection)に一本化
              socialButtonsBlockButton__line: 'hidden',
              socialButtonsIconButton__line: 'hidden',
            }
          }}
        />
        <LineSignInSection />
        <Link
          href="/"
          className="mt-6 text-sm text-gray-500 hover:text-[#C4A35A] transition-colors"
        >
          &larr; トップページに戻る
        </Link>
      </div>
    </div>
  )
}
