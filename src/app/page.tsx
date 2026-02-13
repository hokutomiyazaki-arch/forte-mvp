import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="max-w-lg w-full text-center">
        <h1 className="text-5xl font-bold tracking-wider text-forte-dark mb-2">
          FORTE
        </h1>
        <p className="text-forte-gold text-lg italic mb-8">
          本物が輝く社会へ。
        </p>

        <div className="space-y-3 mb-12">
          <p className="text-xl font-medium text-forte-dark">
            強みに人が集まるデジタル名刺。
          </p>
          <p className="text-gray-500">
            隠れたスゴい人に出会える。
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href="/login"
            className="block w-full py-4 bg-forte-dark text-white text-center rounded-xl font-medium text-lg hover:bg-opacity-90 transition"
          >
            プロとして登録する
          </Link>
          <p className="text-sm text-gray-400">
            Founding Member 募集中 — 永久無料
          </p>
        </div>
      </div>
    </main>
  )
}
