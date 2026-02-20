import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'REALPROOFに届いた声',
  description: 'クライアントからプロフェッショナルへ届いた、本物の声。',
  openGraph: {
    title: 'REALPROOFに届いた声',
    description: 'クライアントからプロフェッショナルへ届いた、本物の声。',
    images: ['/og-voice.png'],
  },
}

export default function VoiceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
