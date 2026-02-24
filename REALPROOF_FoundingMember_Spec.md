# REALPROOF Founding Member 自動計測・自動付与 実装仕様書
## Claude Code向け | 2025.02.20

---

## 1. 概要

Founding Member（以下FM）は条件達成時に**自動付与**される。手動承認なし。

---

## 2. FM獲得条件

| 条件 | 値 |
|------|-----|
| 投票数 | 5票以上 |
| 期限 | プロ登録日から30日以内 |
| 上限 | 動的枠（下記参照） |

**30日の起算日 = `pros.created_at`（プロ登録日時）**

---

## 3. 動的枠（キャップ）の設計

FMは「売り切れ → 少しだけ追加」を繰り返すことで緊急性を維持する。

| 段階 | FM枠の合計 | 増加数 | トリガー |
|------|-----------|--------|----------|
| 初期 | 50 | — | ローンチ時 |
| 第1拡張 | 80 | +30 | 50枠が埋まった時点 |
| 第2拡張 | 90 | +10 | 80枠が埋まった時点 |
| 第3拡張 | 100 | +10 | 90枠が埋まった時点 |
| 以降 | 凍結 | — | 100で打ち止め。追加はCEO判断 |

**「埋まった」= FM条件を達成した人数がキャップに到達した状態。**

---

## 4. DB設計

### 4.1 `pros` テーブルに追加するカラム

```sql
ALTER TABLE pros ADD COLUMN founding_member_status TEXT DEFAULT 'none';
-- 'none'       = FM未達成
-- 'eligible'   = 期限内（まだ30日以内）
-- 'achieved'   = FM獲得済み
-- 'expired'    = 30日経過で未達成

ALTER TABLE pros ADD COLUMN founding_member_achieved_at TIMESTAMPTZ DEFAULT NULL;
-- FM達成日時。バッジ表示の根拠。
```

### 4.2 `founding_member_config` テーブル（新規）

```sql
CREATE TABLE founding_member_config (
  id SERIAL PRIMARY KEY,
  cap_tier INTEGER NOT NULL,        -- 段階番号（1=初期, 2=第1拡張...）
  total_cap INTEGER NOT NULL,       -- その段階のFM枠合計
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 初期データ
INSERT INTO founding_member_config (cap_tier, total_cap)
VALUES (1, 50);
```

---

## 5. 自動付与ロジック

### 5.1 トリガー：投票が作成されるたびに実行

```
ON INSERT INTO votes → check_founding_member(pro_id)
```

### 5.2 `check_founding_member(pro_id)` の処理フロー

```
1. pro = SELECT * FROM pros WHERE id = pro_id

2. IF pro.founding_member_status = 'achieved' → return（済み）
   IF pro.founding_member_status = 'expired'  → return（期限切れ）

3. 経過日数 = NOW() - pro.created_at
   IF 経過日数 > 30日 →
     UPDATE pros SET founding_member_status = 'expired' WHERE id = pro_id
     return

4. vote_count = SELECT COUNT(*) FROM votes WHERE pro_id = pro_id

5. IF vote_count < 5 → return（未達）

6. -- 5票以上 & 30日以内 → 枠チェック
   current_cap = SELECT total_cap FROM founding_member_config
                 ORDER BY cap_tier DESC LIMIT 1

   current_fm_count = SELECT COUNT(*) FROM pros
                      WHERE founding_member_status = 'achieved'

7. IF current_fm_count >= current_cap →
     -- 枠がいっぱい。拡張チェック
     check_and_expand_cap(current_cap, current_fm_count)
     -- 再取得
     current_cap = SELECT total_cap FROM founding_member_config
                   ORDER BY cap_tier DESC LIMIT 1
     IF current_fm_count >= current_cap → return（枠なし。100到達で凍結）

8. -- 枠あり → FM付与
   UPDATE pros SET
     founding_member_status = 'achieved',
     founding_member_achieved_at = NOW()
   WHERE id = pro_id
```

### 5.3 `check_and_expand_cap(current_cap, current_count)` の処理

```
expansion_rules = {
  50: 30,   -- 50 → 80
  80: 10,   -- 80 → 90
  90: 10,   -- 90 → 100
}

IF current_cap IN expansion_rules AND current_count >= current_cap →
  new_cap = current_cap + expansion_rules[current_cap]
  new_tier = (SELECT MAX(cap_tier) FROM founding_member_config) + 1
  INSERT INTO founding_member_config (cap_tier, total_cap)
  VALUES (new_tier, new_cap)

-- 100以降は拡張しない（CEO判断で手動INSERT）
```

---

## 6. 期限切れ処理

### 日次バッチ（Supabase cron or Edge Function）

```sql
UPDATE pros
SET founding_member_status = 'expired'
WHERE founding_member_status = 'none'
  AND created_at < NOW() - INTERVAL '30 days';
```

毎日0:00 JST実行。期限切れのプロは以降FM対象外。

**注意**: `eligible` → `expired` の変更は不可逆。一度expiredになったら復活しない。

---

## 7. 「残り○名」の表示ロジック

### トップページ / プロ登録ページに表示

```
current_cap = SELECT total_cap FROM founding_member_config
              ORDER BY cap_tier DESC LIMIT 1

achieved_count = SELECT COUNT(*) FROM pros
                 WHERE founding_member_status = 'achieved'

remaining = current_cap - achieved_count

表示: 「残り{remaining}名」
```

### 表示ルール

| 状態 | 表示 |
|------|------|
| remaining > 10 | 「残り○名」 |
| remaining 1〜10 | 「残りわずか○名」（ゴールド色で強調） |
| remaining = 0 & cap < 100 | 「満席 — 追加枠を準備中」（数秒〜数分後に拡張が走る） |
| remaining = 0 & cap = 100 | 「Founding Memberの募集は終了しました」 |

**リアルタイム更新は不要。** ページロード時に取得すれば十分。

---

## 8. FMバッジ表示

### 8.1 プロカード・プロフィールページ

```
IF pro.founding_member_status = 'achieved' →
  バッジ表示: 「Founding Member」
  色: ゴールド（#C4A35A）
  位置: プロ名の横 or プロカード上部
  永久表示（削除不可）
```

### 8.2 バッジのデザイン仕様

```
テキスト: "FOUNDING MEMBER"
フォント: DM Sans Bold, 10px, letter-spacing: 2px, uppercase
背景: rgba(196,163,90,0.12)
テキスト色: #C4A35A
border: 1px solid rgba(196,163,90,0.3)
border-radius: 4px
padding: 4px 10px
```

---

## 9. プロのダッシュボード表示

### FM未達成（期限内）の場合

```
┌─────────────────────────────────────┐
│  Founding Member チャレンジ         │
│                                     │
│  🎯 あと○票（残り○日）              │
│  ████████░░ 3/5票                   │
│                                     │
│  30日以内に5票集めると              │
│  Founding Memberバッジを獲得！       │
└─────────────────────────────────────┘
```

### FM達成済みの場合

```
┌─────────────────────────────────────┐
│  ✦ Founding Member                  │
│  達成日: 2026.03.15                 │
└─────────────────────────────────────┘
```

### FM期限切れの場合

表示なし（過去の失敗を見せない）。

---

## 10. エッジケース

| ケース | 処理 |
|--------|------|
| 5票目の投票時に枠が0 → 拡張で枠が空く | 同一トランザクション内で拡張→付与。ユーザーは気づかない |
| 5票目の投票時に枠が0 → 100上限で拡張なし | FM付与しない。「Founding Memberの募集は終了しました」 |
| 同時に2人が5票目を達成して枠が残り1 | 先にINSERTされた方が獲得（楽観的ロック）。もう1人は拡張待ち |
| プロがアカウント削除 | FM枠は返却しない（achieved_countは減る→新枠が空く） |
| 投票が取り消された（不正検出等） | vote_count再計算。4票以下になったらstatus変更しない（一度achievedは不可逆） |

---

## 11. Supabase実装メモ

- `check_founding_member` は **Supabase Database Function（PL/pgSQL）** で実装
- votes テーブルの INSERT トリガーで自動実行
- `check_and_expand_cap` も同じFunction内で完結
- 日次バッチは **Supabase pg_cron** or **Edge Function + cron** で実装
- `founding_member_config` は管理画面からも手動INSERT可能にしておく（CEO判断での追加枠用）

---

*Version: 1.0 | Created: 2025.02.20 | Owner: 宮崎ほくと*
