# REALPROOF ブックマーク機能 実装指示書

## ⚠️ 最重要ルール
- 認証コードに触れない
- `getSession()` を使う（`getUser()` は使わない）
- `.maybeSingle()` を使う（`.single()` は使わない）
- 1修正 = 1コミット
- 各修正後に `npm run build` で確認
- **最後に必ず mainにマージ → git push**

---

## 概要

クライアントが「気になるプロ」をブックマークして、マイカードで一覧管理できる機能。
マイカードを「投票済み」「気になる」の2タブに拡張する。

### ユーザーストーリー
1. クライアントがプロのカードページ（/card/[id]）を見る
2. 「♡ 気になる」ボタンを押す（ログイン必須）
3. マイカード（/mycard）の「気になる」タブで一覧確認
4. ブックマークしたプロのカードページにワンタップで飛べる
5. 不要になったらブックマーク解除

### プロ側
- ダッシュボードに「あなたをブックマークしている人: ○名」を表示
- 誰がブックマークしたかは非公開（数だけ）

---

## 実装（4コミット）

| # | 内容 | ファイル |
|---|------|---------|
| 1 | DB: bookmarks テーブル作成 + RLS | SQL（手動実行） |
| 2 | カードページにブックマークボタン追加 | `card/[id]/page.tsx` |
| 3 | マイカードを2タブに拡張 | `mycard/page.tsx` |
| 4 | ダッシュボードにブックマーク数表示 | `dashboard/page.tsx` |

---

# ═══════════════════════════════════
# コミット①: DB設計（SQL手動実行）
# ═══════════════════════════════════

CEOに以下のSQLを出力して、Supabase SQL Editorで実行してもらう。

```sql
-- ═══════════════════════════════════
-- bookmarks テーブル
-- ═══════════════════════════════════

CREATE TABLE bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- 同じユーザーが同じプロを2回ブックマークできない
  UNIQUE(user_id, professional_id)
);

-- インデックス
CREATE INDEX idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_professional_id ON bookmarks(professional_id);

-- ═══════════════════════════════════
-- RLS ポリシー
-- ═══════════════════════════════════

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

-- 自分のブックマークだけ読める
CREATE POLICY "Users can read own bookmarks"
  ON bookmarks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 自分のブックマークだけ作れる
CREATE POLICY "Users can create own bookmarks"
  ON bookmarks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 自分のブックマークだけ消せる
CREATE POLICY "Users can delete own bookmarks"
  ON bookmarks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- プロは自分のブックマーク「数」だけ見れる（誰がブックマークしたかは見えない）
-- → これはCOUNTクエリで実現するので追加ポリシー不要
-- → プロのダッシュボードではサーバー側で集計する

-- ブックマーク数をプロ側で取得するためのポリシー
-- authenticated ユーザーが自分のprofessional_idに紐づくブックマーク数をCOUNTできる
CREATE POLICY "Pros can count own bookmarks"
  ON bookmarks FOR SELECT
  TO authenticated
  USING (
    professional_id IN (
      SELECT id FROM professionals WHERE user_id = auth.uid()
    )
  );
```

### コミットメッセージ
なし（DB変更のみ）

---

# ═══════════════════════════════════
# コミット②: カードページにブックマークボタン
# ═══════════════════════════════════

### 対象ファイル: `src/app/card/[id]/page.tsx`

### 追加するstate

```tsx
const [isBookmarked, setIsBookmarked] = useState(false);
const [bookmarkLoading, setBookmarkLoading] = useState(false);
const [currentUserId, setCurrentUserId] = useState<string | null>(null);
```

### useEffect でブックマーク状態を取得

```tsx
// 既存のuseEffect内（セッション取得後）に追加
const { data: { session } } = await supabase.auth.getSession();
if (session?.user) {
  setCurrentUserId(session.user.id);
  
  // このプロをブックマーク済みか確認
  const { data: bookmark } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('professional_id', professionalId)  // このページのプロのID
    .maybeSingle();
  
  setIsBookmarked(!!bookmark);
}
```

### ブックマーク トグル関数

```tsx
const handleBookmarkToggle = async () => {
  if (!currentUserId) {
    // 未ログイン → ログインページに飛ばす
    window.location.href = `/login?redirect=/card/${professionalId}`;
    return;
  }
  
  setBookmarkLoading(true);
  
  if (isBookmarked) {
    // 解除
    await supabase
      .from('bookmarks')
      .delete()
      .eq('user_id', currentUserId)
      .eq('professional_id', professionalId);
    setIsBookmarked(false);
  } else {
    // 追加
    await supabase
      .from('bookmarks')
      .insert({
        user_id: currentUserId,
        professional_id: professionalId,
      });
    setIsBookmarked(true);
  }
  
  setBookmarkLoading(false);
};
```

### ボタンのUI

プロ名・肩書きエリアの右端に配置。プロ自身のカードページではボタンを非表示。

```tsx
{/* プロ自身でない場合のみ表示 */}
{currentUserId && currentUserId !== pro?.user_id && (
  <button
    onClick={handleBookmarkToggle}
    disabled={bookmarkLoading}
    style={{
      background: 'none',
      border: isBookmarked ? '1.5px solid #C4A35A' : '1.5px solid #D0CCC4',
      borderRadius: 10,
      padding: '8px 16px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      transition: 'all 0.2s ease',
      background: isBookmarked ? 'rgba(196,163,90,0.08)' : 'transparent',
    }}
  >
    <span style={{ 
      fontSize: 16,
      color: isBookmarked ? '#C4A35A' : '#999',
    }}>
      {isBookmarked ? '♥' : '♡'}
    </span>
    <span style={{
      fontSize: 12,
      fontWeight: 600,
      color: isBookmarked ? '#C4A35A' : '#999',
      fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
    }}>
      {isBookmarked ? '気になる' : '気になる'}
    </span>
  </button>
)}

{/* 未ログインユーザーにも表示（押すとログインに飛ぶ） */}
{!currentUserId && (
  <button
    onClick={() => window.location.href = `/login?redirect=/card/${professionalId}`}
    style={{
      background: 'none',
      border: '1.5px solid #D0CCC4',
      borderRadius: 10,
      padding: '8px 16px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}
  >
    <span style={{ fontSize: 16, color: '#999' }}>♡</span>
    <span style={{
      fontSize: 12,
      fontWeight: 600,
      color: '#999',
      fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
    }}>
      気になる
    </span>
  </button>
)}
```

### 配置場所

プロのヘッダー部分（名前・肩書きの行）の右端。既存のレイアウトを壊さず、flexで右寄せ。

```
┌─────────────────────────────────────┐
│  [写真]  宮崎北斗              [♡ 気になる] │
│          パーソナルトレーナー                │
│          北海道・函館市                      │
└─────────────────────────────────────┘
```

### コミットメッセージ
```
feat: add bookmark button to pro card page
```

---

# ═══════════════════════════════════
# コミット③: マイカードを2タブに拡張
# ═══════════════════════════════════

### 対象ファイル: `src/app/mycard/page.tsx`

### タブ設計

```
┌──────────────┬──────────────┐
│  投票済み (3)  │  気になる (2)  │
└──────────────┴──────────────┘
```

### 追加するstate

```tsx
const [activeTab, setActiveTab] = useState<'voted' | 'bookmarked'>('voted');
const [bookmarkedPros, setBookmarkedPros] = useState<any[]>([]);
const [bookmarkCount, setBookmarkCount] = useState(0);
```

### ブックマーク一覧の取得

```tsx
// useEffect内でセッション確認後
const { data: bookmarks } = await supabase
  .from('bookmarks')
  .select(`
    id,
    created_at,
    professional_id,
    professionals (
      id,
      name,
      title,
      photo_url,
      prefecture,
      area_description
    )
  `)
  .eq('user_id', session.user.id)
  .order('created_at', { ascending: false });

if (bookmarks) {
  setBookmarkedPros(bookmarks);
  setBookmarkCount(bookmarks.length);
}
```

### タブUI

```tsx
<div style={{
  display: 'flex',
  borderBottom: '1px solid #E8E4DC',
  marginBottom: 24,
}}>
  {[
    { key: 'voted', label: '投票済み', count: votedPros.length },
    { key: 'bookmarked', label: '気になる', count: bookmarkCount },
  ].map(tab => (
    <button
      key={tab.key}
      onClick={() => setActiveTab(tab.key as any)}
      style={{
        flex: 1,
        padding: '14px 0',
        background: 'none',
        border: 'none',
        borderBottom: activeTab === tab.key ? '2px solid #C4A35A' : '2px solid transparent',
        cursor: 'pointer',
        fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
        fontSize: 14,
        fontWeight: activeTab === tab.key ? 700 : 500,
        color: activeTab === tab.key ? '#1A1A2E' : '#888',
        transition: 'all 0.2s',
      }}
    >
      {tab.label}
      {tab.count > 0 && (
        <span style={{
          marginLeft: 6,
          fontSize: 11,
          fontWeight: 700,
          color: activeTab === tab.key ? '#C4A35A' : '#AAA',
        }}>
          {tab.count}
        </span>
      )}
    </button>
  ))}
</div>
```

### 「気になる」タブのカード表示

```tsx
{activeTab === 'bookmarked' && (
  <>
    {bookmarkedPros.length === 0 ? (
      <div style={{
        textAlign: 'center',
        padding: '60px 20px',
        color: '#999',
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>♡</div>
        <div style={{
          fontSize: 15,
          fontWeight: 600,
          color: '#666',
          marginBottom: 8,
          fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
        }}>
          まだブックマークしたプロがいません
        </div>
        <div style={{
          fontSize: 13,
          color: '#999',
          lineHeight: 1.8,
          fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
        }}>
          プロのページで「♡ 気になる」を押すと<br />
          ここに追加されます
        </div>
        <a href="/search" style={{
          display: 'inline-block',
          marginTop: 24,
          padding: '12px 32px',
          background: '#C4A35A',
          color: '#fff',
          fontWeight: 700,
          fontSize: 14,
          textDecoration: 'none',
          borderRadius: 8,
          fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
        }}>
          プロを探す →
        </a>
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {bookmarkedPros.map(bookmark => {
          const pro = bookmark.professionals;
          if (!pro) return null;
          return (
            <a
              key={bookmark.id}
              href={`/card/${pro.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: 20,
                background: '#fff',
                border: '1px solid #E8E4DC',
                borderRadius: 14,
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
            >
              {/* プロ写真 */}
              <div style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: '#F0EDE6',
                overflow: 'hidden',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {pro.photo_url ? (
                  <img src={pro.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 20, color: '#999' }}>
                    {pro.name?.charAt(0) || '?'}
                  </span>
                )}
              </div>

              {/* プロ情報 */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#1A1A2E',
                  fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
                }}>
                  {pro.name}
                </div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#C4A35A',
                  marginTop: 2,
                  fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
                }}>
                  {pro.title}
                </div>
                {(pro.prefecture || pro.area_description) && (
                  <div style={{
                    fontSize: 11,
                    color: '#888',
                    marginTop: 4,
                    fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
                  }}>
                    {[pro.prefecture, pro.area_description].filter(Boolean).join('・')}
                  </div>
                )}
              </div>

              {/* ブックマーク解除ボタン */}
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  await supabase
                    .from('bookmarks')
                    .delete()
                    .eq('id', bookmark.id);
                  setBookmarkedPros(prev => prev.filter(b => b.id !== bookmark.id));
                  setBookmarkCount(prev => prev - 1);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 18,
                  color: '#C4A35A',
                  padding: 8,
                  flexShrink: 0,
                }}
                title="ブックマーク解除"
              >
                ♥
              </button>
            </a>
          );
        })}
      </div>
    )}
  </>
)}
```

### コミットメッセージ
```
feat: add bookmark tab to mycard page
```

---

# ═══════════════════════════════════
# コミット④: ダッシュボードにブックマーク数表示
# ═══════════════════════════════════

### 対象ファイル: `src/app/dashboard/page.tsx`

### プロフィールタブ内に表示

プロのダッシュボードのプロフィールタブ（または上部サマリーエリア）に、以下を追加:

```tsx
// state
const [bookmarkCount, setBookmarkCount] = useState(0);

// useEffect内（プロ情報取得後）
if (pro) {
  const { count } = await supabase
    .from('bookmarks')
    .select('*', { count: 'exact', head: true })
    .eq('professional_id', pro.id);
  
  setBookmarkCount(count || 0);
}
```

### 表示UI

ダッシュボード上部のサマリーエリア（投票数の横など）に配置:

```tsx
<div style={{
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 20px',
  background: 'rgba(196,163,90,0.06)',
  border: '1px solid rgba(196,163,90,0.2)',
  borderRadius: 10,
}}>
  <span style={{ fontSize: 18 }}>♡</span>
  <div>
    <div style={{
      fontSize: 20,
      fontWeight: 800,
      color: '#1A1A2E',
      fontFamily: "'Inter', sans-serif",
    }}>
      {bookmarkCount}
    </div>
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      color: '#888',
      fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
    }}>
      ブックマーク
    </div>
  </div>
</div>
```

**注意: 誰がブックマークしたかは表示しない。数だけ。**

### コミットメッセージ
```
feat: show bookmark count on pro dashboard
```

---

# ═══════════════════════════════════
# 最後に必ず
# ═══════════════════════════════════

```bash
git checkout main
git merge [ブランチ名]
git push origin main
```

Vercelの自動デプロイを確認。

---

# ═══════════════════════════════════
# Claude Code 起動コマンド
# ═══════════════════════════════════

```
この指示書を読んで。

ブックマーク機能を実装する。4ステップ。

Step 1: SQLを出力（CEOが手動でSupabaseで実行）
Step 2: カードページ（card/[id]/page.tsx）にブックマークボタン追加
Step 3: マイカード（mycard/page.tsx）を2タブに拡張（投票済み / 気になる）
Step 4: ダッシュボード（dashboard/page.tsx）にブックマーク数表示

■ ルール
- 認証コードに触るな
- getSession() を使う。getUser() は使うな
- .maybeSingle() を使う。.single() は使うな
- 1修正 = 1コミット
- 各コミット後に npm run build
- 全部終わったら mainにマージ → git push

■ まず Step 1 の SQL を出力して。
```
