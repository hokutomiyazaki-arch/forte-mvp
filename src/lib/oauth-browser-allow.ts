/**
 * OAuth 許可リスト判定（v2: 許可リスト方式）
 *
 * 背景:
 * - Google OAuth は WebView/非標準ブラウザを `403 disallowed_useragent` で禁止。
 * - LINE Login も同環境で自動ログイン失敗 → セキュリティ警告通知。
 * - らくらくホン等の「未知の旧ブラウザ」をブロックリストで名指しするのは保守地獄＆すり抜けるため、
 *   「確実に安全な標準ブラウザ」の時だけ true を返す許可リスト方式にする。
 *
 * 失敗方向が安全: 判定不能・未知ブラウザは false（OAuth を出さず SMS/メールコード認証へ）。
 */
export function shouldShowOAuth(): boolean {
  // SSR ガード: サーバー側では安全側に倒して OAuth を出さない
  if (typeof window === 'undefined') return false

  const ua = navigator.userAgent.toLowerCase()

  // ステップA: WebView / アプリ内ブラウザを明示除外（いずれか含めば即 false）
  const inAppMarkers = [
    '; wv',
    'line/',
    'fban',
    'fbav',
    'fb_iab',
    'instagram',
    'musical_ly',
    'bytedancewebview',
    'tiktok',
    'micromessenger',
    'kakaotalk',
  ]
  if (inAppMarkers.some((m) => ua.includes(m))) return false

  // ステップB: 既知の安全な標準ブラウザを肯定確認（該当すれば true）
  // 注意: 旧 Android 標準ブラウザ（らくらくホン等）も "Version/4.0 Mobile Safari"
  // を名乗るため、safari+version/ は必ず Apple 端末トークンとセットで判定する。
  // （これを外すと旧 Android 端末が iOS Safari と誤判定され 403 端末がすり抜ける）
  const isApple =
    ua.includes('iphone') ||
    ua.includes('ipad') ||
    ua.includes('ipod') ||
    ua.includes('macintosh')
  const isIOSSafari = isApple && ua.includes('safari') && ua.includes('version/')
  const isIOSChrome = ua.includes('crios')
  const isIOSFirefox = ua.includes('fxios')
  const isIOSEdge = ua.includes('edgios')

  const isChrome = ua.includes('chrome/') && !ua.includes('; wv')
  const isFirefox = ua.includes('firefox/')
  const isEdge = ua.includes('edg/')
  const isSamsung = ua.includes('samsungbrowser/')

  if (
    isIOSSafari ||
    isIOSChrome ||
    isIOSFirefox ||
    isIOSEdge ||
    isChrome ||
    isFirefox ||
    isEdge ||
    isSamsung
  ) {
    return true
  }

  // それ以外（らくらくホン等の独自/旧ブラウザ）は false → コード認証へ
  return false
}
