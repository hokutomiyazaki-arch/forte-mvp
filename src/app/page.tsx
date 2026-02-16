'use client'
import Link from 'next/link'

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Hero */}
      <section className="text-center py-16">
        <h1 className="text-5xl font-bold text-[#1A1A2E] tracking-wider mb-4">PROOF</h1>
        <p className="text-lg text-[#C4A35A] italic mb-8">本物が輝く社会へ。</p>
        <p className="text-xl text-[#1A1A2E] font-medium mb-4">
          あなたの強みを、クライアントの声で証明する。
        </p>
        <p className="text-gray-600 mb-12 leading-relaxed">
          SNSのフォロワー数でも、口コミの星の数でもない。<br />
          実際にあなたの施術を受けた人が、あなたの「選ばれる理由」を投票する。<br />
          実力が正当に評価され、蓄積され、検索される — それがPROOF。
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login?role=pro"
            className="px-8 py-4 bg-[#1A1A2E] text-white font-medium rounded-lg hover:bg-[#2a2a4e] transition text-center"
          >
            プロとして登録する
          </Link>
          <Link
            href="/login?role=client"
            className="px-8 py-4 border-2 border-[#1A1A2E] text-[#1A1A2E] font-medium rounded-lg hover:bg-[#1A1A2E] hover:text-white transition text-center"
          >
            クライアントとして登録する
          </Link>
        </div>
      </section>

      {/* 3 values */}
      <section className="grid md:grid-cols-3 gap-8 py-12">
        <div className="text-center">
          <div className="text-3xl font-bold text-[#C4A35A] mb-2">蓄積</div>
          <p className="text-sm text-gray-600">
            あなたの実績は個人に紐づく。店を辞めても、独立しても消えない。ポータブルな強みの証明。
          </p>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-[#C4A35A] mb-2">多次元</div>
          <p className="text-sm text-gray-600">
            星5段階の一次元ではない。「何が変わったか」の複数軸で、あなたの本当の強みが見える。
          </p>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-[#C4A35A] mb-2">逆引き</div>
          <p className="text-sm text-gray-600">
            「痛みを改善してくれる人」で検索。広告費順ではなく、強み順。
          </p>
        </div>
      </section>

      {/* Why different */}
      <section className="py-12 border-t border-gray-200">
        <h2 className="text-2xl font-bold text-[#1A1A2E] mb-6 text-center">
          口コミサイトとは何が違うのか
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1A1A2E] text-white">
                <th className="py-3 px-4 text-left"></th>
                <th className="py-3 px-4 text-left">ホットペッパー</th>
                <th className="py-3 px-4 text-left">Google</th>
                <th className="py-3 px-4 text-left font-bold text-[#C4A35A]">PROOF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr><td className="py-2 px-4 font-medium">誰が評価</td><td className="py-2 px-4">匿名の誰か</td><td className="py-2 px-4">匿名の誰か</td><td className="py-2 px-4 font-medium">認証済みクライアント</td></tr>
              <tr className="bg-gray-50"><td className="py-2 px-4 font-medium">紐づき</td><td className="py-2 px-4">店舗</td><td className="py-2 px-4">店舗</td><td className="py-2 px-4 font-medium">個人（ポータブル）</td></tr>
              <tr><td className="py-2 px-4 font-medium">評価の軸</td><td className="py-2 px-4">星5（一次元）</td><td className="py-2 px-4">星5（一次元）</td><td className="py-2 px-4 font-medium">多次元（結果×人柄）</td></tr>
              <tr className="bg-gray-50"><td className="py-2 px-4 font-medium">検索順</td><td className="py-2 px-4">広告費順</td><td className="py-2 px-4">アルゴリズム</td><td className="py-2 px-4 font-medium">実力順</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Roadmap */}
      <section className="py-12 border-t border-gray-200 text-center">
        <h2 className="text-xl font-bold text-[#1A1A2E] mb-3">PROOFのこれから</h2>
        <p className="text-gray-600 text-sm mb-6">
          予約管理、アプリ内メッセージ、プッシュ通知…<br />
          PROOFはあなたの声で進化します。
        </p>
        <Link href="/roadmap" className="text-[#C4A35A] font-medium hover:underline">
          開発ロードマップを見る →
        </Link>
      </section>

      {/* Founding Member */}
      <section className="py-12 border-t border-gray-200 text-center">
        <p className="text-[#C4A35A] font-medium mb-2">Founding Member</p>
        <h2 className="text-2xl font-bold text-[#1A1A2E] mb-4">最初の50名だけの特権</h2>
        <p className="text-gray-600 mb-8">
          永久のFounding Memberバッジ。先行する実績の蓄積。<br />
          PROOFが10万人のプラットフォームになったとき、あなたは「最初からいた人」。
        </p>
        <Link
          href="/login?role=pro"
          className="inline-block px-8 py-4 bg-[#C4A35A] text-white font-medium rounded-lg hover:bg-[#b3944f] transition"
        >
          Founding Memberとして登録する
        </Link>
      </section>
    </div>
  )
}
