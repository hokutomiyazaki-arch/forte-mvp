/**
 * サーバー専用: 現在のリクエストの閲覧者がプロ(professionals経由でuser_idが実在し
 * deactivated_at IS NULL)かどうかを判定する共通ヘルパー。
 *
 * 検索非公開化(FEATURE_SEARCH_PRIVATE)のガード専用に切り出した新規ファイル。
 * /api/search/route.ts に直接 Clerk の新規importを足すとWebpackチャンクグラフを
 * 変え Clerk middleware を壊す既知の破壊パターンがあるため、判定ロジックはここに
 * 集約し、呼び出し側は結果のbooleanだけを使う（rp-reference.md §1）。
 *
 * fail open: 判定中に例外が発生した場合はブロックしない(=プロ扱いとして通す)。
 * 未ログイン/professionals未登録は「非プロ」として正しくブロック対象になる
 * （これは判定失敗ではなく正常な判定結果のため fail open の対象ではない）。
 */
import { auth } from '@clerk/nextjs/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export async function getViewerIsPro(): Promise<boolean> {
  try {
    const { userId } = await auth()
    if (!userId) return false

    const supabase = getSupabaseAdmin()
    const { data: pro } = await supabase
      .from('professionals')
      .select('id, deactivated_at')
      .eq('user_id', userId)
      .maybeSingle()

    return !!pro && !pro.deactivated_at
  } catch {
    // fail open: 判定エラー時はブロックしない
    return true
  }
}
