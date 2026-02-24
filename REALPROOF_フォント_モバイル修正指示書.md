# REALPROOF フォント変更 + モバイル最適化 指示書

## ⚠️ 最重要ルール
- 認証コードに触れない
- `getSession()` を使う（`getUser()` は使わない）
- `.maybeSingle()` を使う（`.single()` は使わない）
- 1修正 = 1コミット
- 各修正後に `npm run build` で確認

---

## 修正一覧（3コミット）

| # | 内容 | ファイル |
|---|------|---------|
| 1 | フォントを Inter + Noto Sans JP に統一 | `layout.tsx` + 全ページ |
| 2 | トップページのモバイル表示を最適化 | `page.tsx` |
| 3 | founding_member_config の RLS / 400エラー修正 | SQL（手動実行） |

---

# ═══════════════════════════════════
# コミット①: フォント統一
# ═══════════════════════════════════

## 方針
サイト全体の書体を **Inter（英語）+ Noto Sans JP（日本語）** に統一する。
Open Sans, DM Sans, Zen Maru Gothic, その他のフォント指定を全て置き換える。

## layout.tsx の変更

### Google Fonts の読み込み
```tsx
// 既存のフォントlink（DM Sans, Open Sans, Zen Maru Gothic等）を全て削除し、以下に置き換え
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Noto+Sans+JP:wght@400;500;600;700;800;900&display=swap"
  rel="stylesheet"
/>
```

### body のデフォルトスタイル
```tsx
<body style={{
  fontFamily: "'Noto Sans JP', 'Inter', sans-serif",
  fontWeight: 500,
  color: '#1A1A2E',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
}}>
```

## 全ページ共通のフォントルール

### 英語テキスト（ロゴ、ラベル、ボタン英字）
```tsx
fontFamily: "'Inter', sans-serif"
```

### 日本語テキスト（見出し、本文、説明文）
```tsx
fontFamily: "'Noto Sans JP', 'Inter', sans-serif"
```

### フォントウェイト基準

| 用途 | fontWeight | 例 |
|------|-----------|-----|
| 本文 | 500 | BIO、説明文、コメント |
| ラベル・サブテキスト | 600 | 肩書き、日付、エリア |
| セクション見出し | 700 | カードタイトル、タブ |
| ページ見出し | 800 | ヒーロー見出し、プロ名 |
| ロゴ・最重要 | 800-900 | REALPROOF |

### 置き換え対象（grep して全て変更）

以下のフォント指定を見つけたら全て置き換える:

```
"DM Sans"           → "'Inter', sans-serif"   （英語コンテキスト）
"Open Sans"          → "'Inter', sans-serif"   （英語コンテキスト）
"Zen Maru Gothic"    → "'Noto Sans JP', 'Inter', sans-serif"
"Zen Kaku Gothic New"→ "'Noto Sans JP', 'Inter', sans-serif"
fontFamily 未指定     → 継承（bodyのデフォルトが効く）
```

### 変更対象ファイル一覧

| ファイル | 変更箇所 |
|---------|---------|
| `layout.tsx` | Google Fonts link + body font |
| `page.tsx`（トップ） | 全セクションのfontFamily |
| `about/page.tsx` | 全テキストのfontFamily |
| `card/[id]/page.tsx` | プロ名、肩書き、BIO、タブ等 |
| `dashboard/page.tsx` | タブ、見出し、フォーム等 |
| `search/page.tsx` | プロ名、肩書き、チップ等 |
| `login/page.tsx` | フォーム、ボタン等 |
| `Navbar.tsx` | ロゴ、ナビリンク |
| `VoiceShareCard.tsx` | カード内全テキスト |
| `vote/[qr_token]/page.tsx` | 投票画面全体 |
| `vote-confirmed/page.tsx` | 完了画面全体 |
| `mycard/page.tsx` | マイカード画面 |
| `RelatedPros.tsx` | 関連プロ表示 |

### REALPROOF ロゴの統一スタイル

全箇所で以下に統一:
```tsx
// Navbar
<span style={{
  fontFamily: "'Inter', sans-serif",
  fontWeight: 800,
  fontSize: 16,
  letterSpacing: '2px',
  color: '#FAFAF7',  // ダーク背景の場合
}}>
  REALPROOF
</span>

// フッター等（明るい背景）
<span style={{
  fontFamily: "'Inter', sans-serif",
  fontWeight: 800,
  fontSize: 14,
  letterSpacing: '2px',
  color: '#1A1A2E',
}}>
  REALPROOF
</span>
```

### VoiceShareCard のテキストロゴ
```tsx
<div style={{ fontFamily: "'Inter', sans-serif" }}>
  <span style={{ fontWeight: 400, letterSpacing: '2px', color: '#1A1A2E', fontSize: 12 }}>
    REAL
  </span>
  {' '}
  <span style={{ fontWeight: 800, letterSpacing: '2px', color: '#1A1A2E', fontSize: 12 }}>
    PROOF
  </span>
</div>
```

### コミットメッセージ
```
fix: unify fonts to Inter + Noto Sans JP across entire site
```

---

# ═══════════════════════════════════
# コミット②: トップページ モバイル最適化
# ═══════════════════════════════════

## 方針
スマホ（幅 ≤ 768px）で全セクションが綺麗に表示されるように調整。
デスクトップのレイアウトは壊さない。

## セクション別の修正

### HERO（Section 1）

```tsx
// デスクトップ: そのまま
// モバイル:
@media (max-width: 768px) {
  // 100vh → minHeight: 100vh（コンテンツが収まらない場合に伸びる）
  // padding: 120px 20px 60px（上にナビ分の余白）
  // REAL PROOF ロゴ: fontSize 24px → 20px
  // メイン見出し: fontSize 28px → 20px
  // 本文: fontSize 15px → 14px
  // CTAボタン: width: 100%, maxWidth: 320px
}
```

実装:
```tsx
<section style={{
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  textAlign: 'center',
  padding: '120px 20px 60px',  // モバイル想定の余白
  background: '#FAFAF7',
}}>
  {/* REAL PROOF ロゴ */}
  <div style={{
    fontFamily: "'Inter', sans-serif",
    fontSize: 'clamp(20px, 5vw, 32px)',  // ← レスポンシブフォントサイズ
    fontWeight: 800,
    letterSpacing: '4px',
    color: '#1A1A2E',
    marginBottom: 8,
  }}>
    REAL PROOF
  </div>

  {/* タグライン */}
  <div style={{
    fontSize: 'clamp(12px, 2.5vw, 14px)',
    fontWeight: 600,
    color: '#C4A35A',
    letterSpacing: '3px',
    marginBottom: 'clamp(28px, 6vw, 48px)',
  }}>
    本物が輝く社会へ。
  </div>

  {/* メイン見出し */}
  <h1 style={{
    fontSize: 'clamp(18px, 4.5vw, 28px)',  // 18px(小スマホ)〜28px(PC)
    fontWeight: 800,
    color: '#1A1A2E',
    lineHeight: 1.8,
    marginBottom: 4,
  }}>
    あなたの強みを一番知っているのは、
  </h1>
  <h1 style={{
    fontSize: 'clamp(18px, 4.5vw, 28px)',
    fontWeight: 800,
    color: '#C4A35A',
    lineHeight: 1.8,
    marginBottom: 'clamp(16px, 4vw, 28px)',
  }}>
    あなたのクライアントだ。
  </h1>

  {/* 葛藤テキスト */}
  <p style={{
    fontSize: 'clamp(13px, 2.8vw, 15px)',
    fontWeight: 500,
    color: '#444',
    lineHeight: 2.0,
    maxWidth: 600,
    marginBottom: 'clamp(12px, 3vw, 20px)',
    padding: '0 8px',
  }}>
    なのに、選ばれる基準は★の数、フォロワー数、広告費。<br />
    どれも、あなたの本当の強みを映していない。
  </p>

  {/* 解決テキスト */}
  <p style={{
    fontSize: 'clamp(13px, 2.8vw, 15px)',
    fontWeight: 500,
    color: '#444',
    lineHeight: 2.0,
    maxWidth: 600,
    marginBottom: 'clamp(24px, 5vw, 40px)',
    padding: '0 8px',
  }}>
    REAL PROOFは、実際にあなたのセッションを受けたクライアントだけが<br />
    「何が強いか」を投票で証明するプラットフォーム。
  </p>

  {/* CTA */}
  <a href="/login?role=pro" style={{
    display: 'inline-block',
    padding: '16px 48px',
    background: '#C4A35A',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    textDecoration: 'none',
    letterSpacing: '1px',
    width: '100%',
    maxWidth: 320,
    textAlign: 'center',
  }}>
    強みを証明する →
  </a>

  {/* フッターテキスト */}
  <p style={{
    fontSize: 'clamp(11px, 2.2vw, 13px)',
    fontWeight: 500,
    color: '#888',
    lineHeight: 1.9,
    marginTop: 'clamp(20px, 4vw, 32px)',
    padding: '0 8px',
  }}>
    集客に困っていなくても。SNSが苦手でも。実績がゼロでも。<br />
    クライアントの声が、あなたの最強の武器になる。
  </p>
</section>
```

### HOW IT WORKS（Section 2）

```
デスクトップ: 3カラム横並び + 矢印
モバイル: 縦積み + 矢印は「↓」に変更
```

```tsx
// 3カラムコンテナ
<div style={{
  display: 'flex',
  flexDirection: 'var(--mobile)' ? 'column' : 'row',  // ← CSS使う
  gap: 20,
  alignItems: 'stretch',
}}>
```

**実装方法（inline styleでレスポンシブ）:**

Next.jsのinline styleでは@mediaが使えないので、以下の方法で対応:

```tsx
// ページ上部に <style> タグを挿入
<style>{`
  .how-it-works-grid {
    display: flex;
    gap: 20px;
    align-items: stretch;
  }
  .how-it-works-arrow {
    display: flex;
    align-items: center;
    font-size: 24px;
    color: #C4A35A;
  }
  @media (max-width: 768px) {
    .how-it-works-grid {
      flex-direction: column;
    }
    .how-it-works-arrow {
      justify-content: center;
      transform: rotate(90deg);
    }
  }
`}</style>
```

### 比較テーブル（Section 3）

```
デスクトップ: フルテーブル
モバイル: 横スクロール可能
```

```tsx
<div style={{
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: '0 0 8px',
}}>
  <table style={{ minWidth: 600, width: '100%', ... }}>
    {/* テーブル内容 */}
  </table>
</div>
```

**テーブルのフォントサイズ:**
```tsx
// モバイルで小さく
fontSize: 'clamp(11px, 2.5vw, 14px)',
```

### 3本柱（Section 4）

```
デスクトップ: 3カラム横並び
モバイル: 縦積み（gap: 16px）
```

```tsx
<style>{`
  .pillars-grid {
    display: flex;
    gap: 20px;
  }
  .pillar-card {
    flex: 1;
    background: #fff;
    border: 1px solid #E8E4DC;
    border-radius: 12px;
    padding: 24px;
    transition: all 0.3s;
  }
  .pillar-card:hover {
    border-color: #C4A35A;
    box-shadow: 0 8px 32px rgba(196,163,90,0.12);
    transform: translateY(-3px);
  }
  @media (max-width: 768px) {
    .pillars-grid {
      flex-direction: column;
    }
    .pillar-card {
      padding: 20px;
    }
  }
`}</style>
```

### VOICES（Section 5）

```
デスクトップ: 3枚横並び
モバイル: 縦積み
```

同じパターン: flex → column at 768px

### FOUNDER'S NOTE（Section 6）

```
デスクトップ: 2カラム（写真左、テキスト右）
モバイル: 縦積み（写真上、テキスト下、センター揃え）
```

```tsx
<style>{`
  .founder-grid {
    display: flex;
    gap: 40px;
    align-items: center;
  }
  .founder-photo {
    flex: 0 0 280px;
  }
  .founder-text {
    flex: 1;
    text-align: left;
  }
  @media (max-width: 768px) {
    .founder-grid {
      flex-direction: column;
      text-align: center;
    }
    .founder-photo {
      flex: none;
      width: 200px;
    }
    .founder-text {
      text-align: center;
    }
  }
`}</style>
```

### FOUNDING MEMBER + CTA（Section 7）

```tsx
// FMボックスのパディング調整
<style>{`
  .fm-box {
    border: 1px solid #C4A35A;
    border-radius: 14px;
    padding: 40px;
    background: #fff;
  }
  @media (max-width: 768px) {
    .fm-box {
      padding: 24px 20px;
    }
  }
`}</style>
```

### 全セクション共通

```tsx
// セクションのパディング
<style>{`
  .section {
    padding: 80px 40px;
  }
  @media (max-width: 768px) {
    .section {
      padding: 48px 20px;
    }
  }
`}</style>
```

### Navbarのモバイル対応

```tsx
<style>{`
  .nav-links {
    display: flex;
    gap: 20px;
  }
  @media (max-width: 768px) {
    .nav-links {
      gap: 12px;
    }
    .nav-links span {
      font-size: 11px !important;
    }
  }
`}</style>
```

### コミットメッセージ
```
fix: mobile responsive optimization for top page
```

---

# ═══════════════════════════════════
# コミット③: FM 400エラー修正
# ═══════════════════════════════════

## 原因
`founding_member_config` テーブルのRLSポリシーが正しく設定されていないため、
クライアントサイドからの SELECT が 400 Bad Request になっている。

## SQL（CEOが手動で Supabase SQL Editor で実行）

```sql
-- founding_member_config の RLS を確認・修正
ALTER TABLE founding_member_config ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを削除してからやり直す
DROP POLICY IF EXISTS "fm_config_select" ON founding_member_config;
DROP POLICY IF EXISTS "Allow public read" ON founding_member_config;

-- 誰でも読める（公開データ）
CREATE POLICY "Allow public read founding_member_config"
  ON founding_member_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 確認
SELECT * FROM founding_member_config;
```

## 確認方法
SQL実行後、トップページをリロードして Console に 400 エラーが出なくなったらOK。

### コミットメッセージ
なし（DB変更のみ）

---

# ═══════════════════════════════════
# 実装順序
# ═══════════════════════════════════

```
Step 1: フォント統一（コミット①）
  → layout.tsx のフォント読み込みを変更
  → 全ファイルの fontFamily を grep して置き換え
  → npm run build → コミット

Step 2: モバイル最適化（コミット②）
  → page.tsx に <style> タグ追加（@media対応）
  → clamp() でフォントサイズをレスポンシブ化
  → 3カラム → 縦積み、テーブル横スクロール
  → npm run build → コミット

Step 3: FM RLS修正（コミット③）
  → CEOに「このSQLを実行して」と出力
```

---

## Claude Code 起動コマンド

```
この修正指示書を読んで。

■ 修正内容（3つ）
1. サイト全体のフォントを Inter + Noto Sans JP に統一
   - DM Sans, Open Sans, Zen Maru Gothic 等を全て置き換え
   - ウェイト: 本文500、ラベル600、見出し700-800、ロゴ800-900
   
2. トップページのモバイル表示を最適化
   - clamp() でレスポンシブフォントサイズ
   - 3カラム → モバイルで縦積み
   - テーブル横スクロール
   - Founder's Note 2カラム → 縦積み
   
3. founding_member_config の RLS修正SQL を出力
   （手動でSupabase SQL Editorで実行する）

■ ルール
- 認証コードに触るな
- 1修正 = 1コミット
- 各コミット後に npm run build

■ まずStep 1（フォント統一）の計画を見せて。
   fontFamily を含む全ファイルを grep して、変更箇所一覧を出して。
   コードはまだ書かないで。
```
