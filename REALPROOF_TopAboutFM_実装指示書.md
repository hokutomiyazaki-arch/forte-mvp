# REALPROOF トップページ + About + Founding Member 実装指示書

## ⚠️ 最重要ルール
- 認証コードに触れない
- `getSession()` を使う（`getUser()` は使わない）
- `.maybeSingle()` を使う（`.single()` は使わない）
- 変更前にまず計画を見せて。コードはまだ書かないで。
- 1タスク = 1コミット
- 各タスク後に `npm run build` で確認
- **コピー（文言）は確定済み。1文字も変えるな。**

---

## 全体像（5タスク）

| # | タスク | ファイル | 重さ |
|---|--------|---------|------|
| 1 | トップページ実装 | `src/app/page.tsx`（既存を置き換え） | ★★★ |
| 2 | Aboutページ実装 | `src/app/about/page.tsx`（新規） | ★★ |
| 3 | Founding Member DB設計 | SQL（手動実行） | ★ |
| 4 | Founding Member 自動付与ロジック | SQL Function + Trigger（手動実行） | ★★ |
| 5 | Founding Member UI表示 | `page.tsx`, `card/[id]`, `dashboard` | ★★ |

---

## 前提: 先にやるべき修正

**この指示書の前に、別途渡す「修正指示書v2」を先に完了させること。**
（ロゴ戻し、フォント太字化、ダッシュボードタブ整理、Voiceカード修正）

修正が終わってからこの指示書に取りかかる。

---

# ═══════════════════════════════════
# タスク1: トップページ
# ═══════════════════════════════════

## 参照ファイル
- `REALPROOF_top_v2.html` — 見た目の完全再現元
- `REALPROOF_TopPage_Implementation.md` — コピー確定版 + デザイン仕様

## 実装方法
1. まず `REALPROOF_top_v2.html` をブラウザで開いて見た目を確認
2. 既存の `src/app/page.tsx` を**全て置き換え**（バックアップ不要、gitで戻せる）
3. Next.js App Router + Tailwind CSS で実装
4. コピーは `REALPROOF_TopPage_Implementation.md` の確定コピーに完全一致させる

## デザイン仕様（抜粋）

### カラー
```
--dark: #1A1A2E        /* ナビ背景のみ */
--gold: #C4A35A        /* アクセント */
--cream: #FAFAF7       /* メイン背景 */
--white: #FFFFFF        /* カード背景 */
--text-dark: #1A1A2E
--text-body: #444444
--text-muted: #888888
--border-light: #E8E4DC
```

**ページ背景はクリーム（#FAFAF7）。黒背景セクションはなし。**

### セクション構成（7つ + フッター）

```
1. HERO（100vh, fadeUpアニメーション）
   - ロゴ: REAL PROOF（テキスト）
   - タグライン: 本物が輝く社会へ。
   - 見出し: あなたの強みを一番知っているのは、あなたのクライアントだ。
     （「あなたのクライアントだ。」をゴールド色に）
   - 葛藤 → 解決 → CTA「強みを証明する →」
   - CTA先: /login?role=pro

2. HOW IT WORKS（3カラム）
   - Step 1: 強みを集める
   - Step 2: 強みで選ぶ
   - Step 3: 強みを育てる

3. 比較テーブル
   - ホットペッパー vs Google vs REAL PROOF
   - REAL PROOF列: 背景 rgba(196,163,90,0.08) + 太字

4. 3本柱（3カード、hover効果あり）
   - 蓄積 / 多次元 / 信頼性

5. VOICES（プロの悩み + 投票UIモック）
   - Part A: 3つの悩みカード
   - Part C: 投票UIプレースホルダー

6. FOUNDER'S NOTE（2カラム）
   - 左: 写真プレースホルダー
   - 右: テキスト + 「ストーリーを読む →」→ /about

7. FOUNDING MEMBER + CTA
   - 上段: 全員向けCTA
   - 下段: FM特別枠（ゴールドborder）
   - 「残り○名」は動的表示（タスク5で実装）
   - 一旦プレースホルダーで「残り50名」固定でOK

FOOTER:
   - 特定商取引法に基づく表記
   - © 2026 REAL PROOF ｜ 株式会社Legrand chariot
```

### インタラクション
| 要素 | 挙動 |
|------|------|
| ヒーロー | fadeUp順次（0.15s遅延） |
| 各セクション | IntersectionObserver でスクロール時fadeUp（threshold: 0.12） |
| 3本柱カード | hover: border gold + shadow + translateY(-3px) |
| ボタン | hover: translateY(-1px) + shadow |
| ナビ | position: fixed, bg: #1A1A2E |

### レスポンシブ
| > 768px | 3カラム横並び |
| ≤ 768px | カード縦積み |

### コピー確定箇所（一部抜粋 — 全文はImplementation.mdを参照）

**HERO見出し:**
```
あなたの強みを一番知っているのは、
あなたのクライアントだ。
```

**HERO葛藤:**
```
なのに、選ばれる基準は★の数、フォロワー数、広告費。
どれも、あなたの本当の強みを映していない。
```

**HERO解決:**
```
REAL PROOFは、実際にあなたのセッションを受けたクライアントだけが
「何が強いか」を投票で証明するプラットフォーム。
```

**⚠️ コピーは1文字も変えるな。Implementation.mdが正。**

### コミット
```
feat: implement new top page
```

---

# ═══════════════════════════════════
# タスク2: Aboutページ
# ═══════════════════════════════════

## 参照ファイル
- `REALPROOF_about.html` — 見た目の完全再現元
- `REALPROOF_AboutPage_CopyLog.md` — コピー確定版

## 実装方法
1. `src/app/about/page.tsx` を新規作成
2. `REALPROOF_about.html` のデザインを忠実に再現
3. コピーは `REALPROOF_AboutPage_CopyLog.md` に完全一致

## デザイン仕様
- 1カラム、max-width: 680px、センター配置
- 背景: #FAFAF7（クリーム）
- 本文: Noto Sans JP, 15px, line-height: 2.2, color: #444
- 太字テキスト: fontWeight: 700, color: #1A1A2E
- ゴールドテキスト: fontWeight: 700, color: #C4A35A
- 区切り線: width: 48px, height: 1px, bg: #E8E4DC, margin: 48px 0
- blockquote: border-left: 2px solid #C4A35A, padding-left: 20px

## ページ構成
```
ナビ（既存のNavbarコンポーネントを使用）

[ラベル] Founder's Story（DM Sans, 11px, uppercase, gold, ls: 4px）
[タイトル] マーケティングで選ばれる時代は、もう終わりにしたい。
[サブ] REAL PROOF 創業者 宮崎ほくと

本文（CopyLog.mdの全文をそのまま実装）
  - 【太字】指定行 → fontWeight: 700, color: #1A1A2E
  - 【ゴールド】指定行 → fontWeight: 700, color: #C4A35A
  - 「---」 → 48px幅の区切り線

署名ブロック（センター）
  - 丸写真プレースホルダー（100×100）
  - 宮崎 ほくと
  - 株式会社Legrand chariot 代表取締役 / REAL PROOF 創業者 / 元JRA騎手

CTA
  - 「あなたの強みを、クライアントの声で証明する。最初の1票から始まる。」
  - [強みを証明する →] → /login?role=pro

フッター
  - ← トップページに戻る（/へのリンク）
  - © 2026 REAL PROOF ｜ 株式会社Legrand chariot
```

### コミット
```
feat: implement about page (founder's story)
```

---

# ═══════════════════════════════════
# タスク3: Founding Member DB設計
# ═══════════════════════════════════

## Supabase SQL Editorで手動実行

```sql
-- ============================================
-- Founding Member 用カラム追加
-- ============================================

-- professionals テーブルにFM関連カラムを追加
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS founding_member_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS founding_member_achieved_at TIMESTAMPTZ DEFAULT NULL;

-- status の値: 'none' / 'eligible' / 'achieved' / 'expired'

COMMENT ON COLUMN professionals.founding_member_status IS
  'none=未達成, eligible=期限内, achieved=FM獲得, expired=30日経過で未達成';

-- ============================================
-- FM枠管理テーブル（新規）
-- ============================================

CREATE TABLE IF NOT EXISTS founding_member_config (
  id SERIAL PRIMARY KEY,
  cap_tier INTEGER NOT NULL,
  total_cap INTEGER NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 初期データ: 50名枠
INSERT INTO founding_member_config (cap_tier, total_cap)
VALUES (1, 50)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE founding_member_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fm_config_select" ON founding_member_config
  FOR SELECT USING (true);

-- ============================================
-- 新規プロ登録時に eligible にする
-- ============================================
-- 既存のプロで30日以内の人を eligible に
UPDATE professionals
SET founding_member_status = 'eligible'
WHERE founding_member_status = 'none'
  AND created_at > NOW() - INTERVAL '30 days';

-- 既存のプロで30日超えの人を expired に
UPDATE professionals
SET founding_member_status = 'expired'
WHERE founding_member_status = 'none'
  AND created_at <= NOW() - INTERVAL '30 days';
```

**⚠️ このSQLはClaude Codeではなく、CEOが手動でSupabase SQL Editorで実行する。**

### コミット
なし（DB手動実行のため）

---

# ═══════════════════════════════════
# タスク4: Founding Member 自動付与ロジック
# ═══════════════════════════════════

## Supabase SQL Editorで手動実行

```sql
-- ============================================
-- FM自動付与 Function
-- ============================================

CREATE OR REPLACE FUNCTION check_founding_member(target_pro_id UUID)
RETURNS void AS $$
DECLARE
  pro_record RECORD;
  vote_count INTEGER;
  current_cap INTEGER;
  current_fm_count INTEGER;
  days_elapsed DOUBLE PRECISION;
BEGIN
  -- 1. プロ情報取得
  SELECT * INTO pro_record
  FROM professionals
  WHERE id = target_pro_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- 2. 既にachieved or expired → 何もしない
  IF pro_record.founding_member_status IN ('achieved', 'expired') THEN
    RETURN;
  END IF;

  -- 3. 30日経過チェック
  days_elapsed := EXTRACT(EPOCH FROM (NOW() - pro_record.created_at)) / 86400;
  IF days_elapsed > 30 THEN
    UPDATE professionals
    SET founding_member_status = 'expired'
    WHERE id = target_pro_id;
    RETURN;
  END IF;

  -- 4. 投票数カウント
  SELECT COUNT(*) INTO vote_count
  FROM votes
  WHERE professional_id = target_pro_id;

  IF vote_count < 5 THEN RETURN; END IF;

  -- 5. 現在のFM枠取得
  SELECT total_cap INTO current_cap
  FROM founding_member_config
  ORDER BY cap_tier DESC
  LIMIT 1;

  SELECT COUNT(*) INTO current_fm_count
  FROM professionals
  WHERE founding_member_status = 'achieved';

  -- 6. 枠チェック → 拡張
  IF current_fm_count >= current_cap THEN
    -- 拡張ルール: 50→80, 80→90, 90→100
    IF current_cap = 50 THEN
      INSERT INTO founding_member_config (cap_tier, total_cap)
      VALUES ((SELECT MAX(cap_tier) FROM founding_member_config) + 1, 80);
      current_cap := 80;
    ELSIF current_cap = 80 THEN
      INSERT INTO founding_member_config (cap_tier, total_cap)
      VALUES ((SELECT MAX(cap_tier) FROM founding_member_config) + 1, 90);
      current_cap := 90;
    ELSIF current_cap = 90 THEN
      INSERT INTO founding_member_config (cap_tier, total_cap)
      VALUES ((SELECT MAX(cap_tier) FROM founding_member_config) + 1, 100);
      current_cap := 100;
    END IF;

    -- 再チェック（100上限で枠なし）
    IF current_fm_count >= current_cap THEN RETURN; END IF;
  END IF;

  -- 7. FM付与！
  UPDATE professionals
  SET founding_member_status = 'achieved',
      founding_member_achieved_at = NOW()
  WHERE id = target_pro_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 投票INSERT時の自動トリガー
-- ============================================

CREATE OR REPLACE FUNCTION trigger_check_founding_member()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM check_founding_member(NEW.professional_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_founding_member ON votes;

CREATE TRIGGER trg_check_founding_member
  AFTER INSERT ON votes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_founding_member();

-- ============================================
-- 日次バッチ: 期限切れ処理
-- ============================================
-- pg_cronが有効なら:
-- SELECT cron.schedule('expire-founding-members', '0 15 * * *',
--   $$UPDATE professionals SET founding_member_status = 'expired'
--     WHERE founding_member_status IN ('none','eligible')
--     AND created_at < NOW() - INTERVAL '30 days'$$
-- );
--
-- pg_cronが使えない場合は、毎日手動で以下を実行:
-- UPDATE professionals SET founding_member_status = 'expired'
-- WHERE founding_member_status IN ('none','eligible')
-- AND created_at < NOW() - INTERVAL '30 days';
```

**⚠️ このSQLもCEOが手動でSupabase SQL Editorで実行する。**

### コミット
なし（DB手動実行のため）

---

# ═══════════════════════════════════
# タスク5: Founding Member UI表示
# ═══════════════════════════════════

## 5.1 トップページの「残り○名」表示

`src/app/page.tsx` のSection 7（Founding Member枠）:

```tsx
// データ取得
const { data: fmConfig } = await supabase
  .from('founding_member_config')
  .select('total_cap')
  .order('cap_tier', { ascending: false })
  .limit(1)
  .maybeSingle();

const { count: achievedCount } = await supabase
  .from('professionals')
  .select('*', { count: 'exact', head: true })
  .eq('founding_member_status', 'achieved');

const totalCap = fmConfig?.total_cap || 50;
const remaining = totalCap - (achievedCount || 0);
```

表示ルール:
```tsx
{remaining > 10 && <span>残り{remaining}名</span>}
{remaining >= 1 && remaining <= 10 && (
  <span style={{ color: '#C4A35A', fontWeight: 800 }}>
    残りわずか{remaining}名
  </span>
)}
{remaining <= 0 && totalCap < 100 && (
  <span>満席 — 追加枠を準備中</span>
)}
{remaining <= 0 && totalCap >= 100 && (
  <span>Founding Memberの募集は終了しました</span>
)}
```

## 5.2 プロカードのFMバッジ

`src/app/card/[id]/page.tsx` のヘッダーカード内:

```tsx
{pro.founding_member_status === 'achieved' && (
  <span style={{
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '2px',
    textTransform: 'uppercase',
    color: '#C4A35A',
    background: 'rgba(196,163,90,0.12)',
    border: '1px solid rgba(196,163,90,0.3)',
    borderRadius: 4,
    padding: '4px 10px',
  }}>
    FOUNDING MEMBER
  </span>
)}
```

位置: プロ名の上 or 横

## 5.3 ダッシュボードのFMチャレンジ表示

`src/app/dashboard/page.tsx`:

### FM未達成（期限内）の場合
```tsx
{pro.founding_member_status !== 'achieved' &&
 pro.founding_member_status !== 'expired' && (
  <div style={{
    background: '#FFFFFF',
    border: '1px solid #E8E4DC',
    borderRadius: 14,
    padding: '20px',
    marginBottom: 20,
  }}>
    <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1A2E', marginBottom: 12 }}>
      Founding Member チャレンジ
    </div>
    <div style={{ fontSize: 13, color: '#444', marginBottom: 8 }}>
      あと{5 - voteCount}票（残り{daysLeft}日）
    </div>
    {/* プログレスバー */}
    <div style={{ height: 8, background: '#F0EDE6', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(100, (voteCount / 5) * 100)}%`,
        height: '100%',
        background: '#C4A35A',
        borderRadius: 4,
        transition: 'width 0.8s ease',
      }} />
    </div>
    <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
      30日以内に5票集めるとFounding Memberバッジを獲得！
    </div>
  </div>
)}
```

### FM達成済みの場合
```tsx
{pro.founding_member_status === 'achieved' && (
  <div style={{
    background: 'rgba(196,163,90,0.08)',
    border: '1px solid rgba(196,163,90,0.3)',
    borderRadius: 14,
    padding: '16px 20px',
    marginBottom: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  }}>
    <span style={{ fontSize: 18 }}>✦</span>
    <div>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#C4A35A' }}>
        Founding Member
      </div>
      <div style={{ fontSize: 11, color: '#888' }}>
        達成日: {formatDate(pro.founding_member_achieved_at)}
      </div>
    </div>
  </div>
)}
```

### FM期限切れの場合
→ **何も表示しない**

### 投票数と残り日数の計算
```tsx
// 投票数
const { count: voteCount } = await supabase
  .from('votes')
  .select('*', { count: 'exact', head: true })
  .eq('professional_id', proId);

// 残り日数
const createdAt = new Date(pro.created_at);
const now = new Date();
const daysSinceCreation = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
const daysLeft = Math.max(0, 30 - daysSinceCreation);
```

### コミット
```
feat: add Founding Member UI - remaining count, badge, dashboard challenge
```

---

# ═══════════════════════════════════
# 実装順序まとめ
# ═══════════════════════════════════

```
Step 1: トップページ実装（タスク1）
  → page.tsx を全面書き換え
  → FM残り枠は一旦「残り50名」固定
  → npm run build → コミット

Step 2: Aboutページ実装（タスク2）
  → about/page.tsx 新規作成
  → npm run build → コミット

Step 3: FM用SQL実行（タスク3+4）
  → CEOがSupabase SQL Editorで手動実行
  → Claude Codeには「SQL実行済み」と伝える

Step 4: FM UI表示（タスク5）
  → page.tsx のFM枠を動的表示に変更
  → card/[id] にFMバッジ追加
  → dashboard にFMチャレンジ追加
  → npm run build → コミット
```

---

## Claude Code 起動コマンド

```
この指示書と、以下のファイルを読んで:
- REALPROOF_top_v2.html（トップページの見た目）
- REALPROOF_TopPage_Implementation.md（トップページのコピー確定版）
- REALPROOF_about.html（Aboutページの見た目）
- REALPROOF_AboutPage_CopyLog.md（Aboutページのコピー確定版）

■ 前提
- タスク3+4（DB）は手動実行済み。professionals に founding_member_status カラムあり。founding_member_config テーブルあり。
- 修正指示書v2（ロゴ戻し、太字化、タブ整理、Voice修正）は完了済み。

■ 進め方
1. タスク1（トップページ）から開始。まず計画を見せて。
2. OKを出してからコードを書く。
3. コピー（文言）は確定済み。1文字も変えるな。
4. 1タスク = 1コミット。
5. 認証コードは触るな。

■ では、タスク1の計画を見せて。
```

---

## 差し替え待ち素材

- [ ] 投票UIモックのスクリーンショット（トップページ Section 5）
- [ ] 創業者写真（トップページ Section 6 + Aboutページ署名）
- [ ] 特定商取引法に基づく表記ページ（/legal）

---

## 注意事項

- トップページの既存コード（`page.tsx`）は全面置き換え。既存UIの保持は不要。
- Aboutページは完全新規。既存ファイルなし。
- Founding Memberの「残り○名」はページロード時取得。リアルタイム更新は不要。
- CTAのリンク先 `/pro/register` は既存のルーティングに合わせる（`/login?role=pro` 等）。実際のパスを確認してから設定。
