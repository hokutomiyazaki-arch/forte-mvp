# LINE OAuth 修正指示書（Claude Code向け）

## 問題の概要
`realproof.jp` 上の `<SignIn>` コンポーネントや `<SignInButton>` から LINE ログインすると、Clerk の OAuth コールバックが `clerk.realproof.jp` で処理される際に `authorization_invalid` エラーが発生する。

**原因:** Safari の ITP（Intelligent Tracking Prevention）により、`realproof.jp` から `clerk.realproof.jp` へのクロスドメイン Cookie が遮断され、OAuth の state/session が失われる。

**確認済み:** Clerk の Account Portal（`accounts.realproof.jp/sign-in`）経由で LINE ログインすると正常に動作する。

## 修正方針
埋め込みの `<SignIn>` コンポーネントと `<SignInButton mode="modal">` を廃止し、ログインが必要な場面では Account Portal (`accounts.realproof.jp`) にリダイレクトする。

---

## 修正箇所

### 1. `/src/app/sign-in/[[...sign-in]]/page.tsx`

**現状:** `<SignIn>` コンポーネントを埋め込みで表示している。
**修正:** Account Portal にリダイレクトする。URLの `redirect` クエリパラメータがあればそれを `redirect_url` として Account Portal に渡す。

```tsx
'use client'
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'

export default function SignInPage() {
  const searchParams = useSearchParams()
  const { isSignedIn, isLoaded } = useAuth()

  useEffect(() => {
    if (!isLoaded) return

    // 既にログイン済みならリダイレクト
    if (isSignedIn) {
      const redirect = searchParams.get('redirect')
      window.location.href = redirect || '/auth-redirect'
      return
    }

    // Account Portal にリダイレクト
    const redirect = searchParams.get('redirect')
    const baseUrl = 'https://accounts.realproof.jp/sign-in'
    const redirectUrl = redirect
      ? `${baseUrl}?redirect_url=${encodeURIComponent('https://realproof.jp' + redirect)}`
      : `${baseUrl}?redirect_url=${encodeURIComponent('https://realproof.jp/auth-redirect')}`

    window.location.href = redirectUrl
  }, [isLoaded, isSignedIn, searchParams])

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      height: '100vh', background: '#FAFAF7',
    }}>
      <div className="animate-pulse" style={{ color: '#888' }}>ログインページに移動中...</div>
    </div>
  )
}
```

### 2. `/src/app/sign-up/[[...sign-up]]/page.tsx`

**修正:** 同様に Account Portal にリダイレクト。

```tsx
'use client'
import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'

export default function SignUpPage() {
  const { isSignedIn, isLoaded } = useAuth()

  useEffect(() => {
    if (!isLoaded) return
    if (isSignedIn) {
      window.location.href = '/auth-redirect'
      return
    }
    window.location.href = `https://accounts.realproof.jp/sign-up?redirect_url=${encodeURIComponent('https://realproof.jp/auth-redirect')}`
  }, [isLoaded, isSignedIn])

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      height: '100vh', background: '#FAFAF7',
    }}>
      <div className="animate-pulse" style={{ color: '#888' }}>登録ページに移動中...</div>
    </div>
  )
}
```

### 3. `/src/components/Navbar.tsx`

**現状:** `<SignInButton mode="modal">` でモーダルログインを表示。
**修正:** `<SignInButton>` と `<SignedIn>/<SignedOut>` はそのまま使って良いが、`mode="modal"` を削除し、`mode="redirect"` に変更する。もしくはシンプルに `<a>` タグで Account Portal に飛ばす。

**Desktop メニュー（50-60行目付近）の `<SignedOut>` セクション:**
```tsx
<SignedOut>
  <a href="https://accounts.realproof.jp/sign-in?redirect_url=https%3A%2F%2Frealproof.jp%2Fauth-redirect"
    style={{
      color: '#1A1A2E', background: '#C4A35A', border: 'none',
      cursor: 'pointer', fontSize: 14, padding: '6px 16px',
      borderRadius: 8, fontWeight: 600, textDecoration: 'none',
    }}>
    ログイン
  </a>
</SignedOut>
```

**Mobile メニュー（102-110行目付近）の `<SignedOut>` セクション:**
```tsx
<SignedOut>
  <a href="https://accounts.realproof.jp/sign-in?redirect_url=https%3A%2F%2Frealproof.jp%2Fauth-redirect"
    onClick={() => setMenuOpen(false)}
    style={{ color: '#fff', textDecoration: 'none', fontSize: 15 }}>
    ログイン
  </a>
</SignedOut>
```

**注意:** `SignInButton` の import は不要になるが、`SignedIn`, `SignedOut`, `UserButton`, `useUser` は引き続き必要。

### 4. `/src/app/(main)/badge/claim/[claim_token]/page.tsx`

**現状（197行目付近）:**
```tsx
onClick={() => window.location.href = `/login?role=pro&redirect=/badge/claim/${params.claim_token}`}
```

**修正:**
```tsx
onClick={() => {
  const redirectUrl = encodeURIComponent(`https://realproof.jp/badge/claim/${params.claim_token}`)
  window.location.href = `https://accounts.realproof.jp/sign-in?redirect_url=${redirectUrl}`
}}
```

### 5. 他の箇所でログインリダイレクトしている場所

プロジェクト全体で `/login` や `/sign-in` にリダイレクトしている箇所を検索して、Account Portal URL に変更する。

```bash
grep -rn "\/login\|\/sign-in\|SignInButton" src/ --include="*.tsx" --include="*.ts"
```

ただし以下は変更不要：
- `middleware.ts` の `auth.protect()` → Clerk が自動で Account Portal に飛ばす
- `next.config.js` の `/login` → `/sign-in` リダイレクト → Account Portal へのリダイレクトに変更

### 6. `next.config.js` のリダイレクト更新

**現状:**
```js
async redirects() {
  return [
    { source: '/login', destination: '/sign-in', permanent: true },
    { source: '/login/:path*', destination: '/sign-in', permanent: true },
  ]
},
```

**修正（削除可能）:** `/sign-in` ページ自体が Account Portal にリダイレクトするので、このままでもOK。

---

## 修正完了チェックリスト

1. [ ] Safariのシークレットモードでバッジ取得URL（`/badge/claim/xxx`）にアクセス
2. [ ] 「ログインして取得」ボタンを押す → Account Portal のサインイン画面が開く
3. [ ] LINE でログイン → 認証成功 → バッジ取得画面に戻る ← これが最重要
4. [ ] トップページの「ログイン」ボタン → Account Portal に遷移
5. [ ] ログイン後 `/auth-redirect` → 正しいダッシュボードに遷移
6. [ ] `npm run build` が成功する

## 重要な注意事項
- `NEXT_PUBLIC_CLERK_PROXY_URL` が Vercel の環境変数に追加されている（`https://clerk.realproof.jp`）。この修正後も残しておいて問題ない。
- Account Portal の URL は `https://accounts.realproof.jp` で固定。
- `redirect_url` パラメータには必ず **完全なURL**（`https://realproof.jp/...`）を渡すこと。相対パスは不可。
