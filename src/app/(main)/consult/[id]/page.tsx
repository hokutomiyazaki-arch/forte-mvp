import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'
import ConsultForm from './ConsultForm'

export const dynamic = 'force-dynamic'

/**
 * 相談フォーム（§16-19）
 *
 * カードの「相談する」の遷移先。mailto の置き換えなので**ログイン不要**。
 * 日時の入力は無い（日時を選ぶのは「予約する」側・§16-13）。
 * 動的セグメントは professionals.id の UUID（/card/[id] と同じ。slug変換なし）。
 */
export async function generateMetadata({ params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin()
  const { data: pro } = await supabase
    .from('professionals')
    .select('name')
    .eq('id', params.id)
    .is('deactivated_at', null)
    .maybeSingle()

  return {
    title: pro ? `${pro.name}さんに相談する | REAL PROOF` : '相談する | REAL PROOF',
    robots: { index: false, follow: false },
  }
}

export default async function ConsultPage({ params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin()
  const { data: pro } = await supabase
    .from('professionals')
    .select('id, name, photo_url, title, store_name, accepting_status, consultation_enabled')
    .eq('id', params.id)
    .is('deactivated_at', null)
    .maybeSingle()

  if (!pro) notFound()

  return (
    <ConsultForm
      proId={pro.id}
      proName={pro.name || ''}
      proPhotoUrl={pro.photo_url || null}
      proTitle={pro.title || null}
      proStoreName={pro.store_name || null}
      // 受付停止(closed)のときはフォームを出さない。'conditional' は紹介予約のみ停止で
      // 直接の相談は継続する値なので受け付ける（§16-18）。
      // さらに §16-25 の「相談だけ止める」スイッチも見る（カラム未作成なら null＝受け付ける）。
      accepting={pro.accepting_status !== 'closed' && (pro as any).consultation_enabled !== false}
    />
  )
}
