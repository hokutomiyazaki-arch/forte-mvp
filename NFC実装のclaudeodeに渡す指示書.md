# NFC Card Server Implementation — Claude Code ハンドオフ

**作成日**: 2026-02-21
**目的**: NFCカードのサーバー側実装。DB → API → UI の順で、各ステップを検証してから次へ進む。
**重要**: 1タスク1コミット。各ステップ完了後に `npm run build` で確認。

---

## 全体アーキテクチャ

```
NFCカードタップ
  ↓
realproof.jp/nfc/{card_uid}  （例: /nfc/RP-A7X2K）
  ↓
サーバー: card_uid → professional_id を特定
  ↓
24時間有効のワンタイムトークンを生成（既存のqr_tokensテーブルを再利用）
  ↓
/vote/{token} にリダイレクト（既存の投票フローに合流）
```

**ポイント**: NFCカードには静的URL（`realproof.jp/nfc/RP-001`等）が書き込まれている。動的トークン生成はサーバー側で行う。既存のQR投票フローに合流するので、投票画面の変更は不要。

---

## Step 1: `nfc_cards` テーブル作成（Supabase SQL Editor で実行）

### 1-1. テーブル作成SQL

```sql
-- ============================================
-- NFC Cards テーブル
-- ============================================

CREATE TABLE IF NOT EXISTS nfc_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  card_uid VARCHAR(20) NOT NULL UNIQUE,          -- カード固有ID（例: RP-001, RP-A7X2K）
  professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL,  -- 紐づけたプロ
  status VARCHAR(20) NOT NULL DEFAULT 'unlinked', -- unlinked / active / lost / deactivated
  linked_at TIMESTAMPTZ,                          -- 紐づけ日時
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1プロにつきアクティブカードは1枚だけ
CREATE UNIQUE INDEX idx_nfc_cards_active_pro 
  ON nfc_cards (professional_id) 
  WHERE status = 'active';

-- card_uid での高速検索
CREATE INDEX idx_nfc_cards_uid ON nfc_cards (card_uid);

-- コメント
COMMENT ON TABLE nfc_cards IS 'NFCカードの管理テーブル。カード1枚に1つのcard_uidが割り当てられ、プロに紐づけて使用する。';
COMMENT ON COLUMN nfc_cards.card_uid IS 'カードに物理的に印字されるID。concaで製造時にURL書き込み済み。';
COMMENT ON COLUMN nfc_cards.status IS 'unlinked=未紐づけ, active=使用中, lost=紛失報告済み, deactivated=無効化';
```

### 1-2. RLS（Row Level Security）ポリシー

```sql
-- RLS有効化
ALTER TABLE nfc_cards ENABLE ROW LEVEL SECURITY;

-- プロは自分のカードだけ閲覧・更新可能
CREATE POLICY "pros_view_own_cards" ON nfc_cards
  FOR SELECT USING (
    professional_id = (
      SELECT id FROM professionals WHERE user_id = auth.uid()
    )
    OR status = 'unlinked'  -- 未紐づけカードはカード登録時に閲覧が必要
  );

CREATE POLICY "pros_update_own_cards" ON nfc_cards
  FOR UPDATE USING (
    professional_id = (
      SELECT id FROM professionals WHERE user_id = auth.uid()
    )
  );

-- NFCリダイレクトエンドポイントからの読み取り（匿名ユーザーもアクセス可能）
CREATE POLICY "anon_read_active_cards" ON nfc_cards
  FOR SELECT USING (status = 'active');
```

### 1-3. 初期データ投入（200枚分）

```sql
-- 200枚のカードを一括作成（全てunlinked状態で開始）
INSERT INTO nfc_cards (card_uid, status)
SELECT 'RP-' || LPAD(n::text, 3, '0'), 'unlinked'
FROM generate_series(1, 200) AS n
ON CONFLICT (card_uid) DO NOTHING;
```

### 1-4. 検証クエリ

```sql
-- テーブルが正しく作成されたか確認
SELECT count(*) FROM nfc_cards;  -- → 200

-- statusの分布確認
SELECT status, count(*) FROM nfc_cards GROUP BY status;  -- → unlinked: 200

-- UNIQUE制約の確認（同じプロにactive 2枚つけようとするとエラーになるはず）
-- ※ これはStep 3のUI実装後にテスト
```

**✅ Step 1 完了チェック**: `SELECT count(*) FROM nfc_cards` が200を返すこと。

---

## Step 2: `/nfc/{card_uid}` リダイレクトエンドポイント

### 2-1. ファイル作成

`src/app/nfc/[card_uid]/route.ts` を作成（page.tsxではなくroute.ts = APIルート）。

```typescript
// src/app/nfc/[card_uid]/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

// サーバーサイドなのでService Role Keyを使用
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: { card_uid: string } }
) {
  const { card_uid } = params;

  try {
    // 1. card_uid からアクティブなカードを検索
    const { data: card, error: cardError } = await supabase
      .from('nfc_cards')
      .select('id, professional_id, status')
      .eq('card_uid', card_uid)
      .maybeSingle();  // ⚠️ .single()は使わない（プロジェクト原則）

    // カードが見つからない
    if (!card || cardError) {
      return NextResponse.redirect(
        new URL('/?error=invalid_card', request.url)
      );
    }

    // カードが紛失・無効化されている
    if (card.status === 'lost' || card.status === 'deactivated') {
      return NextResponse.redirect(
        new URL('/?error=card_disabled', request.url)
      );
    }

    // カードが未紐づけ
    if (card.status === 'unlinked' || !card.professional_id) {
      return NextResponse.redirect(
        new URL('/?error=card_not_linked', request.url)
      );
    }

    // 2. 24時間有効のワンタイムトークンを生成
    const token = randomBytes(16).toString('hex');

    // 3. 既存の qr_tokens テーブルにトークンを保存
    //    （既存のQR投票フローと同じ仕組みを再利用）
    const { error: tokenError } = await supabase
      .from('qr_tokens')
      .upsert({
        professional_id: card.professional_id,
        token: token,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'professional_id'  // 同一プロの古いトークンを上書き
      });

    if (tokenError) {
      console.error('Token generation error:', tokenError);
      return NextResponse.redirect(
        new URL('/?error=token_error', request.url)
      );
    }

    // 4. 既存の投票ページにリダイレクト
    return NextResponse.redirect(
      new URL(`/vote/${token}`, request.url)
    );

  } catch (error) {
    console.error('NFC redirect error:', error);
    return NextResponse.redirect(
      new URL('/?error=server_error', request.url)
    );
  }
}
```

### 2-2. 環境変数の確認

`SUPABASE_SERVICE_ROLE_KEY` が `.env.local` と Vercel の環境変数に設定されていることを確認：

```bash
# .env.local に以下があることを確認
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...   # ← これが必要
```

### 2-3. 検証方法

```bash
# ビルド確認
npm run build

# ローカルテスト（Step 1でカードを1枚activeにしてから）
# Supabase SQL Editorで:
UPDATE nfc_cards SET professional_id = '【実在するプロのID】', status = 'active', linked_at = NOW() WHERE card_uid = 'RP-001';

# ブラウザで http://localhost:3000/nfc/RP-001 にアクセス
# → /vote/{token} にリダイレクトされるはず
```

**✅ Step 2 完了チェック**:
1. `npm run build` がエラーなし
2. `/nfc/RP-001` → `/vote/{token}` にリダイレクト
3. `/nfc/INVALID` → `/?error=invalid_card` にリダイレクト
4. 紛失カードのUID → `/?error=card_disabled` にリダイレクト

---

## Step 3: ダッシュボードにカード管理セクション追加

### 3-1. 機能仕様

ダッシュボード（`src/app/dashboard/page.tsx`）に「NFCカード」セクションを追加。

**状態A: カード未登録**
```
┌─────────────────────────────────────┐
│  NFCカード                          │
│                                     │
│  カードIDを入力して登録:            │
│  [ RP-___ ] [登録する]              │
│                                     │
│  カード裏面に印字されたIDを         │
│  入力してください                   │
└─────────────────────────────────────┘
```

**状態B: カード登録済み**
```
┌─────────────────────────────────────┐
│  NFCカード                          │
│                                     │
│  カードID: RP-042                   │
│  ステータス: 使用中 ✅               │
│  登録日: 2026-02-21                 │
│                                     │
│  [紛失を報告する]                   │
└─────────────────────────────────────┘
```

**状態C: 紛失報告後**
```
┌─────────────────────────────────────┐
│  NFCカード                          │
│                                     │
│  前のカード（RP-042）は紛失として   │
│  無効化されました。                 │
│                                     │
│  新しいカードIDを入力:              │
│  [ RP-___ ] [登録する]              │
└─────────────────────────────────────┘
```

### 3-2. カード登録ロジック

```typescript
// カード登録の処理フロー
async function linkCard(cardUid: string, professionalId: string) {
  // 1. card_uid が存在し、unlinked 状態であることを確認
  const { data: card } = await supabase
    .from('nfc_cards')
    .select('id, status')
    .eq('card_uid', cardUid)
    .maybeSingle();

  if (!card) throw new Error('カードIDが見つかりません。印字されたIDを確認してください。');
  if (card.status !== 'unlinked') throw new Error('このカードは既に使用されています。');

  // 2. プロに既存のアクティブカードがないことを確認
  const { data: existing } = await supabase
    .from('nfc_cards')
    .select('id, card_uid')
    .eq('professional_id', professionalId)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) throw new Error(`既にカード（${existing.card_uid}）が登録されています。先に紛失報告してください。`);

  // 3. カードをアクティブ化
  const { error } = await supabase
    .from('nfc_cards')
    .update({
      professional_id: professionalId,
      status: 'active',
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', card.id);

  if (error) throw new Error('カードの登録に失敗しました。');
}
```

### 3-3. 紛失報告ロジック

```typescript
async function reportLost(professionalId: string) {
  // アクティブカードを lost に変更
  const { error } = await supabase
    .from('nfc_cards')
    .update({
      status: 'lost',
      updated_at: new Date().toISOString(),
    })
    .eq('professional_id', professionalId)
    .eq('status', 'active');

  if (error) throw new Error('紛失報告に失敗しました。');
  // → 新しいカードを登録できる状態になる
}
```

### 3-4. UIの実装場所

`src/app/dashboard/page.tsx` の既存セクションの下に追加。新規コンポーネントを作る場合は `src/components/NfcCardManager.tsx` として分離。

**✅ Step 3 完了チェック**:
1. 未登録状態 → カードID入力 → 登録成功
2. 登録済み状態 → ステータス表示
3. 紛失報告 → カード無効化 → 新カード登録可能
4. 存在しないカードID → エラーメッセージ
5. 既に使用中のカードID → エラーメッセージ

---

## 既存コードとの整合性チェックリスト

- [ ] `qr_tokens` テーブルの構造を確認（professional_id, token, created_at カラムの存在）
- [ ] `qr_tokens` の upsert が `onConflict: 'professional_id'` で動くか確認
- [ ] `/vote/[qr_token]/page.tsx` が既存トークン検証ロジックでNFC経由のトークンも処理できるか確認
- [ ] ダッシュボードの既存レイアウトにカード管理セクションを追加しても崩れないか確認
- [ ] `getSession()` を使用していること（getUser() は禁止）
- [ ] `.maybeSingle()` を使用していること（.single() は禁止）

---

## ⚠️ 絶対にやってはいけないこと

1. **`getUser()` を使わない** → 常に `getSession()` を使う
2. **`.single()` を使わない** → 常に `.maybeSingle()` を使う
3. **login/page.tsx を触らない** → 認証フローは地雷原
4. **Navbar.tsx を触らない** → セッション管理が壊れるリスク
5. **複数の修正を1コミットにまとめない** → 1修正1コミット
6. **`window.location.reload()` を使わない** → React state で直接更新

---

## コミット順序

```
commit 1: feat: nfc_cards テーブル作成（SQL migration）
commit 2: feat: /nfc/{card_uid} リダイレクトエンドポイント
commit 3: feat: ダッシュボードにNFCカード管理セクション追加
commit 4: test: NFCフロー動作確認・微調整
```
