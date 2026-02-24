# Claude Code 指示書: 投票画面 — ログイン済みユーザーのメール入力省略

**最終更新**: 2026-02-21
**優先度**: 高（UX改善・投票完了率向上に直結）
**影響ファイル**: `src/app/vote/[qr_token]/page.tsx`（メイン）
**リスクレベル**: 低（投票ページ内の変更のみ、他ページへの影響なし）

---

## 🎯 目的

ログイン済みユーザーが投票する際、Step 4（メールアドレス入力）をスキップし、セッションからメールを自動取得する。

**ビジネス的な意味**: リピーター（リワードコレクション済みでアカウントを持っているクライアント）の投票体験を改善し、投票完了率を上げる。5ステップ → 4ステップへ短縮。

---

## 📋 実装手順

### Step 1: セッション確認ロジックの追加

`vote/[qr_token]/page.tsx` のページ読み込み時（useEffect内）で、Supabaseセッションを確認する。

```typescript
// ページ読み込み時にセッション確認
const [sessionEmail, setSessionEmail] = useState<string | null>(null);
const [isLoggedIn, setIsLoggedIn] = useState(false);

useEffect(() => {
  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email) {
      setSessionEmail(session.user.email);
      setIsLoggedIn(true);
    }
  };
  checkSession();
}, []);
```

**⚠️ 注意**: `getUser()` は使わない。必ず `getSession()` を使うこと（認証原則）。

---

### Step 2: メール入力ステップの条件分岐

投票フローのステップ管理で、ログイン済みの場合はStep 4（メール入力）をスキップする。

**現在のフロー（5ステップ）**:
```
Step 1: 強みプルーフ選択（最大3つ）
Step 2: 人柄プルーフ選択（最大3つ、任意）
Step 3: ひとことコメント（任意、100字）
Step 4: メールアドレス入力 ← ログイン済みならスキップ
Step 5: リワード選択（1つ）
```

**ログイン済みのフロー（4ステップ）**:
```
Step 1: 強みプルーフ選択（最大3つ）
Step 2: 人柄プルーフ選択（最大3つ、任意）
Step 3: ひとことコメント（任意、100字）
Step 4: リワード選択（1つ） ← 旧Step 5がStep 4になる
```

**実装方法**: ステップ遷移ロジックで、`isLoggedIn === true` の場合にStep 4をスキップして直接Step 5（リワード選択）に遷移する。

```typescript
// 「次へ」ボタンのハンドラー
const handleNext = () => {
  if (currentStep === 3 && isLoggedIn) {
    // ログイン済み: Step 4（メール入力）をスキップしてStep 5（リワード選択）へ
    setCurrentStep(5);
  } else {
    setCurrentStep(currentStep + 1);
  }
};

// 「戻る」ボタンのハンドラーも同様に対応
const handleBack = () => {
  if (currentStep === 5 && isLoggedIn) {
    // ログイン済み: Step 5からStep 3に戻る（Step 4をスキップ）
    setCurrentStep(3);
  } else {
    setCurrentStep(currentStep - 1);
  }
};
```

**⚠️ ステップ番号の実装について**: 内部的なステップ番号（1-5）はそのまま維持し、表示上のステップインジケーター（プログレスバーなど）だけを調整する方法がシンプル。内部番号を変えると影響範囲が広がるので避ける。

---

### Step 3: 投票送信時のメール取得元の変更

投票をサーバーに送信するロジックで、メールの取得元を条件分岐する。

```typescript
// 投票送信時
const submitVote = async () => {
  // ログイン済み → セッションからメール取得、未ログイン → フォーム入力値を使用
  const clientEmail = isLoggedIn ? sessionEmail : formEmail;
  
  if (!clientEmail) {
    // メールが取れない場合のエラーハンドリング
    setError('メールアドレスの取得に失敗しました');
    return;
  }

  // 以降は既存の投票送信ロジックと同じ
  const { error } = await supabase.from('votes').insert({
    professional_id: proId,
    client_email: clientEmail,
    // ... 他のフィールド
  });
};
```

---

### Step 4: ログイン済みユーザーへのUI表示

Step 4（メール入力画面）をスキップする代わりに、投票フロー内のどこかで「○○@example.com でログイン中」と小さく表示すると、ユーザーに安心感を与える。

**表示場所の候補**:
- Step 1（強みプルーフ選択）のヘッダー下に小さくグレーテキストで表示
- または投票フロー全体のフッターに表示

```tsx
{isLoggedIn && (
  <p className="text-sm text-gray-400 mt-2">
    {sessionEmail} でログイン中
  </p>
)}
```

---

### Step 5: 投票完了後のアカウント作成促進をスキップ

ログイン済みユーザーには、投票完了画面の「アカウント作成」CTAを非表示にする。既にアカウントがあるので不要。

```tsx
// 投票完了画面
{!isLoggedIn && (
  <div>
    {/* アカウント作成促進のUI */}
    <p>アカウントを作成するとリワードを管理できます</p>
    <button>アカウント作成</button>
  </div>
)}
```

---

## ✅ 既存ロジックへの影響（変更不要の確認）

以下のロジックは **変更不要**。メールの取得元がセッションになっても正常に動作する：

| ロジック | 理由 |
|---------|------|
| 重複投票チェック `UNIQUE(professional_id, client_email)` | メールの取得元に依存しない |
| 自己投票防止（プロのメールとの照合） | `client_email` で比較するので同じ |
| 1日3プロ制限（`client_email` + `created_at`） | `client_email` ベースなので同じ |
| 30分クールダウン | `client_email` ベースなので同じ |
| QRトークン24時間検証 | メールと無関係 |
| リワード付与（`client_rewards` テーブル） | `client_email` で紐づくので同じ |

---

## 🧪 テスト手順

修正後、以下の4パターンを必ずテストすること：

### パターン1: 未ログインユーザーの投票（従来フロー）
1. シークレットブラウザでQRトークンURLにアクセス
2. Step 1-5の全ステップが表示されることを確認
3. Step 4でメールアドレスを入力して投票完了
4. 投票完了後にアカウント作成促進が表示されることを確認

### パターン2: ログイン済みユーザーの投票（新フロー）
1. ログイン済み状態でQRトークンURLにアクセス
2. Step 1-3 → Step 5（リワード選択）に直接遷移することを確認
3. Step 4（メール入力）が表示されないことを確認
4. 投票完了後にアカウント作成促進が **表示されない** ことを確認
5. votesテーブルに正しいメールアドレスで保存されていることを確認

### パターン3: ログイン済みユーザーの自己投票防止
1. プロとしてログイン済み状態で、自分のQRトークンURLにアクセス
2. 自己投票防止のエラーが表示されることを確認

### パターン4: ログイン済みユーザーの重複投票防止
1. ログイン済み状態で投票を完了
2. 同じプロのQRトークンURLに再度アクセス
3. 重複投票防止のエラーが表示されることを確認

---

## 🔧 ビルド・デプロイ

```bash
# 1. ビルド確認
npm run build

# 2. コミット（1修正 = 1コミット）
git add src/app/vote/\[qr_token\]/page.tsx
git commit -m "feat: ログイン済みユーザーの投票時メール入力をスキップ"

# 3. mainにマージ → git push（これがないとVercelに反映されない）
git checkout main
git merge <ブランチ名>
git push origin main

# 4. Vercelデプロイ確認後、本番サイトでパターン1-4をテスト
```

---

## ❌ やらないこと（スコープ外）

- ステップ番号の内部リナンバリング（表示上だけ調整する）
- 投票ページ以外のファイル変更
- 新しいテーブルやカラムの追加
- 認証フローの変更
