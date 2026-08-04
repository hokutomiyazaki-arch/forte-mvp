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

/**
 * §2-4ステージ2: 相談リクエスト時のStripeオーソリ（与信確保）。
 * REFERRAL_STRIPE_SECRET_KEY 未設定の間は、決済フロー（Checkout Session作成）も
 * referral_bookings の新カラム（payment_status等・migration 036）参照も一切行わない
 * （未実行の間はDDL未反映でも安全にデプロイできる）。
 * 既存の STRIPE_SECRET_KEY（NFCカード/認定制度）とは別アカウント・別キー。
 */
export function isReferralPaymentEnabled(): boolean {
  return !!process.env.REFERRAL_STRIPE_SECRET_KEY
}

/**
 * §2-4ステージ3(予約フィー方式): Stripeの最低決済額(JPY)。50円未満の予約フィーは
 * Checkout Session作成時にStripe側でエラーになるため、bookings(POST)・received(PATCH confirm)・
 * cron(expire-referral-bookings)の複数ファイルでこの閾値を共有する(リテラル二重管理の解消)。
 * ★ referral-payment.ts(Stripe importあり)ではなくこのファイルに置く理由:
 * bookings/route.tsは相談送信時に決済を挟まない設計(§2-4ステージ3)のため意図的にStripe importを
 * 持たない。referral-payment.tsから何か1つでもimportするとWebpackが同ファイルの全依存(stripeパッケージ
 * 含む)をbookings/route.tsのバンドルに含めてしまう(教訓G・Clerk middleware破壊事例)。
 */
export const REFERRAL_MIN_FEE_JPY = 50

/**
 * §2-4ステージ3(予約フィー方式): 予約フィー合計bps(basis points)のフォールバック値。
 * referral_bookings.fee_total_bpsが未設定の行向けのフォールバックとして、bookings作成時・
 * received/accept確定時・cron再試行・決済リンク再取得(getOrCreateFeePaymentLink)の
 * 複数ファイルでこの値を共有する(リテラル二重管理の解消・レビュー指摘・軽微8)。
 * ★ REFERRAL_MIN_FEE_JPYと同じ理由でこのファイルに置く(Stripe importを持たない)。
 */
export const REFERRAL_FEE_TOTAL_BPS = 3360

/**
 * §2-4ステージ3: 確定後、予約フィー決済が無ければ自動キャンセルするまでの猶予時間(時間)。
 * cron(expire-referral-bookings)の自動キャンセル判定と、決済リンク再取得
 * (getOrCreateFeePaymentLink)の「期限切れなら新規発行しない」判定の両方でこの値を共有する
 * (レビュー指摘・中5・cron交差の1時間窓の穴閉塞)。
 */
export const CONFIRM_PAYMENT_DEADLINE_HOURS = 24
