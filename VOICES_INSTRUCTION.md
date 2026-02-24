# REALPROOF Claude Code 指示書 v2: 全機能統合版
# Voices機能 + プロカードリデザイン + ロゴ統一 + 回遊導線

作成日: 2026-02-20
対象リポジトリ: `forte-mvp`

---

## ⚠️ 最重要ルール（必ず守ること）

1. **変更前にまずコードを見せて、変更はまだしないで**
2. **1修正 = 1コミット**。複数修正を混ぜない
3. **認証コードには一切触れない**（今回の範囲外）
4. **`getUser()`は使わない。`getSession()`を使う**
5. **`.single()`は使わない。`.maybeSingle()`を使う**
6. **コンテキスト10%以下になったら即座にSTOP → ハンドオフログを出力**
7. **各修正後に `npm run build` で確認してからコミット**
8. **既存のUI・レイアウト・機能は絶対に変更しない**（追加のみ）

---

## 🎯 今回のゴール（4つ）

| # | ゴール | 概要 |
|---|--------|------|
| A | **ロゴ統一** | Seal Mark B ロゴを全体に反映 |
| B | **プロカードリデザイン** | `/card/[id]` を v4 JSXデザインに全面刷新 |
| C | **Voices機能** | ダッシュボードにVoicesタブ、SNSシェアカード生成、Voice URLページ |
| D | **回遊導線** | 投票完了→他プロ発見→検索の流れを作る |

---

## 実装順序（この順番で進める）

| # | タスク | ファイル | ゴール | 重さ |
|---|--------|----------|--------|------|
| 1 | デザイントークン + フォント統一 | `src/lib/design-tokens.ts` (新規) + `layout.tsx` | A | ★ |
| 2 | ロゴコンポーネント作成 | `src/components/Logo.tsx` (新規) | A | ★ |
| 3 | Navbarにロゴ反映 | `src/components/Navbar.tsx` | A | ★ |
| 4 | DBマイグレーション（voice_shares + gratitude_phrases） | SQL（手動実行） | C | ★ |
| 5 | プロカードリデザイン | `src/app/card/[id]/page.tsx` | B | ★★★ |
| 6 | ダッシュボードにVoicesタブ追加 | `src/app/dashboard/page.tsx` | C | ★★★ |
| 7 | Voiceシェアカード生成 | `src/components/VoiceShareCard.tsx` (新規) | C | ★★ |
| 8 | Voice URLページ | `src/app/voice/[hash]/page.tsx` (新規) | C | ★★ |
| 9 | RelatedProsコンポーネント作成 | `src/components/RelatedPros.tsx` (新規) | D | ★★ |
| 10 | vote-confirmedに回遊導線追加 | `src/app/vote-confirmed/page.tsx` | D | ★★ |
| 11 | card/[id]に回遊導線追加 | `src/app/card/[id]/page.tsx` | D | ★ |
| 12 | 検索ページに都道府県フィルター追加 | `src/app/search/page.tsx` | D | ★★ |
| 13 | フッターにロゴ反映 | 各ページ | A | ★ |

---

# ═══════════════════════════════════
# PART A: ロゴ統一
# ═══════════════════════════════════

## タスク1: デザイントークン + フォント統一

### ファイル: `src/lib/design-tokens.ts`（新規作成）

```tsx
export const COLORS = {
  bg: '#FAF8F4',
  cardBg: '#FFFFFF',
  cardBorder: '#E8E4DC',
  dark: '#1A1A2E',
  gold: '#C4A35A',
  goldLight: '#C4A35A15',
  goldBorder: '#C4A35A30',
  text: '#2D2D2D',
  textSub: '#6B6B6B',
  textMuted: '#A0A0A0',
  divider: '#E8E4DC',
};

export const FONTS = {
  main: "'Zen Maru Gothic', 'Rounded Mplus 1c', 'Noto Sans JP', sans-serif",
  mono: "'DM Sans', sans-serif",
  serif: "'Noto Serif JP', Georgia, serif",
};
```

### ファイル: `src/app/layout.tsx`

Google Fontsの読み込みを `layout.tsx` に集約（各ページでバラバラに読んでいる場合）:

```html
<link 
  href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700;900&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300&family=Noto+Serif+JP:wght@400;500;600;700&display=swap" 
  rel="stylesheet" 
/>
```

コミット: `feat: add design tokens + centralize font loading`

---

## タスク2: ロゴコンポーネント作成

### ファイル: `src/components/Logo.tsx`（新規作成）

ロゴは **B. Seal Mark** を採用。「R」のサークル + REAL(細) PROOF(太ゴールド) + 日本語キャッチフレーズ。

```tsx
interface LogoProps {
  size?: number;        // スケール倍率（デフォルト: 1）
  dark?: boolean;       // 背景が暗い場合はtrue（テキスト色が白になる）
  showTagline?: boolean; // キャッチフレーズ表示（デフォルト: true）
}
```

**デザイン仕様（`realproof-logo-concepts.jsx` の LogoB 関数を忠実に再現）:**
- **SVGサークル**: 外円(cx=22, cy=22, r=20, stroke=1.5) + 内円(r=16, stroke=0.5, opacity=0.4)
- **「R」**: fontSize=20, fontWeight=700, color=#C4A35A, textAnchor=middle
- **ワードマーク**: `REAL`(fontWeight:300) + `PROOF`(fontWeight:700, color:#C4A35A)
- **letterSpacing**: 5px（ワードマーク）、3px（キャッチフレーズ）
- **キャッチフレーズ**: 「強みが、あなたを定義する。」fontSize=8×size, fontWeight=500, opacity=0.7, color=ゴールド
- **フォント**: ワードマーク = `'DM Sans', 'Inter', sans-serif` / キャッチフレーズ = `'Zen Maru Gothic', sans-serif`
- **SVGで描画する。画像ファイルは使わない。**
- **ダークモード**: `dark={true}` の時、テキスト色が白(#fff)になる。ゴールド部分はそのまま。

コミット: `feat: add Logo component (Seal Mark B)`

---

## タスク3: Navbarにロゴ反映

### ファイル: `src/components/Navbar.tsx`

- 現在のテキストロゴ「REALPROOF」を `<Logo>` コンポーネントに置き換え
- `size={0.7}` で小さめに
- `showTagline={false}`（Navbarにスペースがない）
- ダーク背景なら `dark={true}`

**⚠️ 認証ロジックには一切触れないこと。ロゴ部分のみ変更。**

コミット: `feat: apply Seal Mark logo to Navbar`

---

# ═══════════════════════════════════
# PART B: プロカードリデザイン
# ═══════════════════════════════════

## タスク4: DBマイグレーション

### Supabase SQL Editorで手動実行するSQL

```sql
-- ============================================
-- Voices機能用テーブル
-- ============================================

-- 感謝フレーズ マスターデータ
CREATE TABLE IF NOT EXISTS gratitude_phrases (
  id SERIAL PRIMARY KEY,
  text VARCHAR(100) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0
);

INSERT INTO gratitude_phrases (id, text, is_default, sort_order) VALUES
  (1, 'この声が、私の明日の力になる。', true, 1),
  (2, 'こういう言葉が、いちばん嬉しい。', false, 2),
  (3, '届いた声に、背中を押される。', false, 3),
  (4, 'この仕事をやっていてよかった。', false, 4),
  (5, 'ありがとう。これからも。', false, 5)
ON CONFLICT (id) DO NOTHING;

-- Voiceシェア テーブル
CREATE TABLE IF NOT EXISTS voice_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vote_id UUID NOT NULL REFERENCES votes(id),
  professional_id UUID NOT NULL REFERENCES professionals(id),
  phrase_id INT NOT NULL REFERENCES gratitude_phrases(id),
  include_profile BOOLEAN DEFAULT false,
  hash VARCHAR(12) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  view_count INT DEFAULT 0,
  click_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_voice_shares_hash ON voice_shares(hash);
CREATE INDEX IF NOT EXISTS idx_voice_shares_professional ON voice_shares(professional_id);

-- RLS
ALTER TABLE voice_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE gratitude_phrases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gratitude_phrases_select" ON gratitude_phrases
  FOR SELECT USING (true);

CREATE POLICY "voice_shares_insert" ON voice_shares
  FOR INSERT WITH CHECK (
    professional_id IN (
      SELECT id FROM professionals WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "voice_shares_select_public" ON voice_shares
  FOR SELECT USING (true);
```

**⚠️ Claude Codeには「SQLは手動で実行済み」と伝える。**

---

## タスク5: プロカードリデザイン

### ファイル: `src/app/card/[id]/page.tsx`

**これが最も大きな変更。** `realproof-procard-v4.jsx` のデザインを忠実に再現する。

### 5.1 デザイントークン

`src/lib/design-tokens.ts` からインポートして使用。追加でローカル定数:

```tsx
const T = {
  ...COLORS,
  font: FONTS.main,
  fontMono: FONTS.mono,
};
```

### 5.2 ページ全体構造

```
背景: #FAF8F4（クリーム）
最大幅: 420px, margin: 0 auto, padding: 16px

┌─ ヘッダーカード ─────────────────┐
│ [写真 72×72] 名前（20px, 900weight）  │
│              肩書き（ゴールド, 12px）    │
│              エリア + オンライン対応      │
│ ─────────────────────────────── │
│ 47 proofs（大きいゴールド数字 30px）   │
└──────────────────────────────────┘

┌─ BIO ────────────────────────────┐
│ 自己紹介テキスト（12px, line-height:1.9）│
└──────────────────────────────────┘

┌─ タブ切替 ───────────────────────┐
│ [強み] [認定・資格] [Voices]            │
└──────────────────────────────────┘

（タブコンテンツ — 下記 5.3〜5.5 参照）

┌─ CTA ────────────────────────────┐
│ [予約する]（bg:#1A1A2E, color:#C4A35A） │
│ [このプロに相談する]（border:#1A1A2E） │
│ QRコード案内テキスト                      │
└──────────────────────────────────┘

（★ タスク11で RelatedPros をここに追加 ★）

┌─ フッター ───────────────────────┐
│ 強みが、あなたを定義する。               │
│ <Logo size={0.6} dark={false} />         │
└──────────────────────────────────┘
```

### 5.3 タブ: 強み

**タブUI仕様:**
- 3つのタブ: 強み / 認定・資格 / Voices
- タブコンテナ: bg白, borderRadius:12, padding:3, border:1px solid #E8E4DC
- 選択中: bg:#1A1A2E, color:#C4A35A, borderRadius:10
- 未選択: transparent, color:#A0A0A0
- Voicesタブにはコメント数バッジ

**強みプルーフ:**
- セクションラベル: "STRENGTH PROOFS"（10px, uppercase, letterSpacing:2, DM Sans）
- Top3カード: padding:18px, bg白, border:1px #E8E4DC, borderRadius:14
  - バー height:8px, ラベル14px bold, 票数16px ゴールド
- 残りカード: 別カード, バー height:5px, ラベル13px, 票数13px muted
- バー色: rank1=#C4A35AFF, rank2=#C4A35ACC, rank3=#C4A35A99, rank4+=#C4A35A55
- バー背景: #F0EDE6
- **バー幅: maxVotes = Math.ceil(rawMax * 1.5)**（既存の1.5倍スケール）
- アニメーション: width 0%→pct%, transition 1.2s ease, 各バー0.08s遅延

**パーソナリティプルーフ:**
- セクションラベル: "PERSONALITY PROOFS"
- SVGリングチャート:
  - サイズ: 76×76, strokeWidth: 4
  - 背景: #F0EDE6, 前景: #C4A35A
  - 中央: 票数(18px, bold, ゴールド)
  - 下: ラベル(11px, bold, 中央寄せ)
  - 3つ横並び justify-around
- 合計表示: 「パーソナリティへの投票 計 {total}」

### 5.4 タブ: 認定・資格

- セクションラベル: "CERTIFICATIONS & BADGES"
- バッジカード: 56×56アイコン + ラベル(14px bold) + 発行者(11px muted)
- ホバーで枠ゴールド、タップでバッジURL遷移
- バッジ画像は `public/badges/` から。なければゴールドグラデーション背景にIMGプレースホルダー

### 5.5 タブ: Voices（★新規★）

- セクションラベル: "VOICES — {count} COMMENTS"
- **表示対象**: commentがNULLでない確定済み投票のみ
- **各Voiceカード（ダーク背景 #1A1A2E, borderRadius:14）:**

```
┌─ ダーク背景(#1A1A2E) ──────────────┐
│ " （32px, ゴールド25%透過, Georgia）     │
│ コメントテキスト（白, 13px, line:1.9）   │
│ 日付（11px, #444, DM Sans）             │
│ ─── タップで展開 ──────────────── │
│ 感謝のひとこと                           │
│ [── この声が、私の明日の力になる。]     │
│                                          │
│ [この声にお礼する]                       │
└──────────────────────────────────┘
```

**展開の動作:**
1. カード全体タップ → 下部展開（感謝フレーズ + シェアボタン）
2. フレーズ部分タップ → 5つの選択肢表示
3. フレーズ選択 → 確定、一覧閉じる
4. 「この声にお礼する」→ シェアプレビューモーダル（タスク7）

**データ取得:**
```tsx
const { data: voices } = await supabase
  .from('votes')
  .select('id, comment, created_at')
  .eq('professional_id', proId)
  .eq('status', 'confirmed')
  .not('comment', 'is', null)
  .neq('comment', '')
  .order('created_at', { ascending: false });
```

### 5.6 CTA セクション

- 「予約する」: bg:#1A1A2E, color:#C4A35A, padding:15px, borderRadius:14
- 「このプロに相談する」: border:1.5px #1A1A2E, bg:transparent, padding:14px
- QRコード案内: bg白, border:1px #E8E4DC, fontSize:11

コミット: `feat: redesign pro card page with new UI`

---

# ═══════════════════════════════════
# PART C: Voices機能
# ═══════════════════════════════════

## タスク6: ダッシュボードにVoicesタブ追加

### ファイル: `src/app/dashboard/page.tsx`

**既存タブ構成に「Voices」を追加:**

```tsx
const tabs = [
  { id: 'profile', label: 'プロフィール' },
  { id: 'votes', label: '投票一覧' },
  { id: 'rewards', label: 'リワード管理' },
  { id: 'voices', label: 'Voices' },  // ← NEW
];
```

### Voicesタブのコンテンツ

```
┌─ Voicesタブ ────────────────────────┐
│ VOICES — {count} COMMENTS                │
│                                          │
│ ┌─ ダーク Voice カード ──────────────┐ │
│ │ " コメント                         │ │
│ │ 日付                               │ │
│ │ ──（展開時）───────────────── │ │
│ │ 感謝フレーズ選択                   │ │
│ │ [この声にお礼する]                 │ │
│ └──────────────────────────┘ │
│                                          │
│ (コメントなしの場合:)                     │
│ コメントがまだありません。                │
│ クライアントからコメント付き投票が        │
│ 届くとここに表示されます。               │
└──────────────────────────────────┘
```

**データ取得:**
```tsx
const { data: voices } = await supabase
  .from('votes')
  .select('id, comment, created_at')
  .eq('professional_id', myProId)
  .eq('status', 'confirmed')
  .not('comment', 'is', null)
  .neq('comment', '')
  .order('created_at', { ascending: false });

const { data: phrases } = await supabase
  .from('gratitude_phrases')
  .select('*')
  .order('sort_order');
```

コミット: `feat: add Voices tab to dashboard`

---

## タスク7: Voiceシェアカード生成

### ファイル: `src/components/VoiceShareCard.tsx`（新規作成）

### 7.1 Voice カード（★ Card B: Warm / クリーム背景 ★）

**シェアするのは Card B（Warm）。ダーク版ではない。**

`realproof-procard-v4.jsx` の `VoiceCardWithLogo` 関数を忠実に再現:

```
┌─ gradient(170deg, #FAF8F4→#F3EFE7), border:1px #E8E4DC ─┐
│ borderRadius:18, padding:32px 26px, aspectRatio:4/5         │
│                                                              │
│ 上部アクセント線: gradient(90deg, transparent→gold60→transparent) │
│                                                              │
│ " （ゴールド, 56px, Georgia, opacity:0.3）                    │
│                                                              │
│ "初めて腰の痛みを感じずに                                    │
│  朝起きられました"                                            │
│ （#1A1A2E, 24px, 'Noto Serif JP', weight:700, line:2.0）     │
│                                                              │
│ ─── （gold30%区切り線）                                      │
│ ── この声が、私の明日の力になる。                             │
│ （ゴールド, 11px, italic, weight:700）                        │
│                                                              │
│ <Logo size={0.7} dark={false} />                             │
└──────────────────────────────────────────┘
```

### 7.2 プロフィール ミニカード（トグルONで表示）

```
┌─ bg:#FAF8F4, borderRadius:16, padding:20px 18px ──────┐
│ [写真48×48] 田中 太郎 (15px,900w)       47 proofs      │
│              痛み改善の専門家（ゴールド）                 │
│                                                          │
│ 痛みを取る技術がある       ████████████  14             │
│ 根本原因にアプローチできる  ████████     11             │
│ 動きを変える技術がある      ██████       8              │
│ ────────────────────────────────── │
│ 東京都 · 渋谷・恵比寿エリア          realproof.jp      │
└──────────────────────────────────────┘
```

### 7.3 シェアプレビューモーダル

```tsx
// position:fixed, inset:0, bg:#000000cc, maxWidth:380px
<VoiceCardWarm comment={voice.comment} phrase={selectedPhrase} />
<Toggle checked={showMiniCard} /> プロフィールカードも付ける
{showMiniCard && <MiniProfileCard />}
<button>戻る</button>
<button>画像を保存</button>
```

### 7.4 画像保存（html2canvas）

```bash
npm install html2canvas
```

```tsx
import html2canvas from 'html2canvas';

const handleSaveImage = async () => {
  const el = document.getElementById('voice-card-for-export');
  if (!el) return;
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: null, useCORS: true });
  const link = document.createElement('a');
  link.download = `realproof-voice-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
};
```

### 7.5 voice_sharesへの保存

```tsx
const handleShare = async () => {
  const hash = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  await supabase.from('voice_shares').insert({
    vote_id: voice.id,
    professional_id: proId,
    phrase_id: selectedPhraseId,
    include_profile: showMiniCard,
    hash,
  });
  await handleSaveImage();
};
```

コミット: `feat: add VoiceShareCard component with image export`

---

## タスク8: Voice URLページ

### ファイル: `src/app/voice/[hash]/page.tsx`（新規作成）

### 8.1 ページ構成

```
背景: #FAF8F4

① Voice表示（ファーストビュー）
   " コメント（大きめ、ダーク背景）
   ── 感謝フレーズ（ゴールド）

② プロフィール（include_profile=trueの場合のみ）
   MiniProfileCard と同じデザイン

③ CTA
   [あなたも強みを証明しませんか？] → /login?role=pro

④ REALPROOF説明（初見向け）
   概要テキスト + Logo B
```

### 8.2 データ取得

```tsx
const { data: share } = await supabase
  .from('voice_shares')
  .select(`
    *,
    votes!inner(comment, created_at),
    professionals!inner(id, name, title, prefecture, area_description, photo_url),
    gratitude_phrases!inner(text)
  `)
  .eq('hash', params.hash)
  .maybeSingle();

// 閲覧数インクリメント
if (share) {
  await supabase
    .from('voice_shares')
    .update({ view_count: share.view_count + 1 })
    .eq('id', share.id);
}
```

### 8.3 OGP

```tsx
export async function generateMetadata({ params }) {
  return {
    title: 'REALPROOFに届いた声',
    description: `「${comment.slice(0, 30)}...」── ${phrase}`,
    openGraph: {
      title: 'REALPROOFに届いた声',
      description: `「${comment.slice(0, 30)}...」── ${phrase}`,
      url: `https://realproof.jp/voice/${params.hash}`,
      images: ['/og-voice.png'], // MVP: 共通ブランド画像
    },
  };
}
```

**`/public/og-voice.png` が必要。** 1200×630px、ダーク背景にロゴ + キャッチフレーズ。

コミット: `feat: add Voice URL page (/voice/[hash])`

---

# ═══════════════════════════════════
# PART D: 回遊導線
# ═══════════════════════════════════

## タスク9: RelatedProsコンポーネント作成

### ファイル: `src/components/RelatedPros.tsx`（新規作成）

**投票完了後「1プロで完結して帰る」問題を塞ぐ。**

### Props
```typescript
interface RelatedProsProps {
  currentProId: string;
  prefecture: string;
  maxDisplay?: number;     // デフォルト: 3
  title?: string;          // デフォルト: 「この地域で活躍するプロ」
  showWhenEmpty?: boolean; // デフォルト: false
}
```

### データ取得
```sql
-- 同じ都道府県のプロ（現在のプロを除外）
SELECT p.id, p.name, p.title, p.photo_url, p.prefecture, p.area_description
FROM professionals p
WHERE p.prefecture = {都道府県}
  AND p.id != {currentProId}
  AND p.name IS NOT NULL AND p.name != ''
ORDER BY p.created_at DESC
LIMIT 3;

-- 各プロのトッププルーフ上位2件
SELECT vs.professional_id, pi.label, vs.vote_count
FROM vote_summary vs
JOIN proof_items pi ON pi.id = vs.proof_item_id
WHERE vs.professional_id IN ({上記のID群})
ORDER BY vs.vote_count DESC;
-- → アプリ側でpro別にグルーピングしてtop2を表示
```

### UIデザイン

```
┌─ bg-[#FAF8F4] ────────────────────────┐
│  この地域で活躍するプロ                      │
│                                              │
│  ┌────┐  ┌────┐  ┌────┐              │
│  │[写真]│  │[写真]│  │[写真]│              │
│  │ 名前 │  │ 名前 │  │ 名前 │              │
│  │肩書き│  │肩書き│  │肩書き│              │
│  │エリア│  │エリア│  │エリア│              │
│  │──── │  │──── │  │──── │              │
│  │強み 18│  │強み 15│  │強み 21│              │
│  │強み 12│  │強み  9│  │強み 14│              │
│  └────┘  └────┘  └────┘              │
│                                              │
│  もっと見る → （ゴールド、/search へ）        │
└──────────────────────────────────────┘
```

**スタイリング:**
- セクション背景: bg-[#FAF8F4]
- カード: 白背景、角丸、シャドウなし
- 写真: 円形 `rounded-full` 64x64
- 写真なし: イニシャルアバター（bg-[#1A1A2E] text-white, 名前の最初の1文字）
- プロ名: text-[#1A1A2E] 太字
- 肩書き: text-gray-500 小さめ
- エリア: text-gray-400 最小
- トッププルーフ: ラベル左寄せ + 票数バッジ右寄せ（bg-[#C4A35A]15, text-[#C4A35A], font-bold）
- 票数0件: トッププルーフ部分だけ非表示（カードは出す）
- 「もっと見る →」: text-[#C4A35A]（ゴールド）
- モバイル: 横スクロールカルーセル（snap scroll）
- カードクリック → `/card/{pro_id}`
- 0人の場合: showWhenEmpty=false ならセクション自体非表示

コミット: `feat: add RelatedPros component`

---

## タスク10: vote-confirmedに回遊導線追加

### ファイル: `src/app/vote-confirmed/page.tsx`

**⚠️ 既存のUIは一切変更しない。追加だけ。**

### 手順
1. **まず現在のコードを全て読む。既存構成を把握する。**
2. 既存コンテンツの**最下部**に以下を追加:

```
（既存: 投票完了メッセージ）
（既存: リワード開示）
（既存: アカウント作成促進）

─── 区切り線 ─── ← NEW

<RelatedPros              ← NEW
  currentProId={proId}
  prefecture={prefecture}
  title="{prefecture}で活躍するプロ"
/>

─── 区切り線 ─── ← NEW

┌─ 紹介リンク ─────────────────────┐ ← NEW
│ あなたの周りに、                          │
│ もっと知られるべきプロはいませんか？      │
│                                          │
│ [REALPROOFを紹介する →]                  │
└──────────────────────────────────┘
```

### 紹介リンクの動作
```tsx
const handleShare = async () => {
  if (navigator.share) {
    await navigator.share({
      title: 'REALPROOF - 強みがあなたを定義する',
      text: 'あなたの強みを証明するプラットフォーム',
      url: 'https://realproof.jp',
    });
  } else {
    await navigator.clipboard.writeText('https://realproof.jp');
    // トースト: 「リンクをコピーしました」
  }
};
```

**ボタン: text-[#C4A35A], border-[#C4A35A]**

### データの受け渡し
vote-confirmedはURLパラメータでプロ情報を受け取っている。
`prefecture` が渡されていなければ、投票処理のリダイレクト箇所に追加する必要あり。

```
/vote-confirmed?pro_id={id}&prefecture={prefecture}&reward_id={id}
```

コミット: `feat: add RelatedPros + referral link to vote-confirmed`

---

## タスク11: card/[id]に回遊導線追加

### ファイル: `src/app/card/[id]/page.tsx`

**⚠️ 既存のUIは一切変更しない。追加だけ。** （タスク5で作り直した後に追加）

### 手順
1. ページ最下部（CTAの下、フッターの直前）に区切り線 + RelatedPros を追加:

```tsx
{pro.prefecture && (
  <>
    <div style={{ height: 1, background: '#E8E4DC', margin: '24px 0' }} />
    <RelatedPros
      currentProId={pro.id}
      prefecture={pro.prefecture}
      title={`${pro.prefecture}の他のプロ`}
    />
  </>
)}
```

- `prefecture` が未設定(null or '')の場合はセクション非表示

コミット: `feat: add RelatedPros to pro card page`

---

## タスク12: 検索ページに都道府県フィルター追加

### ファイル: `src/app/search/page.tsx`

**⚠️ 既存のUIは一切変更しない。追加だけ。**

### 手順
1. **まず現在のコードを全て読む。既存構成を把握する。**
2. 以下を追加:

### 12.1 都道府県リスト共通化

`src/lib/prefectures.ts`（新規作成）:
```tsx
export const PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県',
  '岐阜県','静岡県','愛知県','三重県',
  '滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県',
  '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
];
```

**既存の `dashboard/page.tsx` で同様のリストがあれば、そちらもこのファイルからimportに変更。**

### 12.2 検索バーの下に都道府県チップフィルター

```
検索バー（既存）
┌─ 横スクロール チップ ───────────────────┐
│ [すべて] [北海道] [青森県] [岩手県] ... [沖縄県]  │
└──────────────────────────────────────┘
プロ一覧（既存、フィルター適用）
```

- 選択中: bg-[#1A1A2E] text-white
- 未選択: bg-white text-gray-600 border border-gray-200
- デフォルト: 「すべて」
- 選択時: 既存のプロ一覧を都道府県でクライアントサイドフィルター

### 12.3 各プロのトッププルーフ表示

プロ一覧の各行に、トッププルーフ上位2件のチップを追加:

```
田中 太郎
痛み改善の専門家
東京都 · 渋谷
[痛みを取る技術がある 14] [根本原因にアプローチ 11]  ← NEW
```

- vote_summaryビューから取得
- チップ: bg-[#C4A35A]10, text-[#C4A35A], fontSize:11, rounded
- 0件のプロはチップなし

コミット: `feat: add prefecture filter + top proofs to search page`

---

## タスク13: フッターにロゴ反映

### 対象ファイル
- `src/app/page.tsx`（トップページ）
- `src/app/search/page.tsx`
- `src/app/voice/[hash]/page.tsx`（タスク8で対応済み）
- `src/app/card/[id]/page.tsx`（タスク5で対応済み）

各ページのフッター「REALPROOF」テキストを `<Logo size={0.6} dark={false} showTagline={false} />` に置換。

コミット: `feat: apply Seal Mark logo to all page footers`

---

# ═══════════════════════════════════
# 補足情報
# ═══════════════════════════════════

## 絶対に変更しないファイル

- `src/app/login/page.tsx` — 認証フロー
- `src/app/vote/[id]/page.tsx` — 投票画面（C1で別途改修予定）
- `src/lib/supabase.ts` — Supabaseクライアント
- `supabase/migrations/*` — 既存マイグレーション

## Voices機能の制限ルール（既存流用）

| ルール | 内容 |
|--------|------|
| 1プロにつき1回（永久） | UNIQUE(professional_id, client_email) |
| 30分クールダウン | 投票後30分間は次の投票不可 |
| セルフ投票ブロック | プロは自分に投票できない |
| QRアクセス制限 | QRコード経由のみ |

**「1日3プロまで制限」はPhase 2で実装。MVPでは入れない。**

## テスト手順（全タスク完了後）

### ロゴ:
- [ ] Navbarにシールマークロゴが表示
- [ ] ダーク/ライト両方で正しい色

### プロカード:
- [ ] `/card/{id}` でクリーム背景の新デザイン表示
- [ ] 3タブ切替（強み / 認定・資格 / Voices）動作
- [ ] バーチャートアニメーション
- [ ] パーソナリティリング表示
- [ ] Voicesにコメント表示

### Voices:
- [ ] ダッシュボードにVoicesタブあり
- [ ] 感謝フレーズ選択動作
- [ ] 「この声にお礼する」でシェアモーダル表示
- [ ] Card B（Warm/クリーム背景）が正しく表示
- [ ] 画像保存でPNGダウンロード
- [ ] `/voice/{hash}` で公開ページ表示

### 回遊導線:
- [ ] vote-confirmed最下部にRelatedPros表示
- [ ] vote-confirmed最下部に紹介リンク表示
- [ ] card/[id]最下部にRelatedPros表示
- [ ] search に都道府県チップフィルター表示
- [ ] search のプロ一覧にトッププルーフチップ表示
- [ ] 各カードクリックで正しいプロページに遷移

## 完了後のコミット一覧（予定）

```
feat: add design tokens + centralize font loading
feat: add Logo component (Seal Mark B)
feat: apply Seal Mark logo to Navbar
feat: redesign pro card page with new UI
feat: add Voices tab to dashboard
feat: add VoiceShareCard component with image export
feat: add Voice URL page (/voice/[hash])
feat: add RelatedPros component
feat: add RelatedPros + referral link to vote-confirmed
feat: add RelatedPros to pro card page
feat: add prefecture filter + top proofs to search page
feat: apply Seal Mark logo to all page footers
```
