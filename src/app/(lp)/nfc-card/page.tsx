import Link from 'next/link'
import CheckoutButton from './CheckoutButton'

export const metadata = {
  title: 'REALPROOF NFCカード | 信頼は、かざした瞬間に貯まっていく。',
  description: 'セッション後の「ありがとう」を、その場で形に。REALPROOF NFCカード ¥3,000（送料込み）。',
  openGraph: {
    images: ['https://realproof.jp/lp/nfc-card/og.png'],
  },
}

/**
 * NFCカード販売LP — /nfc-card
 * コピーは確定版（変更禁止）。セクション構成 ①〜⑧ の順。
 * 画像は public/lp/nfc-card/ 配下（北斗がアップロード）。未アップロードのためプレースホルダーで組む。
 * TODO(画像差し替え): 画像アップロード後、各 <ImgSlot> を実画像（<img> or next/image）に置換。
 */

// LP画像。next/image は使わず素の <img>（Vercel Image Optimization の従量課金回避）。
// CLS防止のため width/height を必須で付与し、Hero のみ eager、他は lazy。
// 画像は北斗が /public/lp/nfc-card/ にアップロードすると自動反映される（未アップロード時は
// bg のグラデ枠がプレースホルダーとして表示され、レイアウトは確定済み＝差し替えでズレない）。
function ImgSlot({
  file,
  width,
  height,
  alt,
  eager = false,
  className = '',
}: {
  file: string
  width: number
  height: number
  alt: string
  eager?: boolean
  className?: string
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/lp/nfc-card/${file}`}
      width={width}
      height={height}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      className={`block w-full h-auto rounded-2xl bg-gradient-to-br from-[#2A2A44] to-[#1A1A2E] border border-[#C4A35A]/20 ${className}`}
    />
  )
}

export default function NfcCardLp() {
  return (
    <div className="text-[15px] leading-relaxed">
      {/* ① Hero ------------------------------------------------------------ */}
      <section className="bg-[#1A1A2E] text-white px-5 pt-16 pb-14">
        <div className="max-w-md mx-auto flex flex-col items-center text-center gap-6">
          <p className="text-[#C4A35A] text-xs tracking-[0.2em]">REALPROOF NFCカード</p>
          <h1 className="text-3xl sm:text-4xl font-bold leading-snug">
            信頼は、かざした瞬間に貯まっていく。
          </h1>
          <p className="text-[#E8E2D5] text-sm">
            REALPROOF NFCカード / ¥3,000（送料込み）
          </p>
          <div className="w-full mt-2">
            <ImgSlot file="hero.jpg" width={1200} height={900} alt="REALPROOF NFCカード 表面" eager />
          </div>
          <div className="w-full mt-2">
            <CheckoutButton label="カードを手に入れる →" />
          </div>
          <p className="text-[#E8E2D5]/70 text-xs">
            お手元に届いたその日から、セッション現場で使えます。
          </p>
        </div>
      </section>

      {/* ② 課題共感 -------------------------------------------------------- */}
      <section className="bg-[#E8E2D5] text-[#1A1A2E] px-5 py-14">
        <div className="max-w-md mx-auto flex flex-col gap-6">
          <h2 className="text-2xl font-bold leading-snug text-center">
            セッション後の「ありがとう」、その場で形にできていますか？
          </h2>
          <ImgSlot file="hand.jpg" width={1200} height={900} alt="セッション現場でカードをかざす様子" />
          <div className="space-y-4 text-[#1A1A2E]/90">
            <p>
              「今日、すごく楽になりました」<br />
              その一言をもらった瞬間が、<br />
              プルーフを記録してもらう最高のタイミング。
            </p>
            <p>
              でも、スマホを取り出して、アプリを開いて、QRを表示して……<br />
              その数十秒のあいだに、空気は流れてしまう。
            </p>
            <p>
              このカードなら、<br />
              <strong className="font-bold">財布から出して、かざしてもらうだけ。</strong>
            </p>
            <p>お客さまのスマホに、あなたのプルーフページがすぐに開きます。</p>
          </div>
        </div>
      </section>

      {/* ③ 使い方は3ステップ ----------------------------------------------- */}
      <section className="bg-[#1A1A2E] text-white px-5 py-14">
        <div className="max-w-md mx-auto flex flex-col gap-8">
          <h2 className="text-2xl font-bold leading-snug text-center">
            設定は、30秒で終わります。
          </h2>
          <div className="space-y-6">
            <div className="flex flex-col gap-2">
              <span className="text-[#C4A35A] font-bold text-sm tracking-wide">STEP 1 — 届く</span>
              <p className="text-[#E8E2D5]/90">ご注文から数日で、カードがお手元に届きます。</p>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[#C4A35A] font-bold text-sm tracking-wide">STEP 2 — つなぐ</span>
              <p className="text-[#E8E2D5]/90">
                ダッシュボードの設定画面で、カード裏面の番号を入力。それだけで、カードはあなた専用になります。
              </p>
              <div className="grid grid-cols-2 gap-3 mt-1">
                <ImgSlot file="back.jpg" width={900} height={1200} alt="カード裏面の番号" />
                <ImgSlot file="dashboard-input.png" width={900} height={1200} alt="ダッシュボードの番号入力画面" />
              </div>
              <p className="text-[#E8E2D5]/60 text-xs">※ 番号（RP-◯◯◯）はカードごとに異なります。画像はサンプルです。</p>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[#C4A35A] font-bold text-sm tracking-wide">STEP 3 — かざす</span>
              <p className="text-[#E8E2D5]/90">
                セッションの後、お客さまのスマホにカードをかざしてもらう。信頼の記録が、1枚ずつ積み上がっていきます。
              </p>
            </div>
          </div>
          {/* CTA 2つ目 */}
          <div className="w-full">
            <CheckoutButton label="カードを手に入れる →" />
          </div>
        </div>
      </section>

      {/* ④ フィジカルの意味 ------------------------------------------------ */}
      <section className="bg-white text-[#1A1A2E] px-5 py-14">
        <div className="max-w-md mx-auto flex flex-col gap-6">
          <h2 className="text-2xl font-bold leading-snug text-center">
            デジタルの時代だからこそ、手に取れるものが信頼になる。
          </h2>
          <div className="space-y-4 text-[#1A1A2E]/90">
            <p>
              画面の中の数字は、忘れられていく。<br />
              でも、財布の中のカードは違います。
            </p>
            <p>
              支払いのたび、名刺交換のたび、目に入る。<br />
              そのたびに思い出す ── 「今日も、証明を積み上げよう」と。
            </p>
            <p>
              このカードは、決済ツールでも、ポイントカードでもありません。<br />
              <strong className="font-bold">
                あなたがプロとして生きてきた証を、これから貯めていくための器です。
              </strong>
            </p>
          </div>
          <div className="border-t border-gray-200 pt-5 text-right">
            <p className="italic text-[#9A7B3A]">「強みを磨く人」が輝く世界をつくる。</p>
            <p className="italic text-[#9A7B3A]">宮崎ほくと ── REALPROOF 代表</p>
          </div>
        </div>
      </section>

      {/* ⑤ 次のゴール ------------------------------------------------------ */}
      <section className="bg-[#1A1A2E] text-white px-5 py-14">
        <div className="max-w-md mx-auto flex flex-col gap-6">
          <h2 className="text-2xl font-bold leading-snug text-center">
            30プルーフ達成で、&quot;あなたの名前が刻まれたカード&quot;が無料で届きます。
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <ImgSlot file="hero.jpg" width={1200} height={900} alt="標準のREALPROOFカード" />
            </div>
            <span className="text-[#C4A35A] text-3xl font-bold shrink-0">→</span>
            <div className="flex-1">
              <ImgSlot file="named-card.jpg" width={1200} height={900} alt="名前入りの特別なカード" />
            </div>
          </div>
          <div className="space-y-4 text-[#E8E2D5]/90">
            <p>
              このカードは、スタートの1枚。<br />
              30人のクライアントがあなたの強みを証明したとき、<br />
              REALPROOFから、名前入りの特別なカードが贈られます。
            </p>
            <p>まずはこの1枚から、始めてください。</p>
          </div>
        </div>
      </section>

      {/* ⑥ 料金・仕様 ------------------------------------------------------ */}
      <section className="bg-[#E8E2D5] text-[#1A1A2E] px-5 py-14">
        <div className="max-w-md mx-auto flex flex-col gap-6">
          <div className="text-center">
            <p className="text-lg font-bold">REALPROOF NFCカード</p>
            <p className="text-3xl font-bold mt-1">¥3,000<span className="text-base font-medium">（送料込み・買い切り）</span></p>
          </div>
          <ul className="space-y-3 text-[#1A1A2E]/90">
            <li>・追加費用はありません。カードの代金のみです。</li>
            <li>・REALPROOFのご利用は、現在すべて無料です。</li>
            <li>・将来、有料プランを導入する可能性があります。その際、すでにご利用中の方には優遇を予定しています。</li>
            <li>・BDC・FNT会員の方は、特別優遇の対象です。</li>
          </ul>
          {/* CTA 3つ目 */}
          <div className="w-full">
            <CheckoutButton label="カードを手に入れる →" />
          </div>
        </div>
      </section>

      {/* ⑦ FAQ ------------------------------------------------------------- */}
      <section className="bg-white text-[#1A1A2E] px-5 py-14">
        <div className="max-w-md mx-auto flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-center mb-2">よくあるご質問</h2>
          {[
            {
              q: 'REALPROOFにまだ登録していなくても買えますか？',
              a: '買えます。カードが届いたら、無料登録のうえ、裏面の番号を入力してください。すぐに使い始められます。',
            },
            {
              q: 'どのスマホでも使えますか？',
              a: '近年のiPhone・Androidであれば、かざすだけで反応します。万一反応しない場合も、カード裏面のQRコードから同じページを開けます。',
            },
            {
              q: '発送までどのくらいかかりますか？',
              a: 'ご注文から5営業日以内に発送します。',
            },
            {
              q: 'カードをなくしてしまったら？',
              a: '紐付けを解除して、新しいカードに切り替えられます。プルーフの記録が消えることはありません。',
            },
            {
              q: 'QRコードと何が違うのですか？',
              a: '中身は同じです。違うのは「速さ」と「体験」。スマホを操作する数十秒が、カード1枚でゼロになります。',
            },
          ].map((item, i) => (
            <details key={i} className="border border-gray-200 rounded-xl overflow-hidden">
              <summary className="cursor-pointer list-none px-5 py-4 font-medium flex items-center justify-between gap-3">
                <span>Q. {item.q}</span>
                <span className="text-[#C4A35A] shrink-0">＋</span>
              </summary>
              <p className="px-5 pb-4 text-[#1A1A2E]/80 text-sm">A. {item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ⑧ 最終CTA -------------------------------------------------------- */}
      <section className="bg-[#1A1A2E] text-white px-5 py-16">
        <div className="max-w-md mx-auto flex flex-col items-center text-center gap-6">
          <h2 className="text-2xl font-bold leading-snug">あなたの信頼を、1枚のカードに。</h2>
          <div className="w-full">
            <CheckoutButton label="カードを手に入れる → ¥3,000（送料込み）" />
          </div>
          <p className="text-[#E8E2D5]/70 text-xs">
            カードがなくても、無料で始められます{' '}
            <Link href="/sign-up" className="text-[#C4A35A] underline underline-offset-2">
              →
            </Link>
          </p>
        </div>
      </section>
    </div>
  )
}
