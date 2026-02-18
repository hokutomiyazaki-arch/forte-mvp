-- ============================================
-- proof_items & personality_items
-- マスタテーブル作成 + シードデータ投入
-- ============================================

-- proof_items テーブル
DROP TABLE IF EXISTS proof_items CASCADE;
CREATE TABLE proof_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab TEXT NOT NULL,
  label TEXT NOT NULL,
  strength_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- personality_items テーブル
DROP TABLE IF EXISTS personality_items CASCADE;
CREATE TABLE personality_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  personality_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- proof_items シードデータ（70項目）
-- ============================================

-- basic (10)
INSERT INTO proof_items (tab, sort_order, label, strength_label) VALUES
('basic', 1, '原因を見抜く力がある', '診断力'),
('basic', 2, '説明が分かりやすい', '伝達力'),
('basic', 3, '引き出しが多い', '対応力'),
('basic', 4, '結果を出すのが早い', '即効性'),
('basic', 5, '他では得られない体験だった', '独自性'),
('basic', 6, '期待を超えてきた', '期待超越'),
('basic', 7, '常に進化している', '成長力'),
('basic', 8, '長年の悩みを解決してくれた', '難題解決力'),
('basic', 9, '再現性がある（毎回結果が出る）', '安定力'),
('basic', 10, '人生が変わった', '変革力');

-- body_pro (10)
INSERT INTO proof_items (tab, sort_order, label, strength_label) VALUES
('body_pro', 1, '痛みを取る技術がある', '疼痛改善力'),
('body_pro', 2, '動きを変える技術がある', '運動改善力'),
('body_pro', 3, '姿勢を変える技術がある', '姿勢改善力'),
('body_pro', 4, 'パフォーマンスを引き上げる力がある', '競技力向上'),
('body_pro', 5, '身体の仕組みに詳しい', '専門知識力'),
('body_pro', 6, '根本原因にアプローチできる', '根本改善力'),
('body_pro', 7, 'セルフケアまで教えてくれる', '自立支援力'),
('body_pro', 8, '身体の変化を実感させてくれる', '体感提供力'),
('body_pro', 9, '予防・メンテナンスに強い', '予防力'),
('body_pro', 10, 'アスリートレベルの対応ができる', 'ハイレベル対応力');

-- yoga (10)
INSERT INTO proof_items (tab, sort_order, label, strength_label) VALUES
('yoga', 1, '身体の気づきを与えてくれる', 'ボディアウェアネス力'),
('yoga', 2, '呼吸を変える技術がある', '呼吸指導力'),
('yoga', 3, '柔軟性を引き出す力がある', '柔軟性改善力'),
('yoga', 4, '心身のバランスを整えてくれる', '心身調整力'),
('yoga', 5, 'ポーズの導き方がうまい', 'キューイング力'),
('yoga', 6, 'レベルに合わせた指導ができる', 'レベル対応力'),
('yoga', 7, '瞑想・マインドフルネスに強い', '内観誘導力'),
('yoga', 8, '怪我のリスクを見抜く力がある', '安全管理力'),
('yoga', 9, '日常生活にヨガを繋げてくれる', '生活統合力'),
('yoga', 10, 'クラスの空間づくりがうまい', '場の創造力');

-- pilates (10)
INSERT INTO proof_items (tab, sort_order, label, strength_label) VALUES
('pilates', 1, '姿勢を変える技術がある', '姿勢改善力'),
('pilates', 2, 'インナーマッスルを目覚めさせる力がある', '深層筋活性力'),
('pilates', 3, '動きのクセを見抜く力がある', '動作分析力'),
('pilates', 4, '身体の左右差を整えてくれる', 'バランス調整力'),
('pilates', 5, '呼吸と動きを連動させる指導がうまい', '呼吸連動力'),
('pilates', 6, 'リハビリ的なアプローチができる', 'リハビリ対応力'),
('pilates', 7, 'マシンの使い方が的確', 'マシン指導力'),
('pilates', 8, '体幹の安定を作る力がある', 'コア構築力'),
('pilates', 9, '身体の変化を実感させてくれる', '体感提供力'),
('pilates', 10, '痛みや不調にも対応できる', '不調改善力');

-- esthe (10)
INSERT INTO proof_items (tab, sort_order, label, strength_label) VALUES
('esthe', 1, '肌を変える技術がある', '肌質改善力'),
('esthe', 2, '見た目の変化が分かりやすい', '可視的変化力'),
('esthe', 3, '手技のレベルが高い', '施術技術力'),
('esthe', 4, '肌の状態を正確に読む力がある', '肌診断力'),
('esthe', 5, 'ホームケアまで教えてくれる', 'セルフケア指導力'),
('esthe', 6, 'リラクゼーション効果が高い', 'リラックス提供力'),
('esthe', 7, '体質に合わせた提案ができる', 'パーソナライズ力'),
('esthe', 8, 'エイジングケアに強い', 'アンチエイジング力'),
('esthe', 9, 'トラブル肌への対応力がある', 'トラブル対応力'),
('esthe', 10, '内側からの美しさを引き出す', 'インナービューティ力');

-- sports (10)
INSERT INTO proof_items (tab, sort_order, label, strength_label) VALUES
('sports', 1, '技術を上達させる力がある', '技術指導力'),
('sports', 2, 'フォームを変える力がある', 'フォーム改善力'),
('sports', 3, '身体の使い方を教えるのがうまい', '身体操作指導力'),
('sports', 4, 'メンタルを強くしてくれる', 'メンタルコーチ力'),
('sports', 5, '怪我をしにくい身体を作ってくれる', '怪我予防力'),
('sports', 6, 'レベルに合わせた指導ができる', 'レベル対応力'),
('sports', 7, '楽しく続けられる指導をしてくれる', 'モチベーション維持力'),
('sports', 8, '試合・本番で結果を出させる力がある', '実戦力向上'),
('sports', 9, '弱点を見抜いて克服させる力がある', '弱点発見力'),
('sports', 10, '練習メニューの設計がうまい', 'トレーニング設計力');

-- education (10)
INSERT INTO proof_items (tab, sort_order, label, strength_label) VALUES
('education', 1, '成績を上げる力がある', '成績向上力'),
('education', 2, '苦手を克服させる力がある', '弱点克服力'),
('education', 3, 'やる気を引き出す力がある', 'モチベーション力'),
('education', 4, '勉強法を変えてくれる', '学習設計力'),
('education', 5, '受験戦略に強い', '受験対応力'),
('education', 6, '考える力を育ててくれる', '思考力育成'),
('education', 7, '子どもの特性を見抜く力がある', '個性把握力'),
('education', 8, '親の不安にも応えてくれる', '保護者対応力'),
('education', 9, '集中力を引き出す力がある', '集中力開発'),
('education', 10, '学ぶこと自体を好きにさせる', '学習意欲点火力');

-- ============================================
-- personality_items シードデータ（10項目）
-- ============================================

INSERT INTO personality_items (sort_order, label, personality_label) VALUES
(1, '誠実で信頼できる', '誠実さ'),
(2, '話しやすい雰囲気がある', '親しみやすさ'),
(3, '話をしっかり聴いてくれる', '傾聴力'),
(4, '情熱がある', '熱量・向上心'),
(5, '前向きにしてくれる', 'ポジティブエネルギー'),
(6, '距離感がちょうどいい', 'バランス感覚'),
(7, '裏表がない', '透明性'),
(8, '厳しさの中に愛がある', '愛ある厳しさ'),
(9, '尊重してくれる', 'リスペクト'),
(10, 'この人の周りにいたいと思う', '人間的魅力');

-- ============================================
-- RLS 有効化 + SELECT を全員に許可（公開データ）
-- ============================================

ALTER TABLE proof_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE personality_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proof_items_select_all" ON proof_items
  FOR SELECT USING (true);

CREATE POLICY "personality_items_select_all" ON personality_items
  FOR SELECT USING (true);
