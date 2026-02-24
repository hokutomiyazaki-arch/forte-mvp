# REALPROOF フォント残り修正 + トップページ洗練化 指示書

## ⚠️ 最重要ルール
- 認証コードに触れない
- `getSession()` を使う（`getUser()` は使わない）
- `.maybeSingle()` を使う（`.single()` は使わない）
- **コピー（文言）は確定済み。1文字も変えるな。**
- 1修正 = 1コミット
- 各修正後に `npm run build` で確認

---

## 修正一覧（2コミット）

| # | 内容 | ファイル |
|---|------|---------|
| 1 | トップページ以外の全ページでフォントを Inter + Noto Sans JP に統一 | 全ファイル |
| 2 | トップページのデザイン洗練化（コンテンツ幅 + レイアウト + 余白 + 演出） | `page.tsx` |

---

# ═══════════════════════════════════
# コミット①: 全ページ フォント統一
# ═══════════════════════════════════

## やること

トップページ（page.tsx）以外で、まだ古いフォント（DM Sans, Open Sans, Zen Maru Gothic, Zen Kaku Gothic New, serif等）が残っている箇所を全て Inter + Noto Sans JP に置き換える。

## 手順

### Step 1: grep で残存フォントを全て検出

```bash
grep -rn "DM Sans\|Open Sans\|Zen Maru\|Zen Kaku\|Georgia\|serif" src/ --include="*.tsx" --include="*.ts"
```

### Step 2: 置き換えルール

| 見つかったフォント | 置き換え先 |
|------------------|-----------|
| `'DM Sans'` | `'Inter'` |
| `'Open Sans'` | `'Inter'` |
| `'Zen Maru Gothic'` | `'Noto Sans JP', 'Inter'` |
| `'Zen Kaku Gothic New'` | `'Noto Sans JP', 'Inter'` |
| `Georgia, serif` | そのまま（Voice カードのクォーテーションのみ許可） |

### Step 3: 対象ファイル（トップページ以外の全て）

| ファイル | チェック箇所 |
|---------|------------|
| `about/page.tsx` | 全テキスト |
| `card/[id]/page.tsx` | プロ名、肩書き、BIO、タブ、プルーフラベル |
| `dashboard/page.tsx` | タブ、見出し、フォーム、FM表示 |
| `search/page.tsx` | プロ名、肩書き、チップ、検索UI |
| `login/page.tsx` | フォーム、ボタン、説明文 |
| `mycard/page.tsx` | カード表示、テキスト |
| `vote/[qr_token]/page.tsx` | 投票UI全体 |
| `vote-confirmed/page.tsx` | 完了画面全体 |
| `vote-error/page.tsx` | エラー画面 |
| `components/Navbar.tsx` | ロゴ、ナビリンク |
| `components/VoiceShareCard.tsx` | カード内テキスト |
| `components/RelatedPros.tsx` | プロ名、肩書き |
| `admin/page.tsx` | 管理画面 |
| `badge/claim/page.tsx` | バッジ画面 |

### Step 4: layout.tsx の確認

Google Fonts の読み込みが正しいか確認:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Noto+Sans+JP:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
```

他のフォント読み込み（DM Sans, Open Sans等）が残っていたら削除。

### コミットメッセージ
```
fix: remove all legacy fonts, unify to Inter + Noto Sans JP site-wide
```

---

# ═══════════════════════════════════
# コミット②: トップページ洗練化
# ═══════════════════════════════════

## 大方針

**コピー（文言）は1文字も変えない。** レイアウト・余白・幅・タイポグラフィ・演出だけで
世界レベルのLPに仕上げる。

参考にすべきデザイン: Linear.app / Stripe.com / Vercel.com / Arc.net

## コンテンツ幅の設計

### 幅の基準値

```
--max-width-narrow: 680px    /* テキスト中心のセクション */
--max-width-medium: 960px    /* カード3列、テーブル */
--max-width-wide:   1120px   /* ヒーロー、背景演出 */
```

### セクション別の幅指定

| セクション | コンテンツ幅 | 理由 |
|-----------|------------|------|
| HERO | narrow (680px) | テキスト中心。視線が散らない |
| HOW IT WORKS | medium (960px) | 3カラムカード |
| 比較テーブル | medium (960px) | テーブル |
| 3本柱 | medium (960px) | 3カラムカード |
| VOICES | medium (960px) | 3枚カード |
| FOUNDER'S NOTE | narrow (680px) | テキスト中心 |
| FM + CTA | narrow (680px) | テキスト中心 |

```tsx
// 共通ラッパー
const Narrow = ({ children, style }) => (
  <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 20px', ...style }}>
    {children}
  </div>
);

const Medium = ({ children, style }) => (
  <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 20px', ...style }}>
    {children}
  </div>
);
```

## セクション別デザイン仕様

### ─── HERO ───

**目指すもの:** 画面を開いた瞬間に「これは普通のサイトじゃない」と感じさせる。

```
レイアウト:
- 100vh（画面いっぱい）
- 全要素センター揃え
- maxWidth: 680px

タイポグラフィ:
- REAL PROOF ロゴ: Inter 900, clamp(24px, 5vw, 36px), letter-spacing: 6px
- タグライン: Noto Sans JP 600, 13px, letter-spacing: 4px, color: gold
- メイン見出し: Noto Sans JP 900, clamp(22px, 5vw, 32px), line-height: 1.9
- 「あなたのクライアントだ。」: gold色
- 葛藤テキスト: 500, clamp(13px, 2.8vw, 15px), color: #666, line-height: 2.0
- 解決テキスト: 500, clamp(13px, 2.8vw, 15px), color: #444, line-height: 2.0
- フッターテキスト: 500, clamp(11px, 2.2vw, 13px), color: #999

CTA:
- padding: 18px 56px
- background: #C4A35A
- color: white
- fontWeight: 700
- fontSize: 15px
- letter-spacing: 1px
- border: none
- transition: all 0.3s
- hover: background #b5963f, translateY(-2px), box-shadow 0 8px 24px rgba(196,163,90,0.3)

アニメーション:
- 各要素が下から順にフェードイン
- opacity: 0 → 1, translateY(24px) → 0
- duration: 0.8s, ease-out
- 各要素に0.12s遅延（stagger）
```

**CSS animation:**
```css
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.fade-up {
  animation: fadeUp 0.8s ease-out forwards;
  opacity: 0;
}
.fade-up-1 { animation-delay: 0s; }
.fade-up-2 { animation-delay: 0.12s; }
.fade-up-3 { animation-delay: 0.24s; }
.fade-up-4 { animation-delay: 0.36s; }
.fade-up-5 { animation-delay: 0.48s; }
.fade-up-6 { animation-delay: 0.60s; }
.fade-up-7 { animation-delay: 0.72s; }
```

**ヒーローとSection 2の間:**
区切り線などは入れない。十分な余白（padding-bottom: 0, Section 2のpadding-top: 100px）で自然に遷移。

---

### ─── HOW IT WORKS（Section 2）───

**目指すもの:** 「3ステップで完結する」シンプルさを視覚的に伝える。

```
ラベル: "How It Works"
  - Inter 700, 11px, uppercase, letter-spacing: 5px, color: gold
  - margin-bottom: 16px

見出し: "強みを集める。強みで選ぶ。強みを育てる。"
  - Noto Sans JP 800, clamp(18px, 4vw, 24px)
  - margin-bottom: 48px

3カラム:
  maxWidth: 960px
  gap: 32px（デスクトップ）
  gap: 24px（モバイル → 縦積み）

各ステップカード:
  - border: なし（ボーダーレスで余白で区切る）
  - padding: 0
  - text-align: center

  ステップ番号（丸）:
    width: 44px, height: 44px
    border: 1.5px solid #C4A35A
    border-radius: 50%
    display: flex, center
    fontFamily: Inter
    fontSize: 16px, fontWeight: 700
    color: #C4A35A
    margin: 0 auto 20px

  ステップ見出し:
    fontSize: clamp(16px, 3.5vw, 18px), fontWeight: 800
    color: #1A1A2E
    margin-bottom: 6px

  主語ラベル:
    fontSize: 11px, fontWeight: 600
    color: #C4A35A
    margin-bottom: 12px

  説明文:
    fontSize: clamp(13px, 2.8vw, 14px), fontWeight: 500
    color: #555
    line-height: 2.0

矢印（デスクトップのみ）:
  ステップ間に「→」
  color: rgba(196,163,90,0.4)
  fontSize: 28px
  align-self: center
  ※ モバイルでは非表示
```

---

### ─── 比較テーブル（Section 3）───

**目指すもの:** 一目で「REAL PROOFだけが違う」と分かる。

```
見出し: "★で選ぶ時代は終わった。"
  - Noto Sans JP 800, clamp(18px, 4vw, 24px)
  - margin-bottom: 40px

テーブル:
  maxWidth: 960px
  border-collapse: separate
  border-spacing: 0
  border-radius: 14px
  overflow: hidden
  border: 1px solid #E8E4DC

  ヘッダー行:
    background: #FAFAF7
    fontWeight: 700
    fontSize: 13px
    padding: 16px 20px
    text-align: center
    border-bottom: 1px solid #E8E4DC

  REAL PROOF ヘッダー:
    color: #C4A35A
    fontWeight: 800
    border-bottom: 2px solid #C4A35A

  ボディ行:
    fontSize: clamp(12px, 2.5vw, 14px)
    fontWeight: 500
    padding: 14px 20px
    border-bottom: 1px solid #F0EDE6
    text-align: center

  REAL PROOF列:
    background: rgba(196,163,90,0.05)
    fontWeight: 700
    color: #1A1A2E

  ラベル列（左端）:
    text-align: left
    fontWeight: 600
    color: #666
    width: 120px

モバイル対応:
  横スクロール（overflow-x: auto）
  テーブル minWidth: 580px
  スクロールヒント: 薄い影をテーブル右端に
```

---

### ─── 3本柱（Section 4）───

**目指すもの:** ホバーで「触れたくなる」カード。洗練されたインタラクション。

```
見出し: "REAL PROOFが他と違う、3つの理由。"
  - Noto Sans JP 800, clamp(18px, 4vw, 24px)
  - margin-bottom: 48px

3カード:
  maxWidth: 960px
  gap: 24px
  flex: 1（均等幅）

各カード:
  background: #FFFFFF
  border: 1px solid #E8E4DC
  border-radius: 14px
  padding: 32px 28px
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1)

  hover:
    border-color: #C4A35A
    box-shadow: 0 12px 40px rgba(196,163,90,0.12)
    transform: translateY(-4px)

  ラベル（蓄積 / 多次元 / 信頼性）:
    Inter 700, 11px, uppercase, letter-spacing: 4px
    color: #C4A35A
    margin-bottom: 14px

  見出し:
    Noto Sans JP 800, clamp(16px, 3.5vw, 19px)
    color: #1A1A2E
    line-height: 1.6
    margin-bottom: 12px

  本文:
    Noto Sans JP 500, clamp(13px, 2.8vw, 14px)
    color: #555
    line-height: 2.0

モバイル: 縦積み
```

---

### ─── VOICES（Section 5）───

**Part A — プロの悩み**

```
見出し: "この悩み、あなただけじゃない。"
  - Noto Sans JP 800, clamp(18px, 4vw, 24px)
  - margin-bottom: 40px

3枚カード:
  maxWidth: 960px
  gap: 24px

各カード:
  background: #FFFFFF
  border: 1px solid #E8E4DC
  border-radius: 14px
  padding: 28px
  text-align: left

  役職ラベル:
    fontSize: 11px, fontWeight: 700
    color: #C4A35A
    letter-spacing: 2px
    margin-bottom: 12px

  引用:
    fontSize: clamp(14px, 3vw, 15px), fontWeight: 500
    color: #444
    line-height: 2.0
    font-style: normal（引用符「」で囲む）

ブリッジテキスト:
  text-align: center
  fontSize: clamp(13px, 2.8vw, 15px), fontWeight: 600
  color: #1A1A2E
  margin-top: 40px

モバイル: 縦積み
```

**Part C — 投票UIモック**

```
見出し: "あなたに届く投票は、こんな感じ。"
  - センター
  - Noto Sans JP 700, 18px

プレースホルダー:
  maxWidth: 400px
  margin: 0 auto
  height: 300px
  background: #F5F2ED
  border-radius: 14px
  border: 1px dashed #D0CCC4
  display: flex, center
  fontSize: 13px, color: #999
  text: "投票UIモック（後日差し替え）"

下テキスト: "1つひとつの投票が、あなたの強みを形にする。"
  - text-align: center
  - fontSize: 14px, fontWeight: 500, color: #555
```

---

### ─── FOUNDER'S NOTE（Section 6）───

**目指すもの:** 写真とテキストで「人間が作っている」温かみ。

```
maxWidth: 680px
2カラム:
  gap: 40px
  align-items: center

左:写真プレースホルダー
  width: 280px（デスクトップ）/ 200px（モバイル）
  aspect-ratio: 1
  border-radius: 14px
  background: #F0EDE6
  border: 1px solid #E8E4DC

右:テキスト
  text-align: left（デスクトップ）/ center（モバイル）

  ラベル: "── Founder's Note"
    font-style: italic
    fontSize: 13px, fontWeight: 500
    color: #999
    margin-bottom: 20px

  見出し:
    fontSize: clamp(18px, 4vw, 22px), fontWeight: 800
    color: #1A1A2E
    line-height: 1.8
    margin-bottom: 16px

  本文:
    fontSize: 14px, fontWeight: 500
    color: #555
    line-height: 2.0
    margin-bottom: 20px

  リンク: "ストーリーを読む →"
    color: #C4A35A
    fontWeight: 700
    fontSize: 14px
    text-decoration: none
    hover: underline
    → /about

モバイル: 縦積み（写真上、テキスト下）
```

---

### ─── FM + CTA（Section 7）───

```
maxWidth: 680px
text-align: center

全員向け（上段）:
  テキスト: "REAL PROOFは、今日から誰でも使えます。"
    fontSize: clamp(14px, 3vw, 16px), fontWeight: 600
    color: #1A1A2E
    margin-bottom: 24px

  ボタン: "プロとして登録する →"
    background: #1A1A2E
    color: #fff
    padding: 18px 56px
    fontWeight: 700
    fontSize: 15px
    hover: background #2A2A3E, shadow

  margin-bottom: 48px

FMボックス（下段）:
  background: #FFFFFF
  border: 1px solid #C4A35A
  border-radius: 16px
  padding: clamp(28px, 5vw, 48px)

  ラベル: "Founding Member"
    Inter 700, 11px, uppercase, letter-spacing: 4px
    color: #C4A35A
    margin-bottom: 20px

  見出し: "最初の50名だけの特権。ただし、条件がある。"
    fontSize: clamp(16px, 3.5vw, 20px), fontWeight: 800
    color: #1A1A2E
    line-height: 1.8
    margin-bottom: 16px

  条件テキスト:
    fontSize: clamp(13px, 2.8vw, 15px), fontWeight: 500
    color: #555
    line-height: 2.0
    margin-bottom: 24px

  特典リスト（◆マーク）:
    text-align: left（ただし中央寄せのコンテナ内、maxWidth: 400px, margin: 0 auto）
    fontSize: 14px, fontWeight: 600
    color: #1A1A2E
    line-height: 2.2
    ◆ color: #C4A35A

  ボタン: "Founding Memberに挑戦する →"
    background: #C4A35A
    color: #fff
    padding: 18px 48px
    fontWeight: 700
    fontSize: 15px
    width: 100%, maxWidth: 360px
    margin-top: 28px

  残り表示:
    fontSize: 13px, fontWeight: 600
    color: #888
    margin-top: 12px
```

---

### ─── FOOTER ───

```
maxWidth: 680px
text-align: center
padding: 48px 20px
border-top: 1px solid #E8E4DC
margin-top: 80px

特定商取引法リンク:
  fontSize: 12px, color: #999
  text-decoration: underline

コピーライト:
  fontSize: 11px, color: #BBB
  margin-top: 12px
```

---

## スクロールアニメーション

### IntersectionObserver

各セクションがビューポートに入った時にfadeUp:

```tsx
// useEffect内
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);

document.querySelectorAll('.scroll-fade').forEach((el) => {
  observer.observe(el);
});
```

```css
.scroll-fade {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.7s ease-out, transform 0.7s ease-out;
}
.scroll-fade.animate-in {
  opacity: 1;
  transform: translateY(0);
}
```

---

## 全体の垂直リズム

セクション間の余白を統一:

```
セクション padding: clamp(60px, 10vw, 100px) 0
セクション内の見出し → コンテンツ間: 40-48px
カード間: 24px
テキストブロック間: 20px
```

---

## コミットメッセージ
```
feat: premium redesign of top page - typography, spacing, animations
```

---

# ═══════════════════════════════════
# 実装順序
# ═══════════════════════════════════

```
Step 1: 全ページフォント統一（コミット①）
  → grep で残存フォントを検出
  → 全て Inter + Noto Sans JP に置き換え
  → layout.tsx の不要なフォント読み込みを削除
  → npm run build → コミット

Step 2: トップページ洗練化（コミット②）
  → page.tsx を全面リライト（コピーは同じ、レイアウト・デザインだけ変更）
  → <style> タグで @media, @keyframes, hover, scroll animation
  → clamp() でレスポンシブ
  → npm run build → コミット
```

---

## Claude Code 起動コマンド

```
この指示書を読んで。

■ 2つの修正
1. トップページ以外の全ページで古いフォント（DM Sans, Open Sans等）が残っている。
   grep して全て Inter + Noto Sans JP に統一して。

2. トップページ（page.tsx）のデザインを洗練させる。
   コピー（文言）は1文字も変えない。レイアウト・幅・余白・タイポグラフィ・アニメーションだけ変更。
   指示書のセクション別仕様に従って。
   コンテンツ幅: テキスト中心 → 680px、カード3列 → 960px

■ ルール
- コピーは絶対に変えるな
- 認証コードに触るな
- 1修正 = 1コミット
- Step 1（フォント統一）から開始。まず grep 結果を見せて。
```
