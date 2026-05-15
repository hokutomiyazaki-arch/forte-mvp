/**
 * マイページ遷移先を統一するユーティリティ
 * プロ → /dashboard、一般 → /(ホーム)
 * 判定が不明な場合は /auth-redirect を使う（サーバー側で判定）
 */

export function getMyPageUrl(isPro: boolean | null): string {
  if (isPro === true) return '/dashboard'
  if (isPro === false) return '/'
  // 判定中 or 不明 → auth-redirect に任せる
  return '/auth-redirect'
}

/**
 * ログイン済みユーザーのデフォルト遷移先
 * auth-redirect がプロ/クライアント/未登録を判定してリダイレクト
 */
export const AUTH_REDIRECT_URL = '/auth-redirect'
