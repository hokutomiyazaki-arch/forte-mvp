/**
 * メールアドレスの打ち間違い検出（CEO指摘 2026-08-06）。
 *
 * CEOの指摘:
 *   「予約リクエスト、クライアントがe-mailを誤って入力していたらどうする？
 *    クライアントはなんも通知なくて、プロには予約が入ってる、が起こりうる。」
 *
 * これは予約でいちばん重い事故になる。お客さんは「送ったのに音沙汰がない」、
 * プロは枠を空けて待つ。しかも**どちらも気づかない**。
 *
 * 対策は順番に効かせる:
 *   ① ここ（入力時にドメインの打ち間違いを指摘して直させる）… いちばん安い
 *   ② 送信直前に「このアドレスに届きます」と本人へ読み上げさせる
 *   ③ 受付メールの送信が失敗したら、その場で画面に出す（気づける最後の機会）
 *   ④ それでも届かなかった時のために、プロ側へ「メール未達」を伝えて電話に切り替えてもらう
 *
 * このファイルは import 0本の純関数に保つ（どこからでも呼べるように・チャンクグラフ対策）。
 */

/** 日本の予約フォームで実際に使われる主要ドメイン */
const KNOWN_DOMAINS = [
  'gmail.com',
  'yahoo.co.jp',
  'icloud.com',
  'outlook.com',
  'outlook.jp',
  'hotmail.com',
  'hotmail.co.jp',
  'docomo.ne.jp',
  'ezweb.ne.jp',
  'au.com',
  'softbank.ne.jp',
  'i.softbank.jp',
  'me.com',
  'live.jp',
  'nifty.com',
  'ybb.ne.jp',
  'yahoo.com',
]

/** 編集距離（挿入・削除・置換）。ドメイン程度の長さしか渡さないので素朴な実装でよい。 */
function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[n]
}

/**
 * 打ち間違いっぽいドメインなら、正しいと思われるアドレスを返す。問題なければ null。
 *
 * 誤検知を避けるため、
 *   - 既知ドメインと完全一致なら何も言わない
 *   - 編集距離1〜2 かつ 先頭2文字が一致するものだけ提案する
 *     （gmail.com と yahoo.com のような別物を取り違えないため）
 */
export function suggestEmailFix(email: string): string | null {
  const value = (email || '').trim().toLowerCase()
  const at = value.lastIndexOf('@')
  if (at <= 0 || at === value.length - 1) return null

  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  if (!domain.includes('.')) return null
  if (KNOWN_DOMAINS.includes(domain)) return null

  let best: { domain: string; distance: number } | null = null
  for (const known of KNOWN_DOMAINS) {
    if (domain.slice(0, 2) !== known.slice(0, 2)) continue
    const distance = editDistance(domain, known)
    if (distance > 0 && distance <= 2 && (!best || distance < best.distance)) {
      best = { domain: known, distance }
    }
  }

  return best ? `${local}@${best.domain}` : null
}
