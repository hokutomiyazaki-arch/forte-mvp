import type { Metadata } from 'next'
import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import { Inter, Noto_Sans_JP } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
})

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
})
import { jaJP } from '@clerk/localizations'

// Clerk 日本語カスタマイズ（jaJP をベースにカスタムテキストで上書き）
const clerkLocalization = {
  ...jaJP,
  signIn: {
    ...jaJP.signIn,
    start: {
      ...(jaJP.signIn as any)?.start,
      title: 'ログイン',
      subtitle: 'REALPROOFにログイン',
      actionText: 'アカウントをお持ちでない方は',
      actionLink: '新規登録',
    },
  },
  signUp: {
    ...jaJP.signUp,
    start: {
      ...(jaJP.signUp as any)?.start,
      title: '新規登録',
      subtitle: 'REALPROOFに登録',
      actionText: '既にアカウントをお持ちの方は',
      actionLink: 'ログイン',
    },
  },
  userButton: {
    ...jaJP.userButton,
    action__signOut: 'ログアウト',
  },
  formFieldLabel__emailAddress: 'メールアドレス',
  formFieldLabel__password: 'パスワード',
  formButtonPrimary: '続ける',
  socialButtonsBlockButton: '{{provider|titleize}}でログイン',
  dividerText: 'または',
}

// 全ページをダイナミックレンダリングにする（env変数がビルド時に不在のため）
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'REALPROOF — 強みが、あなたを定義する。',
  description: '信頼を資産に変える、ただ一つの証明。。対面のプロフェッショナルのための強み証明プラットフォーム。',
  icons: {
    icon: [
      { url: '/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'REALPROOF — 強みが、あなたを定義する。',
    description: '信頼を資産に変える、ただ一つの証明。。対面のプロフェッショナルのための強み証明プラットフォーム。',
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
    description: '信頼を資産に変える、ただ一つの証明。。',
    images: ['https://forte-mvp.vercel.app/images/hero_ogp.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      localization={clerkLocalization}
      signInFallbackRedirectUrl="/auth-redirect"
      signUpFallbackRedirectUrl="/auth-redirect"
      appearance={{
        variables: {
          colorPrimary: '#1A1A2E',
          colorText: '#1A1A2E',
          colorTextSecondary: '#666',
          colorBackground: '#FFFFFF',
          colorInputBackground: '#FFFFFF',
          colorInputText: '#1A1A2E',
          borderRadius: '8px',
          fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
        },
        elements: {
          // Powered by Clerk フッター非表示
          footer: { display: 'none' },
          footerAction: { display: 'none' },
          // カード全体
          card: {
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            border: '1px solid #E8E4DC',
          },
          // プライマリボタン
          formButtonPrimary: {
            backgroundColor: '#1A1A2E',
            '&:hover': { backgroundColor: '#2a2a4e' },
          },
          // ソーシャルボタン
          socialButtonsBlockButton: {
            borderColor: '#E8E4DC',
          },
          // "Secured by Clerk" バッジ非表示（Development モードで有効）
          badge: { display: 'none' },
          // internal footer links
          footerActionLink: { display: 'none' },
        },
      }}
    >
      <html lang="ja" className={`${inter.variable} ${notoSansJP.variable}`}>
        <head>
          <meta name="theme-color" content="#1A1A2E" />
        </head>
        <body className="min-h-screen">
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
