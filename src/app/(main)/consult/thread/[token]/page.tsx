import ConsultThread from './ConsultThread'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'ご相談のやりとり | REAL PROOF',
  // トークンURLなので検索に載せない
  robots: { index: false, follow: false },
}

/**
 * クライアント側のやりとり画面（§16-19）
 *
 * メール内の「返信する」リンクの着地点。access_token だけで開ける（ログイン不要）。
 * Resend は送信専用でメールの返信を受け取れないため、この画面が往復の受け皿になる。
 * データ取得はクライアント側で行う（トークンをサーバーコンポーネントのキャッシュに
 * 載せないため・fetch は no-store）。
 */
export default function ConsultThreadPage({ params }: { params: { token: string } }) {
  return <ConsultThread token={params.token} />
}
