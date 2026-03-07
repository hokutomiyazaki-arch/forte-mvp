-- ============================================================
-- Migration 020: proof_items に coaching タブ追加（10項目）
-- ============================================================

INSERT INTO proof_items (id, tab, label, strength_label, sort_order) VALUES
(gen_random_uuid(), 'coaching', '思考パターンが変わった', 'マインドセット変革', 10),
(gen_random_uuid(), 'coaching', '自己肯定感が上がった', '自己肯定感向上', 20),
(gen_random_uuid(), 'coaching', '目標に向けて行動できるようになった', '行動変容', 30),
(gen_random_uuid(), 'coaching', '継続できる仕組みを作ってくれた', '習慣設計', 40),
(gen_random_uuid(), 'coaching', '感情のコントロールが上手くなった', '感情管理', 50),
(gen_random_uuid(), 'coaching', '人生の方向性が見えた', '人生設計', 60),
(gen_random_uuid(), 'coaching', '自分の強みに気づかせてくれた', '強み発見', 70),
(gen_random_uuid(), 'coaching', '決断力が上がった', '決断力', 80),
(gen_random_uuid(), 'coaching', 'メンタルが安定した', 'メンタル安定', 90),
(gen_random_uuid(), 'coaching', '考え方の枠が外れた', '思考拡張', 100);
