# REALPROOF — iPhone LINE OAuth 修正指示書
**作成日**: 2026-03-10  
**対象ブランチ**: まず `main` をクリーンに → `fix/line-oauth-proxy` で作業  
**目的**: iPhoneでのLINEログイン `authorization_invalid` エラーを、本番に影響を与えずに修正する

---

## ⚠️ 現状の確認（作業前に必ず読む）

| 場所 | 状態 |
|------|------|
| Vercel本番 | 1日前の安定デプロイにPromote済み（安全） |
| GitHubのmainブランチ | 今日のプロキシ関連コミット9本が混入（壊れた状態） |
| Vercelのデプロイ設定 | mainへのpushが即本番反映になっている可能性あり |

**🛑 mainに直接pushしてはいけない。本作業はすべてfixブランチで行う。**

---

## Phase 1: Vercel の自動デプロイを一時的に止める

**目的**: mainのコード整理中に誤って本番が壊れるのを防ぐ

### CEO手動作業
1. Vercel Dashboard → `forte-mvp` → Settings → Git
2. **Production Branch** の設定を確認
3. もし "Deploy on push to main" が有効なら、一時的に止める方法：
   - Settings → Git → **Ignored Build Step** に `exit 1` を入力（全ビルドを止める）
   - ※ Phase 3完了後に削除する
   - **または**、本作業中はmainにpushしなければOK（ブランチ作業のみなので基本的に問題なし）

> 実際はfixブランチ → Preview → mainマージの順なので、mainへのpushは最後だけ。
> Ignored Build Stepの設定は不要かもしれないが、心配なら入れておく。

---

## Phase 2: mainブランチをクリーンにする

### 2-1. 作業前の状態確認

```bash
cd forte-mvp
git checkout main
git pull origin main
git log --oneline -15
```

**確認すること**: 以下の9コミットが存在するか確認する

```
481f4bf fix: hardcode clerk FAPI host instead of deriving from key
4883260 fix: publishable keyのBase64デコード前の$除去を確実にする
c955ba2 fix: add clerk-proxy route and update middleware
65a0136 fix: move clerk proxy to /api/clerk-proxy
d6ce3ce fix: Clerk FAPI proxy for iPhone LINE OAuth cookie issue
d24c302 fix: Clerk Frontend API Proxy for iPhone LINE OAuth
a35c02b fix: LINE OAuth - redirect to Account Portal
bc1ede6 fix: remove content-encoding to fix proxy decoding error
b058d56 revert: remove proxyUrl from middleware to fix Google login
```

### 2-2. 今日のコミットより前の安定ハッシュを特定する

```bash
# 上記9コミットより古いコミットのハッシュを確認する
git log --oneline -20
```

`b058d56` より古いコミット（今日のプロキシ作業開始前のコミット）のハッシュを `STABLE_HASH` としてメモする。

### 2-3. mainを安定状態にリセットする

```bash
# STABLEハッシュに強制リセット（今日のコミットを全部消す）
git reset --hard <STABLE_HASH>

# ⚠️ ここが重要：git resetはファイルの変更を戻すが、
# 新規作成されたファイルがworking treeに残る場合がある
git status
```

### 2-4. 新規ファイルの残骸を確認・削除する

```bash
# 今日追加された新規ファイルを確認（resetで消えなかったもの）
git status --porcelain

# 以下のファイル/ディレクトリが残っていたら手動削除する
# （存在する場合のみ実行）
[ -d "src/app/__clerk" ] && rm -rf src/app/__clerk && echo "Deleted __clerk"
[ -d "src/app/api/clerk-proxy" ] && rm -rf src/app/api/clerk-proxy && echo "Deleted clerk-proxy"
[ -f "src/app/sign-in/[[...sign-in]]/page.tsx" ] && echo "sign-in exists - check content"
[ -f "src/app/sign-up/[[...sign-up]]/page.tsx" ] && echo "sign-up exists - check content"

# 削除後の状態確認
git status
```

### 2-5. ファイル内容の確認（Account Portal リダイレクト版になっていないか）

以下の各ファイルを開いて、**Account Portal（accounts.realproof.jp）へのリダイレクトコードが含まれていないか**確認する：

```bash
# middleware.tsにproxyUrlが残っていないか確認
grep -n "proxyUrl\|clerk-proxy\|CLERK_PROXY" src/middleware.ts

# sign-in ページにAccount Portalリダイレクトが残っていないか確認
grep -n "accounts.realproof.jp\|Account Portal" src/app/sign-in 2>/dev/null || echo "sign-in: clean"

# Navbarを確認
grep -n "accounts.realproof.jp" src/components/Navbar.tsx || echo "Navbar: clean"
```

もしこれらのファイルにAccount Portal / proxyUrlのコードが残っていた場合：
- `git reset --hard <STABLE_HASH>` が正しく動いていれば問題ないはず
- 残っていた場合は内容を確認してから手動で修正する

### 2-6. ビルド確認とmainへのpush

```bash
npm run build
```

ビルドが通ったら：

```bash
git add -A
git status  # 変更がないことを確認（git resetで全部戻ったはず）
git push origin main --force-with-lease
```

> `--force-with-lease` は誰かが同時にpushしていた場合に安全に失敗してくれるオプション。
> `--force` より安全。

🛑 **STOP — CEOに確認**: mainがクリーンになり、ビルドが通ったことを確認してから次に進む。

---

## Phase 3: fixブランチでプロキシ修正を実装する

### 3-1. fixブランチを作成（mainの綺麗な状態から）

```bash
git checkout main
git pull origin main  # 念のため最新を取得
git checkout -b fix/line-oauth-proxy-v2
```

### 3-2. プロキシルートハンドラーを作成する

```bash
mkdir -p src/app/api/clerk-proxy/\[\[...path\]\]
```

`src/app/api/clerk-proxy/[[...path]]/route.ts` を以下の内容で作成する：

```typescript
// src/app/api/clerk-proxy/[[...path]]/route.ts
// Clerk Frontend API Proxy
// 目的: iPhoneでLINEアプリ→SafariのCookie引き継ぎ問題を解決する
// 仕組み: Clerk APIへのリクエストをrealproof.jp同一ドメイン経由にすることで
//         iOSのITPによるCookie削除を回避する
import { NextRequest, NextResponse } from 'next/server'

const CLERK_FAPI_HOST = 'clerk.realproof.jp'

async function handler(req: NextRequest) {
  const url = new URL(req.url)
  const clerkPath = url.pathname.replace(/^\/api\/clerk-proxy/, '') || '/'
  const targetUrl = `https://${CLERK_FAPI_HOST}${clerkPath}${url.search}`

  const headers = new Headers(req.headers)
  headers.set('Clerk-Proxy-Url', `${url.origin}/api/clerk-proxy`)
  headers.set('Clerk-Secret-Key', process.env.CLERK_SECRET_KEY || '')
  headers.set(
    'X-Forwarded-For',
    req.headers.get('x-forwarded-for') ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  )
  // hostを削除しないとClerkが混乱する
  headers.delete('host')
  // content-encodingを削除しないとERR_CONTENT_DECODING_FAILEDになる
  headers.delete('accept-encoding')

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    fetchOptions.body = req.body
    // @ts-expect-error duplex is needed for streaming body
    fetchOptions.duplex = 'half'
  }

  const response = await fetch(targetUrl, fetchOptions)

  const responseHeaders = new Headers(response.headers)
  responseHeaders.delete('transfer-encoding')
  responseHeaders.delete('content-encoding')

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
```

### 3-3. middleware.tsを修正する

`src/middleware.ts` を開いて、clerkMiddlewareの設定部分を以下のように変更する。

**重要**: `proxyUrl` は**環境変数がある場合のみ**有効にする。これにより環境変数を削除するだけで即座に無効化できる。

現在の末尾の `export default clerkMiddleware(...)` の部分を探して、以下のパターンに変更する：

```typescript
// ❌ Before（環境変数に関係なく常にproxyUrlが有効になる）:
export default clerkMiddleware(async (auth, req) => {
  // ...
}, { proxyUrl: 'https://realproof.jp/api/clerk-proxy' })

// ✅ After（環境変数がある時だけ有効）:
export default clerkMiddleware(async (auth, req) => {
  if (isPublicMyProof(req)) return
  if (isProtectedRoute(req)) await auth.protect()
}, (req) => {
  const proxyUrl = process.env.NEXT_PUBLIC_CLERK_PROXY_URL
  return proxyUrl ? { proxyUrl } : {}
})
```

> ⚠️ 現在のmiddleware.tsの構造を先に確認してから変更すること。
> proxyUrl関連のコードが既にある場合はそれを上記パターンに書き換える。
> 完全にない場合（クリーンなmainからブランチを切った場合）は末尾のexport部分にオプションを追加する。

### 3-4. ビルド確認とブランチpush

```bash
npm run build
```

ビルドが通ったら：

```bash
git add src/app/api/clerk-proxy/ src/middleware.ts
git commit -m "feat: Clerk Frontend API Proxy for iPhone LINE OAuth"
git push origin fix/line-oauth-proxy-v2
```

🛑 **STOP — CEOに確認**: ここで一度止まる。次のPhaseはCEO手動作業が多い。

---

## Phase 4: CEOによる外部設定変更（コードとは独立して行う）

**目的**: プロキシを有効にすると、すべてのOAuthのcallback URLが変わる。
LINE と Google の両方に新URLを登録しておく。

### 4-1. LINE Developer Console に Callback URL を追加

1. https://developers.line.biz にログイン
2. Channel ID: `2009210891` を開く
3. **LINE Login** タブ → Callback URL
4. 以下を**追加**（既存URLは消さない）：
   ```
   https://realproof.jp/api/clerk-proxy/v1/oauth_callback
   ```
5. 保存する

### 4-2. Google Cloud Console に redirect_uri を追加

1. https://console.cloud.google.com にログイン
2. Google OAuth クライアント（`387045245464-...`）を開く
3. **承認済みのリダイレクト URI** に以下を**追加**（既存は消さない）：
   ```
   https://realproof.jp/api/clerk-proxy/v1/oauth_callback
   ```
4. 保存する（反映まで最大5分かかる）

🛑 **STOP — 両方保存が完了したことを確認してから次へ。**

---

## Phase 5: Vercel Preview デプロイでテストする

### 5-1. fixブランチのPreview URLを確認する

1. Vercel Dashboard → forte-mvp → Deployments
2. `fix/line-oauth-proxy-v2` のPreviewデプロイを見つける
3. PreviewのURLをコピーする（例: `https://forte-mvp-git-fix-line-oauth-proxy-v2-xxx.vercel.app`）

> ⚠️ Previewデプロイは `realproof.jp` ドメインではないため、このステップでのLINEログインテストは意味がない。
> Previewではビルドが通るかだけ確認する。

### 5-2. Previewでのビルド確認

Vercelのデプロイログを確認して：
- ビルドエラーがないこと
- デプロイが成功していること

---

## Phase 6: mainにマージして本番への反映準備

### 6-1. mainへのマージ

```bash
git checkout main
git merge fix/line-oauth-proxy-v2
git push origin main
```

これにより Vercel が自動デプロイを開始する。

### 6-2. Vercelの環境変数追加（まだ追加しない — プロキシはまだOFF）

Vercelにデプロイされた時点では `NEXT_PUBLIC_CLERK_PROXY_URL` がないため、プロキシは無効のまま。
**Google/メールログインが壊れていないことを先に確認する。**

#### 動作確認手順:
1. https://realproof.jp にアクセス
2. Googleログインを試す → ログイン成功するか確認
3. メール/パスワードログインを試す → ログイン成功するか確認
4. 問題なければ次へ進む

🛑 **STOP — Google/メールログインが正常であることを確認してから次へ。**

---

## Phase 7: プロキシを有効化してiPhone LINEログインをテスト

### 7-1. Clerk Dashboard でプロキシ設定

1. https://dashboard.clerk.com にログイン
2. REALPROOF Production インスタンスを選択
3. **Domains** → Frontend API
4. **Proxy URL** を設定:
   ```
   https://realproof.jp/api/clerk-proxy
   ```
5. 保存する

### 7-2. Vercelに環境変数を追加してプロキシを有効化

1. Vercel Dashboard → forte-mvp → Settings → Environment Variables
2. 以下を追加:
   - **Key**: `NEXT_PUBLIC_CLERK_PROXY_URL`
   - **Value**: `https://realproof.jp/api/clerk-proxy`
   - **Environment**: Production のみ（PreviewとDevelopmentには入れない）
3. **Redeploy** する（環境変数の変更はRedeployが必要）

### 7-3. iPhoneでのテスト

1. iPhoneのLINEアプリで `realproof.jp` の任意のQRコードをスキャン
2. Safari に遷移する
3. 「LINEでログイン」を選択
4. LINEアプリが開いて認証 → Safari に戻る
5. `authorization_invalid` エラーが出ないことを確認
6. ログインが完了することを確認

### 7-4. 問題が発生した場合の即時ロールバック

**LINEログインは直らなかったが他のログインが壊れた場合**:
```
Vercel → Environment Variables → NEXT_PUBLIC_CLERK_PROXY_URL を削除 → Redeploy
```
これだけで即座にプロキシが無効になる。

**全ログインが壊れた場合**:
```
Vercel → Deployments → 1つ前のデプロイ → Promote to Production
```

---

## 作業完了チェックリスト

### Phase 2 完了時
- [ ] mainブランチのgit logに今日のプロキシコミットがないこと
- [ ] `src/app/__clerk/` ディレクトリが存在しないこと
- [ ] `src/app/api/clerk-proxy/` ディレクトリが存在しないこと（Phase 3前）
- [ ] `src/middleware.ts` に `proxyUrl` が含まれていないこと
- [ ] `npm run build` が通ること

### Phase 3 完了時
- [ ] `src/app/api/clerk-proxy/[[...path]]/route.ts` が作成されていること
- [ ] `src/middleware.ts` のproxyUrlが環境変数条件分岐になっていること
- [ ] `npm run build` が通ること

### Phase 4 完了時
- [ ] LINE Developer Console に `https://realproof.jp/api/clerk-proxy/v1/oauth_callback` が追加されていること
- [ ] Google Cloud Console に `https://realproof.jp/api/clerk-proxy/v1/oauth_callback` が追加されていること

### Phase 6 完了時
- [ ] Googleログインが正常に動くこと
- [ ] メール/パスワードログインが正常に動くこと

### Phase 7 完了時
- [ ] iPhoneのLINEアプリからLINEログインが成功すること
- [ ] PCからもGoogleログインが引き続き成功すること

---

## 今回の失敗から学んだ原則（このログに追加すること）

### 教訓15: プロキシ有効化は最後のステップ
Clerk Frontend API Proxyを有効にすると、**すべてのOAuth（Google含む）のcallback URLが変わる**。
有効化前にGoogle Cloud ConsoleとLINE Developer Consoleの両方に新URLを追加しておかないと、Googleログインが壊れる。

正しい順序:
```
①コードのデプロイ（環境変数なし = プロキシOFF）
②外部サービスのcallback URL追加（LINE + Google）
③Clerk Dashboardでproxy設定
④Vercelに環境変数追加 → Redeploy
⑤テスト
```

### 教訓16: ロールバック設計を先に決める
変更前に「何かあったら1コマンドで戻せるか？」を確認する。
今回は環境変数の削除だけでプロキシを無効にできる設計なので安全。
middleware.tsにハードコードしてはいけない理由はこれ。

### 教訓17: fixブランチ → Vercel Preview → main の順を守る
本番環境で直接修正したり、fixブランチをテストせずにmainにマージすると
「直したつもりが他の機能を壊した」事態が起きる。
今回（試み12: Googleログインが壊れた）はまさにこのパターンだった。
