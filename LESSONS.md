# REALPROOF 開発教訓集 — 統合リファレンス

**最終更新**: 2026-04-28
**位置づけ**: CLAUDE.md「頻発バグ防止チェックリスト」の **詳細版**。
背景・コード例・過去インシデントを記載。新しい教訓を得たら**ここに追記**し、
CLAUDE.md には**チェック1行**だけ反映する。

**出典**: Project Knowledge の `REALPROOF_開発教訓集_*.docx` 全25ファイル + 完全リファレンス + 開発加速リファレンスから抽出。

---

## 目次

- [A. 認証・セッション](#a-認証セッション)
- [B. キャッシュ・SSR](#b-キャッシュssr)
- [C. State管理（React）](#c-state管理react)
- [D. DB・Supabase スキーマ落とし穴](#d-dbsupabase-スキーマ落とし穴)
- [E. 外部連携（LINE / Email / mailto）](#e-外部連携line--email--mailto)
- [F. DB破壊的操作・5段階安全プロトコル](#f-db破壊的操作5段階安全プロトコル)
- [G. 投票パス・バリデーション](#g-投票パスバリデーション)
- [H. デッドコード・コード一貫性](#h-デッドコードコード一貫性)
- [I. Git・ビルド・本番反映](#i-gitビルド本番反映)
- [J. その他の重要パターン](#j-その他の重要パターン)

---

## A. 認証・セッション

### A-1. `getSession()` を使う、`getUser()` 禁止

**何が起きたか**: Google OAuth implicit flow と `getUser()` のサーバー検証が非互換で、ログインループが発生した。

**鉄則**:
- 全ページ・全コンポーネントで `getSession()` に統一
- 認証関連コードを変更する時は、**全認証フロー**を一覧で確認

### A-2. `.maybeSingle()` を使う、`.single()` 禁止

**何が起きたか**: 新規ユーザーで `professionals` / `clients` にデータがない時、`.single()` が throw して画面が真っ白になった。

**鉄則**: クエリ結果が0件の可能性があるなら必ず `.maybeSingle()`。`.single()` は「絶対1件返るはず」の場合だけ。

### A-3. Snapshot パターン（stale state 対策）★最重要★

**何が起きたか**: 投票機能で、Google認証から戻ってきた時に `useState` の値が空になっていてコメントが消える事件が発生（2026-04-16、太田ゆりか報告）。React の非同期再レンダーが原因。

**正しいパターン**:

```typescript
const handleAuth = async () => {
  // 🔒 冒頭で全 state を const にスナップショット
  const snapshot = buildVoteData();
  if (!snapshot.requiredField) return;

  saveToSession(snapshot);  // 二重防御
  await runAuth();
  await submitData(snapshot);  // ← snapshot のみ使用
};
```

**アンチパターン**:

```typescript
const handleAuth = async () => {
  await runAuth();
  const data = buildVoteData();  // ❌ ここで空になる可能性
  await submitData(data);
};
```

**ルール**: 認証や非同期処理を含むハンドラの **冒頭** で必ず snapshot 化。

### A-4. INSERT は最終確認後に1回だけ

**何が起きたか**: 善光プロからの報告で、投票データが全カラム null で保存されていた。原因は「pending状態でINSERT → 認証完了でconfirmedに更新」の2段階方式で、認証が途中で失敗するとpendingのまま残る。

**鉄則**: DBへの書き込みは **最終確認が取れた後に1回だけ**。仮保存→更新パターンは中途半端なレコードの温床。

### A-5. Clerk 仕様の押さえどころ

- `user_id` は **TEXT 型**（UUIDではない）。professionals.user_id も TEXT
- LINE/SMS-only ユーザーは email を持たない（90人以上が `contact_email = NULL` だった）
- 自己投票チェックは `contact_email` ではなく **`user_id` ベース**で
- Clerk Production Secret は `sk_live_...`、Development の `sk_test_` と混同しない
- `import 'dotenv/config'` ではなく `dotenv.config({ path: '.env.local' })` を明示

### A-6. ログイン済みユーザーを /sign-in に送らない

**何が起きたか**: トップページのCTA「信頼を形に変える」が全ユーザーを `/sign-in` に送っていた → ログイン済みは中間ページ経由でダッシュボードへ → UX 劣化。

**鉄則**: 認証必須ページへのリンクは、`useAuth()` の `isSignedIn` で分岐。

```typescript
window.location.href = isSignedIn ? '/dashboard' : '/sign-in'
```

---

## B. キャッシュ・SSR

### B-1. Vercel キャッシュは静かに嘘をつく ★最重要★

**何が起きたか（2026-03-11）**: 団体バッジ公開ページで12名いるのに2名しか表示されない。DBもコードも正しいのに、Vercelが**古いAPIレスポンスをキャッシュ**していた。

**症状の特徴**:
- コードは正しい → コードレビューしても原因が分からない
- DBも正しい → SQL を実行しても原因が分からない
- ブラウザの Network tab を見てもレスポンス自体は 200 OK
- 「動いていたのに急に壊れた」ではなく「最初から少なかった」ように見える

**修正**:

```typescript
const supabase = createClient(url, key, {
  global: {
    fetch: (url, options = {}) =>
      fetch(url, { ...options, cache: 'no-store' })
  },
})
```

**新規 API route には必ず**:

```typescript
export const dynamic = 'force-dynamic'
```

### B-2. ハードリフレッシュ Step 0 ルール

**何が起きたか（2026-04-04）**: 太田ゆりかさんから「バッジが表示されない」報告。30分かけてDB・API調査 → 結局 **Cmd+Shift+R で解決**（ブラウザキャッシュ）。最初にやれば1分で済んだ。

**「表示されない」バグの調査順序（推奨）**:

```
Step 0: ハードリフレッシュ → 直ったらキャッシュ。終了。
Step 1: API を直接叩く → 件数が DB と違えば Vercel キャッシュ
Step 2: DB を確認 → データの有無を3パターンのキー（professional_id / user_id / organization_id）で検索
Step 3: コードを確認 → フィルタロジック確認
```

### B-3. Vercel Function Region は hnd1（東京）

**何が起きたか**: ダッシュボードが6-7秒かかっていた。Vercel の Function が **米国東海岸（iad1）** で実行されていた。Tokyo（hnd1）に変更で **3秒短縮**。

**設定**: Vercel → Project → Settings → Functions → Function Region → Tokyo (hnd1)

### B-4. LINE OGP キャッシュバスティング

LINE は OGP 画像を **強烈にキャッシュ**する。更新したら必ず `?v=2`, `?v=3` のように URL を変える。動的 OGP は Vercel でTTFフォント込みだとクラッシュするので、現状は静的 `/images/hero_ogp.png` 運用。

### B-5. Vercel デプロイ直後はブラウザキャッシュで一時エラー

開発者が検証中にデプロイ直後アクセスすると、旧JS残存で初回API呼出時に通信エラー → ハードリロードで解消。**デプロイ後の確認は最初からシークレットウィンドウ**を使うのが安全。

---

## C. State管理（React）

### C-1. `useEffect` 依存配列にオブジェクト/配列を入れない

毎レンダーで参照が変わるため、**無限ループ**の原因になる。プリミティブ値（id, count, flag等）のみ入れる。

### C-2. 配列を破壊的メソッドで触らない

**現状の潜在バグ**: `dashboard/page.tsx:3124` で `votes.sort(...)` が破壊的（state mutation）。Phase C+C-Fix のレビューで発見されたが未修正。

**正しい**: `[...votes].sort(...)` で新しい配列を作る。

### C-3. 「共通化されてない処理は必ずズレる」 ★最重要★

**何が起きたか**: 投票データ組み立てで、3つの認証フロー（Google/LINE/SMS）は `buildVoteData()` を呼んでいたが、**Email認証だけインライン独自実装**だった。`buildVoteData()` に `channel` フィールドを追加した時、Email側に追従漏れ → channel欠落バグ発生。

**鉄則**:
- 同じ目的のデータ組み立ては必ず共通関数に集約
- 「ほとんど同じだけど少し違う」実装を放置しない。**diffを見た瞬間に共通化**
- コピペで作った関数は後で必ずズレる。最初から共通化する

### C-4. `onAuthStateChange` と `useEffect` を併用しない

**何が起きたか**: ログイン後の読み込み中フリーズ。`onAuthStateChange` と `checkAndRedirect` の競合。

**修正**: `onAuthStateChange` を削除、`useEffect` だけで処理。

### C-5. クライアント実行 vs サーバー実行 の境界

Node.js専用API（`crypto`, `fs`, `path`等）はブラウザで動かない。

| パス | 実行環境 |
|---|---|
| `src/app/api/*/route.ts` | サーバー（Node.js） |
| `'use client'` 以下 | ブラウザ |
| `useState`, `useEffect`, `onClick` を使う | `'use client'` 必要 |
| Supabase admin client、`async`/`await` | Server Component（`'use client'` 禁止）|

ブラウザで暗号処理が必要なら **Web Crypto API（`crypto.subtle`）** を使う。

### C-6. 'use client' ファイルから型を export しない

レアケースだが Server/Client 境界エラーの原因になる。型は専用ファイル（`types.ts`）に分離して `import type` で取得。

---

## D. DB・Supabase スキーマ落とし穴

### D-1. 存在しないカラム・テーブルはサイレントに null を返す ★最重要★

**何が起きたか（複数回）**: 存在しないカラムを SELECT してもエラーにならず null が返る。「データが取れていない」ように見えるバグの第一容疑者。

**よくある誤推測（実態と対比）**:

| ❌ 誤った推測 | ✅ 正しいカラム名 | 説明 |
|---|---|---|
| `display_name` | `name` | プロの表示名 |
| `email` | `contact_email` | プロの連絡先 |
| `clerk_user_id` | `user_id` (TEXT) | Clerk userId |
| `profile_photo_url` | `photo_url` | プロフィール写真 |
| `selected_proofs` | `selected_proof_ids` (TEXT[]) | 投票で選択したプルーフ |
| `voted_at` | `created_at` | 投票日時 |
| `clients.name` | `clients.nickname` | 一般会員の名前 |
| `proof_items.name` | `proof_items.label` | プルーフ項目のラベル |
| `professionals.profession` | `professionals.title` | 肩書き |

**確認方法**:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'professionals'
ORDER BY ordinal_position;
```

### D-2. 存在しないテーブル

| 呼び方 | 実態 |
|---|---|
| `professional_badges` | **存在しない**。バッジは `org_members` + `credential_levels` で表現 |
| `org_badge_levels` | **存在しない**。`credential_levels` を使う |

### D-3. VIEW（INSERT/UPDATE 不可、SELECT 専用）

- `vote_summary`
- `active_ranking`
- `personality_summary`

これらに INSERT/UPDATE しようとするとエラー。

### D-4. `org_members` JOIN は必ず DISTINCT

**1プロ × 1バッジで1行**。プロ数を数える時に普通に `COUNT(*)` するとバッジ数倍になる。

```sql
-- ❌ 間違い
SELECT COUNT(*) FROM org_members WHERE organization_id = '...';

-- ✅ 正しい
SELECT COUNT(DISTINCT professional_id) FROM org_members WHERE organization_id = '...';
```

### D-5. `voter_email` ではなく `normalized_email` で検索

| | voter_email | normalized_email |
|---|---|---|
| 内容 | 入力されたまま（`John.Doe@Gmail.com`、`+819012345678`）| 正規化済み（`johndoe@gmail.com`、`+819012345678`）|
| 用途 | 表示・通知 | **検索・照合・重複チェック** |

Gmail の **ドット揺れ**（`john.doe@gmail.com` vs `johndoe@gmail.com`）に対応するため、検索は必ず `normalized_email`。

**プライバシー**: API レスポンスには `normalized_email` / `voter_email` / `voter_phone` を**絶対含めない**。

### D-6. `professionals` 全クエリに soft delete フィルタ

```typescript
.is('deactivated_at', null)
```

例外: 自分自身のデータ取得・ID指定の履歴表示・管理画面のみ。
過去 `/explore` と `RelatedPros` でフィルタ漏れ → ゴースト表示が発生。

### D-7. FK制約とJOINの罠

**何が起きたか**: Clerk移行時、`bookmarks.user_id` を UUID→TEXT に変えるため FK制約を一括削除 → 巻き添えで `professional_id` の FK も消えた → Supabase の `.select('professionals(...)')` が**サイレントにJOINが空**を返す。

**鉄則**: 大規模DB移行時は FK 削除と再作成をセットで準備。`information_schema.table_constraints` で確認。

### D-8. timestamp カラムに文字列を入れない

`confirmed_at`（TIMESTAMPTZ型）に `'expired'` を入れようとしてエラー。Supabase はこのエラーを **サイレントに返す場合がある**。`new Date().toISOString()` を使え。

### D-9. votes テーブル Phase 1 追加カラム（2026-04-22〜）

| カラム | 型 | 用途 |
|---|---|---|
| `client_photo_url` | TEXT | 認証時取得の顔写真 |
| `display_mode` | TEXT | `photo` / `nickname_only` / `pro_link` / `hidden` / NULL |
| `voter_professional_id` | UUID FK | 投票者がプロの場合の参照 |
| `auth_display_name` | TEXT | 認証時表示名 |
| `normalized_email` | TEXT | リピーター計算用、**レスポンスから除外必須** |

### D-10. qr_tokens テーブル（Set 1 追加 2026-04-28）

```sql
ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ DEFAULT NULL;
```

存在しないカラム: `channel` / `is_active` / `revoked_at`（URLパラメータとしてのみ存在）。

### D-11. reward_type 7種の実態（文書化されてない）

| reward_type | URL格納場所 | 表示形式 |
|---|---|---|
| `fnt_neuro_app` | content 列にURL | ゴールドボタン |
| `org_app` | url 列にURL + content に説明文 | ゴールドボタン |
| `freeform` | content 列に文字列 | テキスト |
| `book` | content 列に書籍情報 | テキスト |
| `secret` | content 列に隠し情報 | テキスト |
| `selfcare` | content 列に説明 | テキスト |

`url` カラムは `org_app` のみ使用。他は `content` 内にURLが含まれることが多い。

### D-12. `/api/db` プロキシは update に `eq` フィルターしか効かない

クライアント側 UPDATE で `.is()` / `.gt()` / `.lt()` / `.in()` を使うと無視される。
**短期対応**: SELECT-then-UPDATE の2段階方式
**長期対応**: X-Day 後に `/api/db` プロキシを全フィルター対応にリファクタ

---

## E. 外部連携（LINE / Email / mailto）

### E-1. LINE 内蔵ブラウザは callback 2回発火 ★田中事件由来★

**何が起きたか**: LINE 内蔵ブラウザの**既知挙動**で callback が2回発火する。
- 1回目: 正常処理（INSERT or リダイレクト）
- 2回目: code 既消費で `invalid_grant` → 別経路にフォールバック → **正しいエラーURLが上書き**される

**今回の発見（2026-04-28）**: `pro_cooldown` エラーが `line_retry` に上書きされる現象を確認。

**対策**: `invalid_grant` ハンドラ内で、フォールバック前に**正常処理側で発生しうる中断状態を再チェック**。

**長期課題**: `invalid_grant` ハンドラを **冪等性 / 中断状態リカバリの専用ハンドラ**としてリファクタ（X-Day後）。

### E-2. LINE reply vs push の使い分け

| 項目 | reply message | push message |
|---|---|---|
| トリガー | ユーザーがメッセージを送った時のみ | いつでもサーバーから送信可能 |
| 必要なもの | `replyToken`（webhook 内のみ取得可） | `line_user_id`（友達追加済みID）|
| 制約 | replyToken は1回限り、30秒以内 | 友達登録維持中のみ |

**鉄則**: 初回は reply、**2回目以降は push**。`line_user_id` は一度取得したら捨てない。

**過去の失敗（2026-03-23）**: 確認番号の再送ができなかった。`line_user_id` の検索条件を `pending`/`waiting` だけにしていたが、データは `completed`/`expired` に書き込まれていた。**ステータスフィルタは「アクティブなレコード」ではなく「必要なデータを持っているレコード」で決める**。

### E-3. mailto は個別 encodeURIComponent + & で連結

**何が起きたか**: 「このプロに相談する」ボタンが反応なし。`subject` と `body` の間に `&` が欠落 → 全パラメータが subject に結合 → URL 超長文化 → ブラウザが mailto を拒否。

```typescript
// ❌ NG
href={`mailto:${email}?subject=相談${name}body=...`}

// ✅ OK
const subject = encodeURIComponent('REAL PROOFを見て相談');
const body = encodeURIComponent(`${name} さん\n\n...`);
const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
```

**デバッグTip**:

```javascript
decodeURIComponent(
  document.querySelector('a[href^="mailto:"]')?.href.split('?')[1] || ''
)
```

### E-4. mailto は PC で動かないことがある

Mac でデフォルトメーラー未設定だと `mailto:` プロトコルが反応しない。**スマホでは標準メーラーが必ず存在するため動作する**。REALPROOF のクライアント導線は **QR → スマホブラウザ** なので問題なし。**必ずスマホで確認**。

### E-5. メール認証はリンクではなく6桁コード入力

**何が起きたか**: docomo メールに確認リンクが届かず、`status=pending` で永久停止。

**6桁コード入力方式の利点**:
- 同じページ内で完結（アプリ切替不要）
- メール通知で6桁コードが見える（アプリを開かなくてもいい）
- キャリアメールでもコード付きメールは比較的届きやすい
- 再送ボタンを自然に付けられる

### E-6. Resend は送信専用

ユーザーが返信しても受信できない。`reply-to` ヘッダに受信可能アドレス（CEO個人 Gmail等）を設定するか、メール本文に「このメールへの返信は届きません」と明記。

### E-7. Vercel Logs の External APIs セクションが最強デバッグ

外部APIへのリクエスト有無を一目で確認できる。「期待するAPIコールが出ていない」＝そのコードパスに到達していない、と即断できる。`console.log` を仕込んで再デプロイするより圧倒的に速い。

---

## F. DB破壊的操作・5段階安全プロトコル

### F-1. 5段階の手順 ★絶対遵守★

DELETE / UPDATE（広範囲）/ 大量INSERT / DROP COLUMN は**必ず**:

```
[Phase 1: 調査]
  └ 件数・分布の SELECT
  └ 影響範囲の確認

[Phase 2: バックアップ]
  └ 対象データを SELECT して別名保存（CSV等）
  └ 万一に備えて元の状態を記録

[Phase 3: プレビュー]
  └ JOIN で「現在値」と「新値」を並べて表示
  └ ✅ 安全 / ⚠️ 上書き / 🔵 変化なし に分類
  └ ⚠️ が1件でもあれば STOP、原因確認

[Phase 4: 明示承認]
  └ ユーザーが結果を見て GO 出すまで実行しない
  └ Claude側からの自動実行禁止

[Phase 5: 実行 + 検証]
  └ WHERE句で二重安全装置（例: AND contact_email IS NULL）
  └ RETURNING で件数確認
  └ 検証 SELECT で本番反映を確認
```

### F-2. 過去のインシデント

**2026-04-25 朝**: テスト投票クリーンアップ提案で、**村上さんの本物の投票**（599e6ac8、04:57 UTC LINE経由）を巻き込み削除。**PITR未契約のため復元不能**。再投票依頼で対応。

**教訓**: 「一括クリーンアップ」のような包括的な提案は**絶対禁止**。範囲を明示し、対象を SELECT で目視確認してから実行。

### F-3. Supabase SQL Editor の罠

- **`BEGIN` / `COMMIT` を分けて実行しない**: セッション境界でROLLBACKされる場合がある
  - 例: `BEGIN; UPDATE...RETURNING;` → 別クエリで `COMMIT;` → ロールバックされていた
- 単独UPDATEを実行する（PostgreSQLが自動コミット）
- WHERE句で二重安全装置:

```sql
UPDATE professionals
SET contact_email = ...
WHERE id = ...
  AND contact_email IS NULL  -- 二重安全装置
RETURNING id, name, contact_email;
```

### F-4. 復元能力の現実

- **PITR（Point-in-Time Recovery）未契約**: 5秒粒度の復元不可
- **Daily backup は前日深夜のみ**: 数時間以内の削除は復元不能
- 削除前のSELECT・バックアップが**唯一の保険**

### F-5. 本番DB変更はCEO実行を貫く

ALTER TABLE は破壊的じゃないので比較的安全だが、**本番DB変更は全て CEO 実行**を貫く。Claude Code は SQL を生成するだけ。

### F-6. 1件のサンプルで全体を結論づけない

`proof_hash NULL` 投票が1件出た時、即「Set 2 適用！」と決めかけたが、5件中3件は `pro_link` 投票で別問題だった。**より広い母集団のSQL**で本当の原因を確認してから判断。

---

## G. 投票パス・バリデーション

### G-1. 8つの投票パス全てに同じバリデーションを適用

**クライアント側 5パス**:
1. `submitHopefulVote` (vote/[id]/page.tsx)
2. `handlePhoneVerify` (vote/[id]/page.tsx)
3. `handleFallbackSubmit` (vote/[id]/page.tsx)
4. `handleSubmit` (vote/[id]/page.tsx)
5. `handleClerkVote` (vote/[id]/page.tsx)

**サーバー側 3パス**:
6. `verify-code` (api/vote-auth/verify-code)
7. LINE callback (api/vote-auth/line/callback)
8. Google callback (api/vote-auth/google/callback)

### G-2. 各パスの順序（Set 1/Set 2 後の確定版）

```
1. QRトークン検証（used_at IS NULL チェック）★Set 1 P3★
2. セルフ投票チェック
3. voter単位30分クールダウン（既存）
4. プロ単位30分クールダウン（Set 2 P2/P3）★
5. 重複投票チェック
6. 1日3プロ制限
7. votes INSERT
8. markTokenUsed*（Set 1 P5）★
```

### G-3. クールダウンは「誰が」で絞る

**何が起きたか（2026-03-27）**: 30分クールダウンが全6投票パス中**0パス**で正しく動作していなかった。

| 投票パス | 修正前の状態 | 問題 |
|---|---|---|
| `handleSubmit` | `.eq('professional_id', proId)` | プロ限定 → 別プロには通る |
| `handlePhoneVerify` | チェックなし | 完全欠落 |
| `handleFallbackSubmit` | チェックなし | 完全欠落 |
| `verify-code` API | `.eq('voter_email', email)` | 正規化されてない |
| LINE callback | `.eq('professional_id', professional_id)` | プロ限定 |
| Google callback | `.eq('professional_id', professional_id)` | プロ限定 |

**正しいクエリ**:

```typescript
// ✅ 正しい: 「この人」が30分以内にどこかで投票したか
.eq('normalized_email', normalizeEmail(identifier))
.eq('status', 'confirmed')
.gt('created_at', thirtyMinAgo)
// professional_id は含めない（全プロ横断）
```

**思考の言語化**:
- 「同一ユーザーの連続投票を防ぎたい」→ voter で絞る、時間で絞る、proは含めない
- 「同一プロへの重複投票を防ぎたい」→ voter + pro で絞る
- 「組織票を防ぎたい」→ voter + 時間で絞る

### G-4. 6層の防御スタック（田中事件後の完成形）

```
[層1] DB              qr_tokens.used_at カラム            (Set 1 P1)
[層2] 発行            TTL 1時間                            (Set 1 P2)
[層3] 入口検証        used_at IS NULL                      (Set 1 P3 + hotfix2)
[層4] プロ単位30分    同一プロへの連続投票ブロック         (Set 2)
[層5] 出口            投票成立時に used_at = NOW()         (Set 1 P5 + hotfix1)
[層6] LINE 二重発火対策  pro_cooldown 上書き防止           (LINE hotfix)
```

### G-5. 新しい error code は3点セットで

callback / API で `?error=xxx` を返すなら**必ず3つ**:

1. callback / API 側の error 出力
2. フロント側の error mapping（`vote-error-messages.ts`）
3. 表示文言定義 + 受け取り側ハンドラ（`handleXxxx`）

1つでも抜けると、サイレントに「不明エラー」or「auth_invalid」に落ちる。

### G-6. 不正検知SQLは「本当に違反してる行」だけ抽出

`HAVING COUNT(*) > 1` だけで「クールダウン破られてる」と慌てたが、実は7日経過後の合法的な再投票だった。**`WHERE days_between < 7`** などで合法ケースを除外する。

---

## H. デッドコード・コード一貫性

### H-1. デッドコード判定は3点証拠

「デッドコードかも」レベルの推測で放置すると後でハマる。判定基準:

1. **grep結果**（呼び出し元がない）
2. **UI導線**（router.push / redirect が無い）
3. **コミット履歴**（最近触られてない）

### H-2. 「ついでに直す」誘惑は別タスクに

SMS認証にハッシュチェーンが欠落していると判明したが、`proof-chain.ts` の大幅改修が必要だった。「ついでに直す」誘惑があったが、**今夜の目的（コメント消失バグ修正）を優先**し、A案（スキップ）を選択。**スキップ項目は必ずタスク化**して記録。

### H-3. 真因を捉えた修正は副次バグも同時に消す

stale state 修正の1ファイル変更で4つのバグが同時解消:
- コメント消失バグ（本命）
- selected_proof_ids 消失バグ
- Email認証の channel 欠落バグ
- 将来の `buildVoteData()` 拡張時の同期漏れ予防

**「ついでに直る」バグがあるかを修正前に意識的に探す**。

### H-4. 仮説は1つに固執せず、反証が出たら即更新

stale state 調査で仮説が3回大きく変わった:
- 仮説1: ハッシュチェーンが mutation → 無実
- 仮説2: 4フローでフィールド名コピペ漏れ → 該当なし
- 仮説3: React stale state → **真因**

**「〜のはず」という推論だけで進めず、実コードや実データで検証する**。revertや応急処置で仮説検証を飛ばさない。真因を掴めば根本解決できる。

---

## I. Git・ビルド・本番反映

### I-1. 絶対ルール

```
🚫 git push を Claude Code から行わない（GitHub Desktop で CEO 実行）
   ※ 2026-04-26 ルール変更検討中: CEO 確認後に push 可

🚫 .single() 禁止 → .maybeSingle() を使う

🚫 useEffect 依存配列にオブジェクト禁止

🚫 npm run build を Claude Code から実行しない（Vercel に任せる）

🚫 メールアドレス・電話番号を API レスポンスに含めない（リスト取り防止）

✅ 新規 API Route には export const dynamic = 'force-dynamic'

✅ Cache-Control: no-store, no-cache, must-revalidate

✅ 各 Phase 終わりで必ず STOP（CEOの承認待ち）
```

### I-2. 新規ファイルは git status で Untracked 確認

**何が起きたか**: Claude Code が `send-code/route.ts` を作成しコミットしたが、Vercel 本番では **404**。ファイルが `git add` されていなかった。`npm run build` はローカルファイルを読むので成功してしまう。

**鉄則**: 新規ファイル作成後は **必ず `git status`** で Untracked を確認。

### I-3. 1修正 = 1コミット

複数の修正を混ぜない。コミットメッセージは日本語OK（例: `fix: ログイン済みユーザーのプロ登録フロー修正`）。修正後は必ず `npm run build` で確認（Claude Code はローカルでは実行しないが、CEOがチェック）。

### I-4. 本番確認テンプレート（main マージ後 必須）

```
① Vercel デプロイ完了確認（2分）
   URL: https://vercel.com/legrandchariot/forte-mvp/deployments
   → 一番上のデプロイが「Ready」になっているか

② 機能動作確認（5分）
   → 複数の本番URLでテスト、期待表示をチェックリスト化

③ Console エラー確認（3分）
   → 各URLで Cmd+Option+J → 赤エラーないこと
   → 既知無害: SES Removing unpermitted intrinsics、apple-mobile-web-app-capable deprecated

④ プライバシー確認（2分）
   → DevTools → Network → Cmd+Shift+R
   → API レスポンスを Cmd+F:
     • voter_email → 0件
     • normalized_email → 0件
     • voter_phone → 0件

⑤ ロールバック手順（万が一用、頭出しのみ）
   → Vercel deployments → 前のデプロイの ⋯ → Promote to Production
```

### I-5. Claude Code「完了報告」は信用しない、実物を確認

**症状**: Claude Code が「ファイル内容を表示しました」と言ったが、実際にはターミナル出力にSQL本文が見えていなかった。

**対策**: 「やった」報告ではなく、**実SQLや実ファイル内容**を文字として確認するまで承認しない。

### I-6. push してしまっても焦らない

```bash
# ❌ NG（焦って打つやつ）
git reset --hard
git push --force

# ✅ OK（まず状況確認）
git log --oneline -5
git status
```

Git は履歴を消さないので、状況さえ把握できれば必ず復旧できる。

### I-7. Migration 番号は付与時点で衝突確認

`ls supabase/migrations/` で必ず確認してから次番号を決める。

### I-8. Worktree と .env.local

Claude Code が新しい worktree で作業を始めると、**`.env.local` が自動コピーされない**（`.gitignore` で除外）。

```bash
cd /Users/miyazakihokuto/Desktop/forte-mvp/.claude/worktrees/<worktree名>
cp ~/Desktop/forte-mvp/.env.local .
```

その後、dev サーバー再起動。

---

## J. その他の重要パターン

### J-1. ユーザー報告は DB 調査から始める

**何がうまくいったか**: 善光プロの報告で、まず `votes` テーブルを SQL で調査 → 2件の投票がそれぞれ別の原因（空データ / pending止まり）であることが**5分で判明**。推測でコード修正していたら無関係な場所を触って時間を浪費していた。

**鉄則**: ユーザーバグ報告 → **まず SQL でその人のレコード確認** → professionals の name, contact_email, user_id, 登録経路（LINE/Google/Email）を把握 → 対応方針を決める。

### J-2. 一括データ修正は専用APIエンドポイントで

複数サービス（DB + 外部API）を横断するデータ修正は、SQL ではなく専用APIエンドポイント（例: `/api/admin/backfill-contact-email`）として作る。認証キーで保護、結果をJSONで返す。再実行しても安全（既に値があるレコードはスキップ）。

### J-3. UUID は目視比較できない

Google Lens で URL 比較した時、頭8文字違うのに「同じURL」と誤認した事故あり。**スクショ取って横並び**、または機械的に文字列比較。

### J-4. Vercel コールドスタート

本番デプロイ直後、初回アクセスで5〜10秒かかることがある。2回目以降は1〜2秒。**本番確認は2回目以降のアクセス速度を見る**。

### J-5. ローカルで完璧を目指さない

「ローカルでエラーが出る」≠「本番で問題」。**本番Console確認**が真の判定基準。今後はローカル警告に時間を使い切る前に、本番に出してから判断する選択肢も持つ。

### J-6. 「verify on production」の手順は明示する

「本番で確認してください」だけでは確認できない。**URL、チェックリスト、手順を毎回明示**する義務。

### J-7. デバッグの黄金順序

```
1. ハードリフレッシュ（Cmd+Shift+R）← Step 0
2. API を直接ブラウザで開く
3. DB を SQL で確認
4. コード（フロント・サーバー）確認
```

「DB → API → フロント」の前に「キャッシュ排除」を入れる。

### J-8. Claude Code は CLAUDE.md とコードベースしか見えない

**事実**:
- Claude Code はコードベース・CLAUDE.md・指示プロンプトの3つしか見えない
- プロジェクトナレッジの教訓Docx群はアップロードされていないため未参照
- 「教訓N準拠」と書かれていたら、それは指示プロンプトに明記したからに過ぎない

**対策**:
- 重要な教訓はコメントとしてコードに残す（例: 「LINE 内蔵ブラウザは callback を2回発火する既知問題」）
- CLAUDE.md に重要教訓のサマリを統合する（**これがこのファイル**）

### J-9. ターミナル全文コピペのリスク

ターミナル出力を全文コピペすると過去のコマンド履歴も含まれ、**機密情報がチャットに流れる**。

**対処**:
- 必要な行だけ抜粋して貼る
- ターミナル履歴を定期的にクリア（`clear`）
- `.env.local` 編集はテキストエディタで（ターミナル経由禁止）
- 漏洩した場合のローテートは状況により判断

### J-10. 報告者への最終連絡を忘れない

太田ゆりかさんの stale state バグ報告がなければ、X-Day前に発見できなかった。修正完了後、原因・対策・感謝を明確に伝えることで、今後もフィードバックをもらいやすい関係性を維持できる。

### J-11. 大規模実装は4 Phase + 4 STOP

```
Phase A: 現状調査（コード読む、DB構造確認）
  → STOP 1: CEO 承認

Phase B: バックエンド改修（API、DB、ロジック）
  → STOP 2: SQL確認 + DevTools 確認 + CEO 承認

Phase C: フロントエンド実装（コンポーネント、UI）
  → STOP 3: ローカル動作確認 + CEO 承認

Phase D: 最終確認・本番マージ前チェック
  → STOP 4: 全項目クリア → main マージ
```

### J-12. 指示書は2ファイルセット（大規模タスクのみ）

| ファイル | 役割 | 想定読者 |
|---|---|---|
| `<task>-instructions.md` | 詳細仕様、Phase分割、STOP定義 | Claude Code（メイン参照）|
| `claude-code-prompt-<task>.md` | 起動プロンプト、絶対ルール再掲 | Claude Code（最初に読む）|

### J-13. 触ってはいけないもの（明示リスト）

新機能追加時、以下は**明示的に保護対象**として指示書に書く:

- 検索ハイライト機能（`?highlight=...`）
- リピーター/常連マーク表示
- ハッシュチェーン関連
- 既存の認証フロー
- 既存の RewardReveal / RewardContent

最初に明文化することで、Claude Code が誤って関連コードを書き換えるリスクを減らせる。

### J-14. 指示書は実装者が grep で網羅性確認

指示書に「Nパス」と書いても、Claude Code が grep で確認したら漏れていることがある（実例: Phase 5 で `submitHopefulVote` と `handleClerkVote` の2パスが漏れた）。

**ルール**:
- 指示書はガイド、実コードのほうが真実の情報源
- 実装者は指示書のスコープを「最小」と捉え、grep で実装網羅性を確認
- CEO 側も指示書執筆時に「N パスで本当に全部か？」を grep で先に検証

### J-15. フェイルオープン設計は「呼ばれてないこと」に気付きにくい

Phase 5 で `markTokenUsed` を呼ぶ追加をしたが、`qr_token` 引数が常に空文字で `if (!token) return` で何もせず終了していた。コードレビューでは見逃した。

**対策**:
- Phase 6（エッジケース確認）はコードレビューだけで終わらせず、**本番 or staging で実機テスト**
- snapshot パターンを使った時は、snapshot に「期待した値が入っているか」を実装直後に DB で確認
- デバッグログ（呼ばれた回数）を一時的に仕込む、または `process.env.NODE_ENV === 'development'` ガード付きで残す

### J-16. ターミナル merge コマンドはシンプルメッセージ

複数行・特殊文字（バッククオート、`!`）はコピペ時に詰まる（`dquote>` 状態）。シンプルな1行メッセージで安全に merge。詳細メッセージは後で `git commit --amend` で追加できる。

### J-17. 「だから何？」テスト

機能追加前に必ず: **「この機能を使ったユーザーは、次に何をしたくなるか？」**

答えが明確でないなら、その機能はまだ設計が不足している。

例（Step 4-1 顔写真）:
顔写真表示 → 「自分のカードに顔写真出したい」とプロが思う → 「YESを押してもらおう」とクライアントに促す → 投票数+顔写真同意数が増える ✅

---

## 付録: 教訓の出典

このファイルは以下の Project Knowledge 教訓集から抽出・統合:

- `REALPROOF_開発教訓集_20260303.docx`（Clerk移行直後）
- `REALPROOF_開発教訓集_Vercel_Clerk_20260307.docx`
- `REALPROOF_開発教訓集_バッジ公開ページ_Vercelキャッシュ_20260311.docx`
- `REALPROOF_開発教訓集_mailtoリンク修正_20260314.md`
- `REALPROOF_開発教訓集_LINE連携再送修正_20260323.md`
- `REALPROOF_開発教訓集_投票バグ修正_20260327.md`
- `REALPROOF_開発教訓集_クールダウン修正_20260327.md`
- `REALPROOF_開発教訓集_バッジ表示キャッシュ_20260404.md`
- `REALPROOF_開発教訓集_stale_state_20260416.docx`
- `REALPROOF_開発教訓集_contact_email修正_20260425.md`
- `REALPROOF_開発教訓集_田中事件_Set1_Set2_LINE修正_20260428.md`
- `REALPROOF_完全リファレンス_20260425.md`
- `REALPROOF_開発加速リファレンス_v1_20260426.md`

新しい教訓はこのファイルに追記し、CLAUDE.md にはチェック1行だけ反映する運用。

---

**最終更新**: 2026-04-28
**X-Day**: 2026-06-30（FNT 35,000人配信）
