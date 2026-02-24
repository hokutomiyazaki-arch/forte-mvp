# REALPROOF 修正指示書 v2（統合版）

## ⚠️ 最重要ルール
- 認証コードに触れない
- `getSession()` を使う（`getUser()` は使わない）
- `.maybeSingle()` を使う（`.single()` は使わない）
- 変更前にまず計画を見せて。コードはまだ書かないで。
- 1修正 = 1コミット
- 各修正後に `npm run build` で確認

---

## 修正一覧（8つ → 5コミット）

| # | 修正内容 | ファイル | コミット |
|---|---------|---------|---------|
| 1 | ロゴを元のテキストロゴに戻す | `Logo.tsx`, `Navbar.tsx`, 各フッター | ① |
| 2 | 全体のフォントを太字・見やすくする | `layout.tsx`, 各ページ | ② |
| 3 | ダッシュボードのタブ整理（強み&リワード設定タブ新設） | `dashboard/page.tsx` | ③ |
| 4 | Voice カードにプロ写真+名前を統合。ミニプロフカード廃止 | `VoiceShareCard.tsx` | ④ |
| 5 | Voice カード背景をクリーム系に統一（ダーク廃止） | `VoiceShareCard.tsx`, `card/[id]`, `dashboard` | ④ |
| 6 | 「お礼する」はダッシュボードのみ。公開カードは閲覧専用 | `card/[id]/page.tsx` | ④ |
| 7 | 直接シェア（Web Share API）に変更 | `VoiceShareCard.tsx` | ④ |
| 8 | include_profile トグル削除（DB変更なし） | `VoiceShareCard.tsx` | ④ |

---

# ═══════════════════════════════════
# コミット①: ロゴを元に戻す
# ═══════════════════════════════════

## 修正1: Seal Mark ロゴを削除し、テキストロゴに戻す

### 理由
CEO判断: Seal Mark B ロゴ（Rの円 + REALPROOF ワードマーク）はデザインが合わない。
元のシンプルなテキストロゴに戻す。

### 対象ファイル

**Navbar.tsx:**
```tsx
// BEFORE: <Logo> コンポーネント
<Logo size={0.7} showTagline={false} />

// AFTER: 元のテキストに戻す
<span style={{
  fontSize: 18,
  fontWeight: 800,
  color: '#1A1A2E',
  letterSpacing: '2px',
}}>
  REALPROOF
</span>
```

**各ページのフッター（page.tsx, search/page.tsx, card/[id]/page.tsx, voice/[hash]/page.tsx）:**
```tsx
// BEFORE
<Logo size={0.6} dark={false} />

// AFTER: テキストに戻す
<div style={{ textAlign: 'center', padding: '24px 0' }}>
  <div style={{
    fontSize: 14,
    fontWeight: 800,
    color: '#1A1A2E',
    letterSpacing: '2px',
  }}>
    REALPROOF
  </div>
  <div style={{
    fontSize: 10,
    color: '#A0A0A0',
    marginTop: 4,
  }}>
    強みが、あなたを定義する。
  </div>
</div>
```

**VoiceShareCard.tsx のシェアカード内:**
```tsx
// BEFORE
<Logo size={0.7} />

// AFTER: テキストロゴ
<div style={{
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}}>
  <span style={{
    fontSize: 12,
    fontWeight: 300,
    color: '#1A1A2E',
    letterSpacing: '3px',
    fontFamily: "'DM Sans', sans-serif",
  }}>
    REAL
  </span>
  <span style={{
    fontSize: 12,
    fontWeight: 800,
    color: '#C4A35A',
    letterSpacing: '3px',
    fontFamily: "'DM Sans', sans-serif",
  }}>
    PROOF
  </span>
</div>
```

### Logo.tsx の扱い
- ファイルは削除しない（将来使う可能性あり）
- import している箇所を全て上記のテキストに置き換えるだけ

### コミット
```
fix: revert logo to text style - remove Seal Mark
```

---

# ═══════════════════════════════════
# コミット②: フォントを太字・見やすく
# ═══════════════════════════════════

## 修正2: 全体的に太字で見やすく

### 方針
「細い・薄い・読みにくい」をすべて潰す。具体的には:

### layout.tsx の body デフォルト
```tsx
// BEFORE（もし fontWeight が指定されていなければ）
<body style={{ fontFamily: '...' }}>

// AFTER: デフォルトを少し太くする
<body style={{
  fontFamily: "'Zen Maru Gothic', 'Noto Sans JP', sans-serif",
  fontWeight: 500,        // ← デフォルトを 400→500 に
  color: '#1A1A2E',
  WebkitFontSmoothing: 'antialiased',
}}>
```

### 各ページの主要テキスト

**見出し・タイトル系:**
```tsx
// プロ名、セクションタイトル等
fontWeight: 800  // 700→800 に上げる
```

**本文・説明文:**
```tsx
// BIO、コメント、一般テキスト
fontWeight: 500  // 400→500 に上げる
```

**ラベル・サブテキスト:**
```tsx
// 肩書き、エリア、日付等
fontWeight: 600  // 400/500→600 に上げる
```

**具体的な対象ファイルと変更箇所:**

| ファイル | 要素 | Before | After |
|---------|------|--------|-------|
| `card/[id]/page.tsx` | プロ名 | fontWeight: 700~900 | **900** |
| `card/[id]/page.tsx` | 肩書き | fontWeight: 500~600 | **700** |
| `card/[id]/page.tsx` | BIO本文 | fontWeight: 400 | **500** |
| `card/[id]/page.tsx` | プルーフラベル | fontWeight: 600~700 | **700** |
| `card/[id]/page.tsx` | タブラベル | fontWeight: 500~600 | **700** |
| `card/[id]/page.tsx` | セクションラベル (STRENGTH PROOFS等) | fontWeight: 600 | **700** |
| `dashboard/page.tsx` | タブラベル | fontWeight: 500~600 | **700** |
| `dashboard/page.tsx` | 各セクションの見出し | fontWeight: 600 | **800** |
| `search/page.tsx` | プロ名 | fontWeight: 600~700 | **800** |
| `search/page.tsx` | 肩書き | fontWeight: 400~500 | **600** |
| `search/page.tsx` | 都道府県チップ | fontWeight: 500 | **600** |
| `Navbar.tsx` | REALPROOF | fontWeight: 700 | **800** |
| `RelatedPros.tsx` | プロ名 | fontWeight: 600~700 | **800** |
| `RelatedPros.tsx` | 肩書き | fontWeight: 400 | **600** |
| `vote-confirmed` | 見出し | fontWeight: 600~700 | **800** |

### ルール
- **fontWeight: 400 → 使わない**（薄すぎ）
- **最低 500**（本文）、**見出しは 700~900**
- 色が薄い（gray-400, gray-500）テキストは 1段階濃くする:
  - `text-gray-400` → `text-gray-500`
  - `text-gray-500` → `text-gray-600`
  - `#A0A0A0` → `#888888`
  - `#6B6B6B` → `#555555`

### コミット
```
fix: increase font weight and contrast across all pages
```

---

# ═══════════════════════════════════
# コミット③: ダッシュボードタブ整理
# ═══════════════════════════════════

## 修正3: ダッシュボードのタブ再構成

### 現状（ごちゃつく）
```
[プロフィール] [投票一覧] [リワード管理] [Voices]
```
→ プロフィールの中に強み選択があったり、リワード設定が別タブだったりで散らかっている

### 変更後（すっきり）
```
[プロフィール] [強み&リワード設定] [投票一覧] [Voices]
```

### タブ定義
```tsx
const tabs = [
  { id: 'profile', label: 'プロフィール' },
  { id: 'settings', label: '強み&リワード設定' },  // ← NEW（統合タブ）
  { id: 'votes', label: '投票一覧' },
  { id: 'voices', label: 'Voices' },
];
```

### 「プロフィール」タブの内容（変更後）
プロの基本情報のみ:
- 名前
- 肩書き
- 写真
- 都道府県 / エリア / オンライン対応
- 経験年数
- 自己紹介
- 予約リンク
- 「保存」ボタン

**強み選択UI（proof_items）は「プロフィール」タブから削除する**
**リワード設定UIも「プロフィール」タブにあるなら削除する**

### 「強み&リワード設定」タブの内容（NEW）
プロフィールから切り出した設定系をまとめる:

```
┌─ 強み&リワード設定 ───────────────────────┐
│                                                    │
│  ◼ あなたの強み                                    │
│  ─────────────────────────────── │
│  70項目プールから最大8個選択（うちカスタム3個）      │
│  （既存の proof_items 選択UIをそのまま移動）         │
│                                                    │
│  ◼ リワード設定                                    │
│  ─────────────────────────────── │
│  8カテゴリから最大3つ選択                            │
│  （既存のリワード設定UIをそのまま移動）              │
│                                                    │
│  [保存する]                                         │
│                                                    │
└────────────────────────────────────┘
```

### 実装方法
1. まず `dashboard/page.tsx` を全て読んで、既存のタブ構成と各タブの内容を確認
2. 「プロフィール」タブ内にある強み選択UIとリワード設定UIの**コードブロックを特定**
3. そのコードブロックを「強み&リワード設定」タブ内に**移動**（コピーではなく移動）
4. 元の場所からは削除
5. タブの配列を更新
6. タブが4つになるのでモバイルで横スクロール可能にする:

```tsx
// タブコンテナ
<div style={{
  display: 'flex',
  gap: 0,
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'none', // Firefox
}}>
```

### タブのスタイル（4つ収まるように）
```tsx
// 各タブ
<button style={{
  flex: '0 0 auto',         // 横スクロール対応
  padding: '10px 14px',     // やや小さめに
  fontSize: 13,             // やや小さめに
  fontWeight: activeTab === tab.id ? 700 : 600,
  whiteSpace: 'nowrap',
  ...
}}>
```

### 注意
- 強み選択UIとリワード設定UIの**ロジック（state, fetch, save）はそのまま**移動する
- 保存ボタンも一緒に移動する
- プロフィールタブの保存と、設定タブの保存が別々に動くようにする（今の構成次第）
- もし1つの保存ボタンで全部保存してるなら、タブごとに分離する必要あり

### コミット
```
feat: reorganize dashboard tabs - add settings tab for proofs & rewards
```

---

# ═══════════════════════════════════
# コミット④: Voice カード修正（4つまとめて）
# ═══════════════════════════════════

## 修正4: Voice カード1枚統合

### 現状の問題
- ミニプロフィールカードの文字がhtml2canvasで保存すると切れる
- 2枚構成のデザインがよくない

### 変更後のデザイン（1枚のカードに統合）

```
┌─ gradient(170deg, #FAF8F4→#F3EFE7) ──────────────┐
│ border: 1px solid #E8E4DC, borderRadius: 18          │
│ padding: 32px 26px                                    │
│ width: 340px, aspectRatio: 4/5                        │
│                                                       │
│ 上部アクセント線（gold gradient）                      │
│                                                       │
│ " （ゴールド, 48px, Georgia, opacity:0.3）             │
│                                                       │
│ "すごい人だねー"                                      │
│ （#1A1A2E, 22px, 'Noto Serif JP', weight:700,        │
│   lineHeight: 1.9）                                    │
│                                                       │
│ ─── gold 30% 区切り線 ───                            │
│                                                       │
│ ── この声が、私の明日の力になる。                      │
│ （ゴールド, 11px, italic, weight:700）                 │
│                                                       │
│ ─── 空白 20px ───                                    │
│                                                       │
│  [写真56×56円形]  宮崎北斗                             │
│                   パーソナルトレーナー（ゴールド）      │
│                                                       │
│  REAL PROOF  （テキストロゴ）                          │
└───────────────────────────────────────┘
```

### 削除するもの
- `include_profile` トグルUI
- `MiniProfileCard` コンポーネント
- `showMiniCard` state
- 2枚プレビュー表示

---

## 修正5: 背景をクリーム系に統一

**すべての Voice カード表示箇所でダーク背景 → クリーム背景:**

| ファイル | 場所 | Before | After |
|---------|------|--------|-------|
| `VoiceShareCard.tsx` | シェアカード | クリーム | クリーム（変更なし） |
| `card/[id]/page.tsx` | Voicesタブ | ダーク(#1A1A2E) | クリーム(gradient) |
| `dashboard/page.tsx` | Voicesタブ | ダーク(#1A1A2E) | クリーム(gradient) |

```tsx
// すべての Voice カード共通スタイル
const voiceCardStyle = {
  background: 'linear-gradient(170deg, #FAF8F4 0%, #F3EFE7 100%)',
  border: '1px solid #E8E4DC',
  borderRadius: 14,
  padding: '20px',
};

// クォーテーション
const quoteStyle = {
  fontSize: 32,
  color: 'rgba(196, 163, 90, 0.3)',
  fontFamily: 'Georgia, serif',
};

// コメントテキスト
const commentStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: '#1A1A2E',
  lineHeight: 1.8,
};
```

---

## 修正6: 公開カードは閲覧専用

`card/[id]/page.tsx` のVoicesタブから**削除**:
- 感謝フレーズ選択UI
- 「この声にお礼する」ボタン
- カードの展開/折りたたみ

**残す:**
- コメントテキスト
- 日付
- クリーム背景のカードデザイン

---

## 修正7: Web Share API で直接シェア

```tsx
const handleShare = async () => {
  const el = document.getElementById('voice-card-for-export');
  if (!el) return;

  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: null,
    useCORS: true,
  });

  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });

  const file = new File([blob], 'realproof-voice.png', { type: 'image/png' });

  // モバイル: 直接シェア
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'REALPROOF',
        text: '強みが、あなたを定義する。',
      });

      // シェア成功 → DB保存
      const hash = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      await supabase.from('voice_shares').insert({
        vote_id: voice.id,
        professional_id: proId,
        phrase_id: selectedPhraseId,
        include_profile: false,
        hash,
      });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }

  // PC: 画像ダウンロード
  const link = document.createElement('a');
  link.download = `realproof-voice-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
};
```

### コミット
```
fix: redesign Voice card - integrate pro info, cream bg, direct share, view-only on public
```

---

# ═══════════════════════════════════
# 実装順序
# ═══════════════════════════════════

```
Step 1: ロゴを元に戻す（コミット①）
  - Navbar, 全フッター, VoiceShareCard からロゴコンポーネント削除
  - テキストロゴに置き換え
  - npm run build → コミット

Step 2: フォントを太字に（コミット②）
  - layout.tsx のデフォルト fontWeight: 500
  - 全ページの fontWeight を上記表の通りに変更
  - 薄い色を1段階濃く
  - npm run build → コミット

Step 3: ダッシュボードタブ整理（コミット③）
  - まず dashboard/page.tsx の全コードを読む
  - 強み選択UI + リワード設定UI を特定
  - 新タブ「強み&リワード設定」に移動
  - タブ4つ対応（横スクロール）
  - npm run build → コミット

Step 4: Voice カード全修正（コミット④）
  - VoiceShareCard: プロ写真統合 + ミニプロフ削除 + Web Share API
  - card/[id] Voicesタブ: クリーム背景 + 閲覧専用
  - dashboard Voicesタブ: クリーム背景
  - npm run build → コミット
```

---

## Claude Code への起動コマンド

```
この修正指示書を読んで。

■ 前提
- タスク1〜13は完了済み（Voices, ProCard, 回遊導線は実装済み）
- 今回はデザイン修正 + タブ整理のみ
- DBマイグレーションは不要

■ 進め方
1. Step 1から順番に進める
2. 各Stepの前に「何をどう変えるか」の計画を見せて。コードはまだ書かないで。
3. OKを出してからコードを書く
4. 1Step = 1コミット
5. 既存の認証コードは絶対に触らない

■ では、Step 1（ロゴを元に戻す）から。まず計画を見せて。
```
