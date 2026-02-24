# REAL PROOF バグ修正指示書（Claude Code向け）

## ⚠️ 重要な前提
- 前回のセッションでこれらの修正を依頼したが、コンテキスト不足により正しく反映されなかった
- 修正後は必ず `npm run build` でビルドが通ることを確認してからコミットすること
- 各問題を1つずつ修正し、動作確認してから次に進むこと

---

## 🐛 問題1: ログイン済みクライアントがプロ登録しようとするとパスワード設定画面が出る

### 現象
クライアントとしてログイン済みのユーザーが、ダッシュボードやUIから「プロとして登録」しようとすると、ログインページでパスワード設定が必須で表示される。既にパスワードは設定済みなのに。

### 原因箇所
`src/app/login/page.tsx` の以下のロジック：
```ts
const isProSignupFlow = initialRole === 'pro' && !!emailParam
const [mode, setMode] = useState<'login' | 'signup'>(isCouponFlow || isProSignupFlow ? 'signup' : 'login')
```
ログイン済みユーザーがプロ登録リンク（`/login?role=pro&email=xxx`）にアクセスすると、signupモードになりパスワード入力を求められる。

### 修正方針
ログイン済みユーザーがプロ登録しようとした場合は、ログインページを経由せずに直接professionalsテーブルにレコードを作成して `/dashboard` にリダイレクトする。`init()` 関数内で、セッションがあり `role=pro` の場合の処理を追加する。

具体的には `init()` 内の `if (session?.user && !cancelled)` ブロックで：
1. `isProSignupFlow` の場合、professionalsテーブルにupsertする
2. その後 `/dashboard` にリダイレクトする
3. signupフォームを表示しない

---

## 🐛 問題2: メール登録済みユーザーがGoogleログインするとログイン画面にループする

### 現象
メールアドレス＋パスワードで既に登録済みのユーザーが、同じメールアドレスのGoogleアカウントでログインしようとすると、ログイン画面に戻ってしまいループする。

### 原因箇所
`src/app/login/page.tsx` のOAuthエラーハンドリング：
```ts
if (errorDesc.includes('already registered') || errorDesc.includes('already exists')) {
  setError('このメールアドレスは既にパスワードで登録されています。...')
}
```
この処理は入っているが、Supabaseの設定によってはエラーがURLハッシュではなくクエリパラメータで返される場合がある。また、エラーが返されずにリダイレクトだけが起きる場合もある。

### 修正方針
1. URLハッシュだけでなく、URLのクエリパラメータ（`?error_description=...`）もチェックする
2. Supabaseのプロジェクト設定で「Allow linking identities」が有効かを確認するようコメントを追加
3. Googleログイン時に事前にメールの存在チェックを行い、既にパスワードで登録済みの場合はエラーメッセージを表示してGoogleログインをブロックする

具体的な実装：
- `handleGoogleLogin()` の中で、まずクライアント側にメール入力欄がある場合は `/api/check-email` を呼んで確認
- 通常のログイン画面ではGoogleログインボタン押下前にメールが分からないので、OAuth後のコールバックで `error` と `error_description` の両方のパラメータ（hash と query string）をチェック
- エラーメッセージに「メールアドレスとパスワードでログインしてください」と明確に表示

---

## 🐛 問題3: ログアウト/未登録ユーザーにログインボタンが右上に表示されない

### 現象
ログアウトしたユーザーや未登録のユーザーがトップページ（`/`）を訪問した時、Navbarの右上に「ログイン」ボタンが表示されない。

### 原因箇所
`src/components/Navbar.tsx` で `supabase.auth.getUser()` を使用している：
```ts
const { data: { user: authUser } } = await supabase.auth.getUser()
```
`getUser()` はサーバーに問い合わせるため、未ログイン状態でネットワークエラーやSupabaseの応答遅延が起きると、catchブロックに入り `loaded` が `true` になるが、その後の表示ロジックに問題がある可能性がある。

### 修正方針
1. `getUser()` の代わりに `getSession()` を使う（ローカルのセッション情報を見るので速くて確実）
2. エラー時でも確実に `loaded = true` かつ `user = null` になるようにする
3. try-catchの中で明示的に `setUser(null)` してから `setLoaded(true)` する

修正後のNavbar init関数：
```ts
async function init() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const u = session?.user || null
    setUser(u)

    if (u) {
      const [{ data: proData }, { data: clientData }] = await Promise.all([
        supabase.from('professionals').select('id').eq('user_id', u.id).maybeSingle(),
        supabase.from('clients').select('id').eq('user_id', u.id).maybeSingle(),
      ])
      setIsPro(!!proData)
      setIsClient(!!clientData)
    }
  } catch (_) {
    setUser(null)
  }
  setLoaded(true)
}
```

---

## ✅ 修正完了チェックリスト

修正後、以下のシナリオをすべて確認：

1. [ ] 未ログイン状態でトップページにアクセス → 右上に「ログイン」ボタンが表示される
2. [ ] ログアウト後にトップページにアクセス → 右上に「ログイン」ボタンが表示される
3. [ ] メール+パスワードで登録済みのユーザーがGoogleログインを試みる → エラーメッセージが表示され、パスワードログインを促す（ループしない）
4. [ ] ログイン済みクライアントが「プロとして登録」する → パスワード再設定なしで直接プロ登録される
5. [ ] 通常の新規登録フロー → 変わらず動作する
6. [ ] 通常のログインフロー → 変わらず動作する
7. [ ] クーポンフロー → 変わらず動作する
8. [ ] `npm run build` が成功する
