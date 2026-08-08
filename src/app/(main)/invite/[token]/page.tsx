/**
 * §2-9 外部プロの招待ランディング(/invite/[token])
 *
 * - 認証不要（誰でも閲覧できる。auth()を呼ばない）
 * - noindex（検索エンジンにインデックスさせない）
 * - 実際のサインアップ/登録完了処理はクライアント側(InviteAcceptPanel)で行う
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
  textSub: '#555555',
}

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params
  const invite = await getInviteByToken(token)

  const title = invite ? `${invite.inviter.name}さんからの招待 | REAL PROOF` : 'ご招待 | REAL PROOF'

  return {
    title,
    description: 'REAL PROOF への招待ページです。',
    robots: { index: false, follow: false },
  }
}

export default async function InvitePage({
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
        {/* §17-12(CEO指示 2026-08-06): QR/シェアで飛んできた先に、送り主のメッセージと
            新規登録ボタンを出す。文面はプロが共有時に見ているテキストと同じにする
            （渡した本人と受け取った側で言っていることが違う、を作らない）。 */}
        <div style={{ fontSize: 12, color: T.textSub, marginBottom: 8 }}>
          {invite.inviter.name}先生からのご招待
        </div>
        <p style={{ fontSize: 14, color: T.text, lineHeight: 1.9, marginBottom: 16 }}>
          {invite.inviteeName ? `${invite.inviteeName}先生` : 'あなた'}をぜひ私の「紹介リスト」に載せたく、ご連絡しました。
          <br />
          REALPROOFという、クライアントからの評価が実績として記録に残るサービスです。
        </p>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8, marginBottom: 4 }}>
          下のボタンからプロフィールを作成すると、
          <strong>自動で{invite.inviter.name}先生の紹介リストに載ります</strong>。
          紹介を受け取れるようになります。
        </p>

        <InviteAcceptPanel token={token} alreadyRegistered={invite.alreadyRegistered} />
      </div>
    </div>
  )
}
