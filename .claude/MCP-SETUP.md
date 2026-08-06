# Supabase MCP の接続設定（外出中セッション用）

## これは何

外出中（スマホ起動の web セッション）に CC が**承認済みSQLを自分で実行**できるようにするための接続設定。
`.mcp.json` はリポジトリにコミット済みなので、**一度セットアップすれば以後のセッションで自動接続される**。
会話ごとに繋ぎ直す必要はない。

## 前提の整理（2026-08-06 調査）

| 手段 | 使えるか | 理由 |
|---|---|---|
| claude.ai のコネクタ（Notion / Gmail / GitHub / Drive / Zapier 等） | ✅ 毎回自動 | アカウント単位。再接続不要 |
| **Supabase を claude.ai のコネクタとして繋ぐ** | ❌ | コネクタ一覧に Supabase が存在しない |
| **Chrome 拡張でブラウザ操作** | ❌ web セッションでは不可 | web セッションはクラウド上の隔離コンテナで動く。ほくとの Mac の Chrome には届かない。<br>Mac 上で起動した Claude Code なら従来どおり使える（環境の違いであって繋ぎ忘れではない） |
| **Supabase MCP（`.mcp.json`）** | ⚠️ 下記2つの設定が要る | コンテナから直接 Supabase API を叩く。これが web セッションでの正解 |
| psql で直結 | ❌ | コンテナの外向き通信は HTTPS のみ。5432 は塞がれている |

## 残り2つ：ほくとが Claude Code on the web の Environment 設定でやること

CC 側からは設定できない（クラウド環境の設定画面のため）。
→ https://code.claude.com/docs/en/claude-code-on-the-web

### ① ネットワークポリシーで Supabase を許可する

**現状これがブロックされていて、トークンを入れても通信できない。**
確認したエラー：`api.supabase.com:443` への CONNECT に対しゲートウェイが **403**（ポリシー拒否）。

許可するドメイン：
- `api.supabase.com` … Management API（DDL 実行はここを通る）
- `<プロジェクトref>.supabase.co` … データ参照

### ② 環境変数を2つ登録する（チャットに貼らないこと）

| 変数名 | 中身 | 取得場所 |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal Access Token | Supabase ダッシュボード → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | プロジェクトref | プロジェクトURL `https://supabase.com/dashboard/project/<これ>` |

※ project ref をコードに直書きしない方針（`rp-reference.md`）に合わせ、`.mcp.json` でも環境変数参照にしてある。
※ Access Token は**サービスロールキーとは別物**。サービスロールキーは登録不要。

## 設定できたかの確認

次のセッションで CC に「Supabase MCP が繋がっているか確認して」と言えば、
`mcp__supabase__*` のツールが見えるかどうかで判定できる。

## 安全側の線引き（変えない）

`--read-only` は**付けていない**。付けると DDL が通らず、承認済みSQLの代行という目的自体が成立しないため。
そのぶん人間ゲートは CLAUDE.md のルールで担保する：

- **CEO が承認した SQL だけ実行する。未承認は提示にとどめる**
- 破壊的操作（DROP / DELETE / UPDATE 等）は 5段階プロトコル・神山プロトコルをそのまま適用
- 実行前に対象行を SELECT で確認し、実行は `RETURNING` 付きで結果を残す
