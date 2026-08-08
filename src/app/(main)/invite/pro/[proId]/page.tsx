/**
 * §17-13 プロ招待QRのランディング(/invite/pro/[proId])
 *
 * - 認証不要（誰でも閲覧できる。auth()を呼ばない）
 * - noindex（検索エンジンにインデックスさせない）
 * - トークン無し。1枚のQRを何人にでも見せられる（使い切りではない）
 * - 登録処理は ProInviteAcceptPanel（クライアント側）が signed-in 判定後に自動実行する
 *
 * ルーティング注意: 同じ階層に /invite/[token] があるが、Next.js は静的セグメント(pro)を
 * 動的セグメント([token])より優先するため衝突しない。
 */

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'
import ProInviteAcceptPanel from '@/components/referral/ProInviteAcceptPanel'

export const dynamic = 'force-dynamic'

const T = {
  bg: '#FAF8F4',
  cardBg: '#FFFFFF',
  cardBorder: '#E8E4DC',
  gold: '#C4A35A',
  text: '#2D2D2D',
  textSub: '#555555',
}

async function getInviterPro(proId: string): Promise<{ id: string; name: string } | null> {
  // UUID以外(誤ったQR・打ち間違い)でPostgRESTの22P02を投げさせない
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proId)) return null

  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('professionals')
    .select('id, name, deactivated_at')
    .eq('id', proId)
    .maybeSingle()

  if (!data || data.deactivated_at) return null
  return { id: data.id, name: data.name }
}

export async function generateMetadata(
  { params }: { params: Promise<{ proId: string }> }
): Promise<Metadata> {
  const { proId } = await params
  const pro = await getInviterPro(proId)

  return {
    title: pro ? `${pro.name}さんからの招待 | REAL PROOF` : 'ご招待 | REAL PROOF',
    description: 'REAL PROOF への招待ページです。',
    robots: { index: false, follow: false },
  }
}

export default async function ProInvitePage({
  params,
}: {
  params: Promise<{ proId: string }>
}) {
  const { proId } = await params
  const pro = await getInviterPro(proId)

  if (!pro) {
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
        {/* このQRは「施術者・指導者の方」に向けたもの。クライアント向けの紹介リストQRと
            間違えて読まれても、ここで違いが分かるように最初に書く。
            §17-17(CEO指摘 2026-08-06): 読むのは**REAL PROOFを知らない先生**。
            サービスの説明と「無料」を先に出し、内部用語（気になるプロ）は最後に小さく置く。 */}
        <div style={{ fontSize: 12, color: T.textSub, marginBottom: 8 }}>
          施術者・指導者の方へ／{pro.name}先生からのご招待
        </div>
        <p style={{ fontSize: 15, color: T.text, lineHeight: 1.9, marginBottom: 12, fontWeight: 700 }}>
          受けた人の言葉が、そのまま実績として残る。
        </p>
        <p style={{ fontSize: 14, color: T.text, lineHeight: 1.9, marginBottom: 16 }}>
          REAL PROOF は、実際にセッションを受けたクライアントだけが記録を残せるサービスです。
          いただいた評価は消えない実績としてあなたのページに積み上がり、
          それを見た方からのご予約やご相談につながります。
          <br />
          <strong>登録は無料です。</strong>
        </p>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.8, marginBottom: 4 }}>
          下のボタンから、プロフィールを作るところまで進めます。
          登録すると{pro.name}先生とつながり、紹介を受け取れるようになります。
        </p>

        <ProInviteAcceptPanel proId={pro.id} proName={pro.name} />
      </div>
    </div>
  )
}
