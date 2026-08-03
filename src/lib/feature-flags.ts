/**
 * リフェラル機能ロールアウトの機能フラグ（サーバー専用・env直読み）
 *
 * 既存の流儀（src/lib/personality.ts の isPersonalityV2 等）に合わせ、
 * process.env を直接読む純関数として1ファイルに集約する。
 * NEXT_PUBLIC_ を付けない = クライアントバンドルに値を含めない（サーバー専用）。
 * 判定はこのファイルに集約し、UI出し分けとAPIガードの両方が同じ関数をimportする
 * （RP_REFERRAL_IMPL_SPEC.md §0 実装ルール）。
 */

/**
 * 処方箋リスト機能（FEATURE_REFERRAL_LISTS）の3値判定。
 * - 未設定 / 'off'  → 全員false
 * - 'all'           → 全員true
 * - それ以外        → カンマ区切りのプロID列挙。trim・空要素除去した上で該当プロIDのみtrue
 *
 * §0 段階公開（アローリスト方式）参照。
 */
export function isReferralEnabled(proId: string): boolean {
  const raw = process.env.FEATURE_REFERRAL_LISTS
  if (!raw || raw === 'off') return false
  if (raw === 'all') return true
  if (!proId) return false
  const allowList = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
  return allowList.includes(proId)
}

/**
 * リフェラル全体公開の判定（§2-2 先行テスト第3弾）。FEATURE_REFERRAL_LISTSが'all'の時のみtrue。
 *
 * 公開カードの🟢バッジ/🟡案内文は、この関数がtrueになるまで非表示にする。理由:
 * accepting_status のNULLをopenとして扱うfail-open化により、全体公開の告知前に
 * 既存プロの公開カードが「本人が何もしていないのに」勝手に受付中表示へ変わるのを防ぐため
 * （告知と同じタイミングで表示を切り替える）。プロ向け画面の3色ドット表示はゲート対象外。
 */
export function isReferralFullyLaunched(): boolean {
  return process.env.FEATURE_REFERRAL_LISTS === 'all'
}

/** 検索ページの非公開化（§3-2）。'true' の時のみ非公開化を有効にする。 */
export function isSearchPrivate(): boolean {
  return process.env.FEATURE_SEARCH_PRIVATE === 'true'
}

/** プルーフ表示のユニーク/累計/常連の3指標表示（§3-4）。 */
export function isProofUniqueCountEnabled(): boolean {
  return process.env.FEATURE_PROOF_UNIQUE_COUNT === 'true'
}

/** Voice等の表示時AI変換（§2-6）。Stage 1では未実装、フラグのみ先行定義。 */
export function isAiSanitizeEnabled(): boolean {
  return process.env.FEATURE_AI_TEXT_SANITIZE === 'true'
}
