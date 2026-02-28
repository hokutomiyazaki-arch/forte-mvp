import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAF7]">
      <SignUp
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'bg-white shadow-xl',
            headerTitle: 'text-[#1A1A2E]',
            headerSubtitle: 'text-gray-500',
            formButtonPrimary: 'bg-[#1A1A2E] hover:bg-[#2a2a4e]',
          }
        }}
      />
    </div>
  )
}
