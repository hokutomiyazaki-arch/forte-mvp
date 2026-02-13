# FORTE MVP

**強みに人が集まるデジタル名刺。**

## セットアップ手順

### 1. 依存関係のインストール
```bash
npm install
```

### 2. 環境変数の設定
`.env.local` ファイルが既に作成済みです。Supabaseの認証情報が含まれています。

### 3. ローカルで起動
```bash
npm run dev
```
http://localhost:3000 でアクセスできます。

### 4. Vercelにデプロイ

1. このリポジトリをGitHubにpush
2. [Vercel](https://vercel.com) にサインアップ（GitHubアカウントで）
3. 「Import Project」→ GitHubリポジトリを選択
4. 環境変数を設定:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. 「Deploy」をクリック

### 5. Supabase認証の設定
Supabaseダッシュボード → Authentication → URL Configuration で:
- Site URL: `https://your-app.vercel.app`（デプロイ後のURL）
- Redirect URLs: `https://your-app.vercel.app/api/auth/callback`

## 画面構成

| URL | 内容 |
|---|---|
| `/` | トップページ |
| `/login` | プロ向けログイン（マジックリンク） |
| `/dashboard` | プロ用ダッシュボード（プロフィール編集・QRコード・投票確認） |
| `/card/[id]` | FORTEカード（公開プロフィール） |
| `/vote/[id]` | 投票フォーム（クライアントが使う） |

## 技術スタック
- Next.js 14 (App Router)
- Supabase (PostgreSQL + Auth)
- Tailwind CSS
- QRCode.js
- Vercel (hosting)
