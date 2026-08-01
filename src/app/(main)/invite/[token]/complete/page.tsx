/**
 * §2-9 招待の登録完了処理ページ(/invite/[token]/complete)
 *
 * サインアップ後の復帰先(`/sign-up?redirect_url=/invite/{token}/complete`)。
 * 実処理は InviteAcceptPanel(クライアント側)が signed-in 判定後に自動実行する。
 * 二重実行(LINE内蔵ブラウザの2回発火・リロード)には complete API 側で冪等に対応済み。
 */

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getInviteByToken } from '@/lib/referral-invite-data'
import InviteAcceptPanel from '@/components/referral/InviteAcceptPanel'

export const dynamic = 'force-dynamic'

const T = {
  bg: '#FAF8F4',
  cardBg: '#FFFFFF',
  cardBorder: '#E8E4DC',
  dark: '#1A1A2E',
  gold: '#C4A35A',
  text: '#2D2D2D',
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'ご登録ありがとうございます | REAL PROOF',
    robots: { index: false, follow: false },
  }
}

export default async function InviteCompletePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const invite = await getInviteByToken(token)

  if (!invite) {
    notFound()
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 40px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', marginBottom: 20, marginTop: 20 }}>
        <span style={{ fontSize: 12, letterSpacing: 2, color: T.gold, fontWeight: 700 }}>REAL PROOF</span>
      </div>

      <div
        style={{
          background: T.cardBg,
          border: `1px solid ${T.cardBorder}`,
          borderRadius: 16,
          padding: '24px 20px',
        }}
      >
        <p style={{ fontSize: 14, color: T.text, lineHeight: 1.9, marginBottom: 4 }}>
          {invite.inviter.name}先生からの招待への登録を完了します。
        </p>

        <InviteAcceptPanel token={token} alreadyRegistered={invite.alreadyRegistered} />
      </div>
    </div>
  )
}
