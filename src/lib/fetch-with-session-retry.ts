/**
 * §17-18(CEO報告 2026-08-06): 「Voiceが保存できないエラー。そのあと何回も試したら普通にできた。」
 *
 * 真因: 画面に出た "Unauthorized" は API の `auth()` が userId を取れなかった 401。
 *   Clerk のセッショントークンは**短命（約60秒）**で、クライアント側のタイマーが
 *   黙って更新し続けている。スマホでタブを開いたまま放置する / 画面を消す / 別アプリに
 *   切り替えると、この更新タイマーが止まる。復帰後の**最初の1回**は期限切れのまま飛ぶので
 *   401 になり、その後 Clerk が更新するので**2回目以降は普通に通る**。
 *   データにもコードにも問題は無く、「久しぶりに操作した最初の1回だけ落ちる」という形になる。
 *
 * 対処: 401 が返ったら**セッションを強制更新して1回だけ黙って再送**する。
 *   ユーザーから見れば何も起きない。それでも駄目なら本当にログインが切れているので、
 *   英語の "Unauthorized" ではなく日本語で伝える。
 *
 * 使い方（クライアントコンポーネント）:
 *   const { getToken } = useAuth()
 *   const res = await fetchWithSessionRetry('/api/...', { method: 'POST', ... }, getToken)
 */

export type GetTokenFn = (options?: { skipCache?: boolean }) => Promise<string | null>

/** 401 のときに日本語で出す文言。英語の "Unauthorized" を画面に出さない。 */
export const SESSION_EXPIRED_MESSAGE =
  'ログインの有効期限が切れていました。もう一度お試しください（入力内容は残っています）。'

export async function fetchWithSessionRetry(
  input: string,
  init: RequestInit,
  getToken?: GetTokenFn,
): Promise<Response> {
  const res = await fetch(input, { cache: 'no-store', ...init })
  if (res.status !== 401 || !getToken) return res

  try {
    // skipCache: true で Clerk のセッション（＝Cookie）を取り直させる。
    await getToken({ skipCache: true })
  } catch {
    return res
  }
  return fetch(input, { cache: 'no-store', ...init })
}
