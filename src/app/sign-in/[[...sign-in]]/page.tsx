import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAF7]">
      <SignIn
        fallbackRedirectUrl="/dashboard"
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'bg-white shadow-xl',
            headerTitle: 'text-[#1A1A2E]',
            headerSubtitle: 'text-gray-500',
            socialButtonsBlockButton: 'border-gray-200',
            formButtonPrimary: 'bg-[#1A1A2E] hover:bg-[#2a2a4e]',
          }
        }}
      />
    </div>
  )
}
