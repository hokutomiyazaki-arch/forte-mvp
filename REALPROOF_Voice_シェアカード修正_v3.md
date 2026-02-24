# REALPROOF Voice シェアカード修正指示書 v3

## ⚠️ 最重要ルール
- 認証コードに触れない
- `getSession()` を使う（`getUser()` は使わない）
- `.maybeSingle()` を使う（`.single()` は使わない）
- 変更前にまず計画を見せて。コードはまだ書かないで。

---

## 修正一覧（7つ）

| # | 修正内容 |
|---|---------|
| 1 | フォントを全て Open Sans に変更。REALPROOF は太字 |
| 2 | カード上部に「THANK YOU クライアントからの嬉しいコメント!!」を大きく追加 |
| 3 | カード背景色をユーザーが選べるように（カラーピッカー） |
| 4 | Instagram共有時にカードの外側の縁が映る問題を修正 |
| 5 | カード下に「このコメントをシェアする」ボタンを分かりやすく配置 |
| 6 | プロ写真+名前をカード内に統合（ミニプロフカード廃止） |
| 7 | 「お礼する」はダッシュボードのみ。公開カードは閲覧専用 |

---

## 修正1: フォント変更

### layout.tsx に Google Fonts 追加
```tsx
// <head> に追加
<link
  href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap"
  rel="stylesheet"
/>
```

### 全テキストのフォント
```tsx
// Voice カード内の全テキスト
fontFamily: "'Open Sans', sans-serif"
```

### REALPROOF ロゴ部分
```tsx
<div style={{ fontFamily: "'Open Sans', sans-serif" }}>
  <span style={{ fontWeight: 400, letterSpacing: '2px', color: '#1A1A2E', fontSize: 13 }}>
    REAL
  </span>
  <span style={{ fontWeight: 800, letterSpacing: '2px', color: '#1A1A2E', fontSize: 13 }}>
    PROOF
  </span>
</div>
```

---

## 修正2: ヘッダーテキスト追加

カードの**一番上**に、はっきりと:

```tsx
// カード内の最上部（クォーテーションマークの上）
<div style={{
  fontFamily: "'Open Sans', sans-serif",
  textAlign: 'center',
  marginBottom: 20,
}}>
  <div style={{
    fontSize: 22,
    fontWeight: 800,
    color: '#1A1A2E',
    letterSpacing: '1px',
  }}>
    THANK YOU
  </div>
  <div style={{
    fontSize: 12,
    fontWeight: 700,
    color: '#888888',
    marginTop: 4,
  }}>
    クライアントからの嬉しいコメント!!
  </div>
</div>
```

### カードレイアウト（上から順に）
```
┌──────────────────────────────┐
│                                        │
│         THANK YOU                      │  ← 大きく太字
│  クライアントからの嬉しいコメント!!     │  ← サブテキスト
│                                        │
│  " （クォーテーション）                 │
│                                        │
│  "すごい人だねー"                      │  ← コメント本文
│                                        │
│  ─── 区切り線 ───                    │
│                                        │
│  ── この声が、私の明日の力になる。      │  ← 感謝フレーズ
│                                        │
│  [写真56×56]  宮崎北斗                  │  ← プロ情報
│               パーソナルトレーナー       │
│                                        │
│  REAL PROOF                            │  ← ロゴ
│                                        │
└──────────────────────────────┘
```

---

## 修正3: カラーピッカー（背景色選択）

### 選択肢（5色）

ダッシュボードのVoicesタブで、シェアカード作成時に色を選べるUI:

```tsx
const cardColors = [
  { id: 'cream',  label: 'クリーム',  bg: 'linear-gradient(170deg, #FAF8F4 0%, #F3EFE7 100%)', border: '#E8E4DC', text: '#1A1A2E', sub: '#888888', gold: '#C4A35A' },
  { id: 'white',  label: 'ホワイト',  bg: '#FFFFFF', border: '#E8E4DC', text: '#1A1A2E', sub: '#888888', gold: '#C4A35A' },
  { id: 'dark',   label: 'ダーク',    bg: '#1A1A2E', border: '#2A2A3E', text: '#FFFFFF', sub: '#AAAAAA', gold: '#C4A35A' },
  { id: 'navy',   label: 'ネイビー',  bg: '#1B2838', border: '#2A3848', text: '#FFFFFF', sub: '#AAAAAA', gold: '#C4A35A' },
  { id: 'sage',   label: 'セージ',    bg: '#E8EDE4', border: '#D0D8CC', text: '#2D3A2D', sub: '#6B756B', gold: '#8B7B3A' },
];
```

### カラーピッカーUI（感謝フレーズの下に配置）

```tsx
// カードの色を選ぶ
<div style={{ marginTop: 16 }}>
  <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8 }}>
    カードの色
  </div>
  <div style={{ display: 'flex', gap: 10 }}>
    {cardColors.map((c) => (
      <button
        key={c.id}
        onClick={() => setSelectedColor(c.id)}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: typeof c.bg === 'string' && c.bg.startsWith('linear') ? c.bg : c.bg,
          border: selectedColor === c.id
            ? '3px solid #C4A35A'
            : '2px solid #E8E4DC',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      />
    ))}
  </div>
</div>
```

### カードに色を適用

```tsx
const colorScheme = cardColors.find(c => c.id === selectedColor) || cardColors[0];

// カード本体
<div id="voice-card-for-export" style={{
  background: colorScheme.bg,
  border: `1px solid ${colorScheme.border}`,
  borderRadius: 18,
  padding: '32px 26px',
  width: 340,
  // ... 他のスタイル
}}>
  {/* THANK YOU */}
  <div style={{ color: colorScheme.text, ... }}>THANK YOU</div>
  
  {/* コメント */}
  <div style={{ color: colorScheme.text, ... }}>"すごい人だねー"</div>
  
  {/* 感謝フレーズ */}
  <div style={{ color: colorScheme.gold, ... }}>── この声が、私の明日の力になる。</div>
  
  {/* サブテキスト */}
  <div style={{ color: colorScheme.sub, ... }}>クライアントからの嬉しいコメント!!</div>
  
  {/* プロ名 */}
  <div style={{ color: colorScheme.text, ... }}>宮崎北斗</div>
  <div style={{ color: colorScheme.gold, ... }}>パーソナルトレーナー</div>
</div>
```

---

## 修正4: Instagram共有時のカード外縁問題

### 原因
html2canvas がカードの外側（padding, margin, border）まで含めてキャプチャしている。
Instagram Stories に画像を貼り付けた時、カードの周囲に余白や黒い縁が映る。

### 解決策

**html2canvas のキャプチャ時に、カードの外側にパディングを一切入れない:**

```tsx
const handleShare = async () => {
  const el = document.getElementById('voice-card-for-export');
  if (!el) return;

  // ★ キャプチャ前にカードのスタイルを一時的に調整
  const originalStyle = el.style.cssText;
  
  // border-radius を 0 にする（画像の角に透明部分を作らない）
  // margin を 0 にする
  // box-shadow を消す
  el.style.margin = '0';
  el.style.boxShadow = 'none';

  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: null,        // 背景透明
    useCORS: true,
    // ★ カード要素のサイズぴったりでキャプチャ
    width: el.offsetWidth,
    height: el.offsetHeight,
    x: 0,
    y: 0,
    scrollX: 0,
    scrollY: 0,
    windowWidth: el.offsetWidth,
    windowHeight: el.offsetHeight,
  });

  // スタイルを元に戻す
  el.style.cssText = originalStyle;

  // ★ 角丸を画像に適用（Canvas APIで角丸マスク）
  const roundedCanvas = document.createElement('canvas');
  roundedCanvas.width = canvas.width;
  roundedCanvas.height = canvas.height;
  const ctx = roundedCanvas.getContext('2d');
  if (ctx) {
    const radius = 36; // borderRadius: 18 × scale 2
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(canvas.width - radius, 0);
    ctx.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
    ctx.lineTo(canvas.width, canvas.height - radius);
    ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height);
    ctx.lineTo(radius, canvas.height);
    ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(canvas, 0, 0);
  }

  const blob = await new Promise<Blob>((resolve) => {
    roundedCanvas.toBlob((b) => resolve(b!), 'image/png');
  });

  const file = new File([blob], 'realproof-voice.png', { type: 'image/png' });

  // Web Share API
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

  // フォールバック: ダウンロード
  const link = document.createElement('a');
  link.download = `realproof-voice-${Date.now()}.png`;
  link.href = roundedCanvas.toDataURL('image/png');
  link.click();
};
```

### プレビュー用とキャプチャ用のスタイル分離

```tsx
// プレビュー表示（画面上で見せる用）— 影あり、余白あり
<div style={{ 
  display: 'flex', 
  justifyContent: 'center', 
  padding: '20px',
}}>
  <div id="voice-card-for-export" style={{
    // ★ キャプチャ対象はこのdivだけ
    // 外側のpadding 20pxはキャプチャに含まれない
    ...cardStyle
  }}>
    {/* カード内容 */}
  </div>
</div>

// ★ 画面表示用の影はCSSクラスで付ける（style直書きではなく）
// → html2canvas はinline styleしか見ないので、CSSクラスの影は無視される
```

---

## 修正5: シェアボタンの改善

### 現状の問題
「この声にお礼する」ボタンが分かりにくい。

### 変更
カードのプレビューの**直下**に、はっきりしたシェアボタン:

```tsx
{/* カードプレビュー */}
<div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
  <div id="voice-card-for-export" style={cardStyle}>
    {/* ... カード内容 ... */}
  </div>
</div>

{/* ★ シェアボタン — カードの真下、目立つように */}
<button
  onClick={handleShare}
  style={{
    width: '100%',
    maxWidth: 340,
    margin: '0 auto',
    display: 'block',
    padding: '18px 24px',
    background: '#C4A35A',
    color: '#FFFFFF',
    fontFamily: "'Open Sans', sans-serif",
    fontWeight: 800,
    fontSize: 15,
    borderRadius: 14,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s',
    letterSpacing: '0.5px',
  }}
>
  このコメントをシェアする
</button>

{/* 閉じるボタン */}
<button
  onClick={onClose}
  style={{
    width: '100%',
    maxWidth: 340,
    margin: '12px auto 0',
    display: 'block',
    padding: '14px',
    background: 'transparent',
    color: '#888',
    fontFamily: "'Open Sans', sans-serif",
    fontWeight: 600,
    fontSize: 13,
    border: 'none',
    cursor: 'pointer',
  }}
>
  戻る
</button>
```

---

## 修正6: プロ写真+名前をカード内に統合

（前回の指示と同じ。ミニプロフカード廃止、1枚カードに統合）

```tsx
// 感謝フレーズの下に配置
<div style={{
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  marginTop: 20,
}}>
  <img
    src={pro.photo_url}
    style={{
      width: 56,
      height: 56,
      borderRadius: '50%',
      objectFit: 'cover',
      border: '2px solid rgba(0,0,0,0.08)',
    }}
  />
  <div>
    <div style={{
      fontSize: 15,
      fontWeight: 800,
      color: colorScheme.text,
      fontFamily: "'Open Sans', sans-serif",
    }}>
      {pro.name}
    </div>
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      color: colorScheme.gold,
      fontFamily: "'Open Sans', sans-serif",
      marginTop: 2,
    }}>
      {pro.title}
    </div>
  </div>
</div>
```

### 削除するもの
- `include_profile` トグル UI
- `MiniProfileCard` コンポーネント
- `showMiniCard` state

---

## 修正7: 公開カードは閲覧専用

`card/[id]/page.tsx` のVoicesタブから:
- 感謝フレーズ選択UI → **削除**
- 「この声にお礼する」ボタン → **削除**
- カード展開動作 → **削除**

残すもの:
- コメントテキスト + 日付のみ
- クリーム背景カードデザイン

---

## ダッシュボードのVoices画面の全体フロー

```
┌─ Voicesタブ ────────────────────────────┐
│                                                      │
│  [コメント付き投票カード 1]  ← タップで展開           │
│  [コメント付き投票カード 2]                            │
│  [コメント付き投票カード 3]                            │
│                                                      │
│  ↓ タップすると展開 ↓                                │
│                                                      │
│  ┌─ 展開エリア ──────────────────────┐  │
│  │                                                │  │
│  │  感謝フレーズを選ぶ（5択ラジオ）               │  │
│  │  ○ この声が、私の明日の力になる。              │  │
│  │  ○ こういう言葉が、いちばん嬉しい。            │  │
│  │  ○ 届いた声に、背中を押される。                │  │
│  │  ○ この仕事をやっていてよかった。              │  │
│  │  ○ ありがとう。これからも。                    │  │
│  │                                                │  │
│  │  カードの色（5色の丸ボタン）                    │  │
│  │  ● ● ● ● ●                                │  │
│  │                                                │  │
│  │  ┌── プレビュー ──────────────┐  │  │
│  │  │  THANK YOU                          │  │  │
│  │  │  クライアントからの嬉しいコメント!! │  │  │
│  │  │                                     │  │  │
│  │  │  "すごい人だねー"                   │  │  │
│  │  │  ── この声が、私の明日の力になる。  │  │  │
│  │  │  [写真] 宮崎北斗                    │  │  │
│  │  │  REAL PROOF                         │  │  │
│  │  └─────────────────────┘  │  │
│  │                                                │  │
│  │  [■ このコメントをシェアする]（ゴールドボタン）  │  │
│  │  [戻る]                                        │  │
│  │                                                │  │
│  └────────────────────────────┘  │
│                                                      │
└──────────────────────────────────┘
```

---

## 実装順序

```
Step 1: VoiceShareCard.tsx を全面修正
  - Open Sans フォント読み込み（layout.tsx）
  - THANK YOU ヘッダー追加
  - カラーピッカーUI追加（5色）
  - プロ写真+名前統合
  - html2canvas の縁問題修正
  - 「このコメントをシェアする」ボタン
  - Web Share API
  - ミニプロフカード関連を削除
  → npm run build → コミット

Step 2: card/[id]/page.tsx のVoicesタブ修正
  - 閲覧専用に変更（フレーズ選択・シェアボタン削除）
  - クリーム背景統一
  → npm run build → コミット

Step 3: dashboard/page.tsx のVoicesタブ修正
  - ダーク背景 → クリーム背景
  - 展開UIのスタイル調整
  → npm run build → コミット
```

**コミットメッセージ:**
```
fix: redesign Voice share card - Open Sans, color picker, THANK YOU header, direct share
fix: Voice tab on public card - view only mode
fix: Voice tab on dashboard - cream background
```
