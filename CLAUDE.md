# REALPROOF 開発ルール

## 鉄則
- getUser()は使わない。常にgetSession()
- .single()は使わない。常に.maybeSingle()
- 1修正=1コミット。修正後 npm run build 確認
- 「まずコードを見せて、変更はまだしないで」が安全

## 認証の注意
- signUpとsignInは別コードパス
- login/page.tsx は地雷原。変更時は全フロー確認
- router.push()ではなくwindow.location.hrefを使う

# ============================================================
# Organization Feature (団体機能)
# ============================================================

## Organization Feature — 4つの絶対原則

1. **プルーフの所有権は常に「個人」にある。** 団体はビューレイヤー（閲覧層）のみ。プルーフデータの所有・管理・削除の権限は持たない。
2. **団体独自のプルーフは存在しない。** 個人プルーフの集約が団体のプルーフ。団体レベルのプルーフカテゴリを追加した瞬間、「手間のかかるGoogle口コミ」になる。
3. **団体QRは存在しない。** プロのQRが唯一の投票入口。団体QRは「誰が見せるのか」のdesign smell。
4. **REALPROOFはバッジを作らない。** バッジを発行・表示・証明するインフラを提供する。Shopifyモデル。

## Organization Feature — 変更禁止リスト

以下のテーブル・機能はOrganization実装時に一切変更しない:

- `professionals` テーブル（store_idカラム追加しない）
- `votes` テーブル（投票は常にプロ個人への行為）
- `rewards` / `client_rewards` テーブル
- `qr_tokens` テーブル（団体QRは作らない）
- `vote_summary` ビュー
- 投票フロー（/vote/[token]）

## Organization Feature — 新テーブル

- `organizations`: 団体テーブル（type: store/credential/education）
- `org_members`: 団体×プロの所属関係（status: pending/active/removed）
- `org_invitations`: メール招待管理
- `credential_levels`: バッジ定義（Phase 1Bで追加。Phase 1Aでは作らない）

## Organization Feature — ロール

- `owner`: 団体オーナー。usersテーブルのroleに追加
- オーナーが同時にプロの場合: org_membersで is_owner=true として自分も追加

## Organization Feature — RLS原則

- オーナーは自分の団体のorg_members/org_invitationsを管理可能
- プロは自分の所属情報を閲覧可能
- プロは「店舗」からのみ自分で離脱可能（資格バッジは団体のみが管理）
- オーナーは個別コメント・リワード設定・QRコードを閲覧不可

## Organization Feature — フェーズ分割

- **Phase 1A**: 店舗オーナーのコア機能（団体登録、メンバー招待、ダッシュボード、公開ページ）
- **Phase 1B**: Badge Self-Service（credential_levels、claim URL、バッジ管理ダッシュボード）
- **Phase 2**: Analytics + Search + 有料プラン
