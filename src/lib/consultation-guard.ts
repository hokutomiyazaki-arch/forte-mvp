/**
 * 相談フォーム（§16-19）のスパム・ボット対策
 *
 * なぜ必要か（CEO質問「ワードプレスコメントみたいに攻撃される可能性アリ？」への答え）:
 * このエンドポイントは **認証なしで、攻撃者が指定した任意のメールアドレスへメールを送れる**。
 * WordPress のコメント欄より危険で、放置すると次が起きる。
 *   ① メール中継として悪用される（第三者の宛先へ REAL PROOF の名前でメールが飛ぶ）
 *   ② 送信ドメインの評判が落ちる → **週次レポートなど他のメールまで迷惑メール行きになる**
 *   ③ プロの受信箱とダッシュボードがゴミで埋まる
 * ②が一番痛い。1機能の問題では済まなくなる。
 *
 * ここでは外部サービスを増やさずに済む多層防御を置く。1枚で止めるのではなく、
 * 「ボットが素通りする層」と「人間の乱用を抑える層」を重ねる。
 */

/** 本文に含めてよいURLの数。コメントスパムはリンクを詰めてくるので効く。 */
const MAX_URLS_IN_BODY = 2

/** フォームを開いてから送信までの最短秒数。人間はこれより速く書けない。 */
const MIN_FILL_SECONDS = 3

/** 同一メールアドレスが1時間に送れる相談数（プロをまたいだ合計）。 */
export const MAX_PER_EMAIL_PER_HOUR = 5

/** 1人のプロが1時間に受け取る相談数の上限。特定のプロを狙った攻撃の被害を抑える。 */
export const MAX_PER_PRO_PER_HOUR = 20

export type GuardVerdict =
  | { ok: true }
  /** ボット確定。攻撃者に検知を悟らせないため、呼び出し側は 200 を返して黙って捨てる。 */
  | { ok: false; silent: true }
  /** 人間かもしれないので理由を返す。 */
  | { ok: false; silent: false; error: string }

interface GuardInput {
  /** ハニーポット。画面に出ない入力欄で、埋まっていたらボット。 */
  honeypot?: unknown
  /** フォームを描画した時刻(ms)。クライアント申告なので補助的な材料として扱う。 */
  renderedAt?: unknown
  body: string
}

/**
 * 保存前のふるい（DBを見ない範囲）。
 * renderedAt はクライアント由来なので偽装できる。単独では信用せず、
 * 「素直なボットを落とす」目的だけに使う（本命はDB側の件数制限）。
 */
export function screenSubmission(input: GuardInput): GuardVerdict {
  // ① ハニーポット: 人間には見えない欄。埋まっている＝フォームを機械が舐めた証拠。
  if (typeof input.honeypot === 'string' && input.honeypot.trim() !== '') {
    return { ok: false, silent: true }
  }

  // ② 早すぎる送信
  if (typeof input.renderedAt === 'number' && Number.isFinite(input.renderedAt)) {
    const elapsed = (Date.now() - input.renderedAt) / 1000
    if (elapsed >= 0 && elapsed < MIN_FILL_SECONDS) {
      return { ok: false, silent: true }
    }
  }

  // ③ リンクだらけの本文
  const urlCount = (input.body.match(/https?:\/\//gi) || []).length
  if (urlCount > MAX_URLS_IN_BODY) {
    return {
      ok: false,
      silent: false,
      error: 'too_many_links',
    }
  }

  return { ok: true }
}
