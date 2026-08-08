/**
 * New マークの「一度見たら消える」管理（CEO恒久ルール 2026-08-08）。
 *
 * 「メニューに付ける New マークは、新しく追加した機能に毎回つける。
 *  一度でもそのページを確認したら消える。」
 *
 * 仕組み: 端末ごとの localStorage に既読キーを立てる（rp_new_seen:<featureId>）。
 * - 対象ページに <MarkFeatureSeen id="..."> を置くと、開いた時点で既読になる
 * - NewBadge は id 付きなら既読を見て非表示になる（NEW_UNTIL の日付上限も併用）
 * - サーバーに保存しない軽量方式（端末が変われば再度出るが、告知目的なら許容・CC判断）
 */

const PREFIX = 'rp_new_seen:'

/** markFeatureSeen が発火するイベント名。NewBadge が購読して即時に消える。 */
export const NEW_SEEN_EVENT = 'rp-new-seen'

export function markFeatureSeen(featureId: string): void {
  if (typeof window === 'undefined' || !featureId) return
  try {
    window.localStorage.setItem(`${PREFIX}${featureId}`, new Date().toISOString())
    // CEO報告(2026-08-08)「開いてもnewが消えない」対応: バッジはマウント時にしか既読を
    // 読まないため、同一ページ滞在中に既読になっても反映されなかった。イベントで即時通知する。
    window.dispatchEvent(new CustomEvent(NEW_SEEN_EVENT, { detail: { id: featureId } }))
  } catch {
    // プライベートモード等で localStorage が使えない場合は何もしない（New が出続けるだけ）
  }
}

export function isFeatureSeen(featureId: string): boolean {
  if (typeof window === 'undefined' || !featureId) return false
  try {
    return window.localStorage.getItem(`${PREFIX}${featureId}`) !== null
  } catch {
    return false
  }
}
