import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FORTE - 強みに人が集まるデジタル名刺',
  description: '本物が輝く社会へ。隠れたスゴい人に出会える。',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-forte-cream">
        {children}
      </body>
    </html>
  )
}
