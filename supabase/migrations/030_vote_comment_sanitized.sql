-- §2-6 Voice表示時AI変換のキャッシュテーブル（Phase 1 DDL の一部・CEOが 2026-08-01 に実行済み）
-- 本ファイルは記録用。実行済みのため再実行不要（IF NOT EXISTS で冪等化済み）。
-- ※ 実カラムは REST プローブで確認済み: vote_id / sanitized_text / sanitize_version / sanitized_at / created_at
--   制約の細部（FK・PK）は SQL Editor の実行履歴が正。差異があればこのファイルを実態に合わせて修正すること。

CREATE TABLE IF NOT EXISTS vote_comment_sanitized (
  vote_id uuid PRIMARY KEY REFERENCES votes(id) ON DELETE CASCADE,
  sanitized_text text,
  sanitize_version int,
  sanitized_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 運用メモ:
-- ・原本 votes.comment は絶対に書き換えない（ハッシュチェーンは原本に対して打つ・§2-6）
-- ・変換の適用は外部経路のみ（Phase 1 では紹介URL /r/[slug]）。アプリ内は原本表示
-- ・生成は URL 表示時に1回→本テーブルにキャッシュ。表示ごとの API コールはしない
-- ・有効化は Vercel 環境変数 FEATURE_AI_TEXT_SANITIZE=true ＋ ANTHROPIC_API_KEY 設定後
