/**
 * §3-2 検索ページの非公開化（実装のみ・FEATURE_SEARCH_PRIVATE未設定時は既存動作を完全維持）。
 *
 * FEATURE_SEARCH_PRIVATE が未設定/'false'の場合:
 *   従来通り SearchPageClient をそのまま描画する（分岐なし・1ピクセルも変わらない）。
 * FEATURE_SEARCH_PRIVATE='true'の場合:
 *   - プロ（professionalsにuser_idが実在しdeactivated_at IS NULL）: 従来のUI + 用途再定義の説明文を1行追加
 *   - 非プロ/未ログイン: 検索UIを描画せず、案内画面のみ表示
 *
 * 元のクライアント実装は ./components/SearchPageClient.tsx に分離（/card/[id]/page.tsx と同じ分割パターン）。
 */
import { isSearchPrivate } from '@/lib/feature-flags'
import { getViewerIsPro, getViewerIsProStrict } from '@/lib/viewer-role'
import { COLORS, FONTS } from '@/lib/design-tokens'
import SearchPageClient from './components/SearchPageClient'

export const dynamic = 'force-dynamic'

const T = { ...COLORS, font: FONTS.main, fontSerif: FONTS.serif }

function SearchGuidanceScreen() {
  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: T.font }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{
          background: T.dark, borderRadius: 12, padding: '24px 20px', marginBottom: 20,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 3, color: T.gold, marginBottom: 10,
          }}>
            REALPROOF
          </div>
          <h1 style={{
            fontSize: 18, fontWeight: 800, color: '#FAFAF7',
            lineHeight: 1.6, margin: 0, fontFamily: T.fontSerif,
          }}>
            一覧検索は非公開になります
          </h1>
          <p style={{
            fontSize: 12, color: 'rgba(250,250,247,0.8)', lineHeight: 1.9, margin: '14px 0 0',
          }}>
            代わりに、あなたのプロフィールは
            <br />
            ① 同業のプロが連携先として探せる
            <br />
            ② あなた自身が公開して名刺として使える
            <br />
            ③ 紹介経由で指名される
            <br />
            不特定多数に並べられて価格で比較されるのではなく、選ばれた形で届きます。
          </p>
        </div>
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1A2E', letterSpacing: '2px' }}>REALPROOF</div>
          <div style={{ fontSize: 10, color: '#888888', marginTop: 4 }}>強みが、あなたを定義する。</div>
        </div>
      </div>
    </div>
  )
}

export default async function SearchPage() {
  // レビュー指摘: 受付シグナル(3色ドット/「紹介につながる人のみ表示」)の露出は
  // FEATURE_SEARCH_PRIVATE の設定に関係なく、常にプロ閲覧時のみに限定する。
  // fail safe: 判定失敗時はfalse(=出さない側)に倒す（getViewerIsProStrict内部で担保）。
  const showReferralSignals = await getViewerIsProStrict()

  // フラグ未設定/false時: 既存動作を維持（受付シグナルの表示だけは上の判定でゲート）
  if (!isSearchPrivate()) {
    return <SearchPageClient showReferralSignals={showReferralSignals} />
  }

  // fail open: 判定エラー時はブロックせず通す（getViewerIsPro内部で担保）
  const isPro = await getViewerIsPro()

  if (!isPro) {
    return <SearchGuidanceScreen />
  }

  return <SearchPageClient proNotice showReferralSignals={showReferralSignals} />
}
