import Link from 'next/link'

export const metadata = {
  title: 'ご購入ありがとうございます | REALPROOF NFCカード',
  robots: { index: false },
}

/**
 * NFCカード購入サンクスページ — /nfc-card/thanks
 * Stripe Checkout の success_url 着地先。静的。
 */
export default function NfcCardThanks() {
  return (
    <section className="bg-[#1A1A2E] text-white px-5 py-20 min-h-[70vh]">
      <div className="max-w-md mx-auto flex flex-col items-center text-center gap-6">
        <div className="text-[#C4A35A] text-5xl">✓</div>
        <h1 className="text-2xl font-bold leading-snug">
          ご購入ありがとうございます。
        </h1>

        <div className="space-y-4 text-[#E8E2D5]/90 text-[15px] leading-relaxed">
          <p>
            ご注文を承りました。<br />
            ご注文確認後、<strong className="text-white font-bold">5営業日以内に発送</strong>いたします。
          </p>
          <p>
            カードが届いたら、ダッシュボードの設定画面で<br />
            <strong className="text-white font-bold">カード裏面の番号を入力</strong>してください。<br />
            それだけで、カードはあなた専用になります。
          </p>
        </div>

        <div className="w-full border-t border-white/10 pt-6 mt-2 space-y-4">
          <p className="text-[#E8E2D5]/70 text-sm">
            REALPROOFにまだ登録していない方は、<br />
            無料登録のうえ番号を入力すれば、すぐに使い始められます。
          </p>
          <Link
            href="/sign-up"
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto bg-[#C4A35A] text-[#1A1A2E] font-bold text-base px-10 py-4 rounded-full shadow-lg hover:bg-[#9A7B3A] hover:text-white transition"
          >
            無料で登録する →
          </Link>
          <div>
            <Link
              href="/dashboard"
              className="text-[#C4A35A] text-sm underline underline-offset-2"
            >
              登録済みの方はダッシュボードへ →
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
