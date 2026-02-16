'use client'

const FEATURES = [
  {
    status: 'live',
    title: 'プルーフ投票（QRコード認証）',
    description: 'セッション後、プロが発行する24時間限定QRコードからのみ投票可能。対面の信頼を証明に変換。',
  },
  {
    status: 'live',
    title: 'プルーフチャート',
    description: '結果（痛み改善、姿勢改善など）と人柄（安心、丁寧など）の多次元チャートで強みを可視化。',
  },
  {
    status: 'live',
    title: 'クーポン機能',
    description: '投票してくれたクライアントにお礼の特典を自動発行。マイカードページで管理・使用。',
  },
  {
    status: 'live',
    title: 'メール相談',
    description: 'プロのカードページから直接メールで問い合わせ。新しいクライアントとの接点に。',
  },
  {
    status: 'next',
    title: '予約管理',
    description: '空き枠の公開、カレンダー連携、オンライン予約。プロとクライアントのスケジュール調整をシンプルに。',
  },
  {
    status: 'next',
    title: 'アプリ内メッセージ',
    description: 'メールアドレスを公開せずに、PROOF内でプロとクライアントが直接やりとり。',
  },
  {
    status: 'planned',
    title: 'プッシュ通知（アプリ化）',
    description: 'PWA / ネイティブアプリ化で、新しいプルーフやメッセージの通知をリアルタイムに受信。',
  },
  {
    status: 'next',
    title: '地域検索',
    description: 'エリアや最寄り駅で近くのプロを検索。あなたの街で本物のプロを見つける。',
  },
  {
    status: 'planned',
    title: 'プルーフ分析ダッシュボード',
    description: '月別のプルーフ推移、強みの変化トレンド、クライアント層の分析。',
  },
  {
    status: 'planned',
    title: 'チーム機能',
    description: '治療院やジム単位でのプロフィール管理。チーム全体のプルーフを集約して見せる。',
  },
  {
    status: 'planned',
    title: 'AI強み分析',
    description: 'クライアントの声を自然言語解析し、あなたの隠れた強みを発見。',
  },
]

const STATUS_CONFIG = {
  live: { label: '提供中', bg: 'bg-green-100', text: 'text-green-700' },
  next: { label: '次期リリース', bg: 'bg-[#C4A35A]/10', text: 'text-[#C4A35A]' },
  planned: { label: '開発予定', bg: 'bg-gray-100', text: 'text-gray-500' },
} as const

export default function RoadmapPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2">PROOFのこれから</h1>
        <p className="text-gray-500 text-sm">
          あなたの声でPROOFは進化します。欲しい機能があれば教えてください。
        </p>
      </div>

      <div className="space-y-4">
        {FEATURES.map((f, i) => {
          const config = STATUS_CONFIG[f.status as keyof typeof STATUS_CONFIG]
          return (
            <div key={i} className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {f.status === 'live' ? (
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  ) : f.status === 'next' ? (
                    <div className="w-3 h-3 rounded-full bg-[#C4A35A]"></div>
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-gray-300"></div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-[#1A1A2E]">{f.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.bg} ${config.text}`}>
                      {config.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{f.description}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="text-center mt-10 mb-8">
        <a href="/" className="text-[#C4A35A] hover:underline text-sm">トップへ戻る</a>
      </div>
    </div>
  )
}
