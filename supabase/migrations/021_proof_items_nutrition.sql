-- ============================================================
-- Migration 021: proof_items に nutrition タブ追加（10項目）
-- ============================================================

INSERT INTO proof_items (id, tab, label, strength_label, sort_order) VALUES
(gen_random_uuid(), 'nutrition', '食習慣が変わった', '食習慣改善', 10),
(gen_random_uuid(), 'nutrition', '体の中から変化を感じた', '内側からの変化', 20),
(gen_random_uuid(), 'nutrition', '無理なく続けられる食事管理を教えてくれた', '持続可能な食事管理', 30),
(gen_random_uuid(), 'nutrition', '栄養の知識が実生活で使えるようになった', '栄養知識の実践', 40),
(gen_random_uuid(), 'nutrition', 'エネルギーレベルが上がった', 'エネルギー向上', 50),
(gen_random_uuid(), 'nutrition', '体重・体組成が改善された', '体組成改善', 60),
(gen_random_uuid(), 'nutrition', '食事と身体の関係が理解できた', '食と身体の理解', 70),
(gen_random_uuid(), 'nutrition', '食べることへの罪悪感がなくなった', '食の罪悪感解消', 80),
(gen_random_uuid(), 'nutrition', '腸内環境・コンディションが改善された', '腸内環境改善', 90),
(gen_random_uuid(), 'nutrition', '自分に合った食事スタイルが見つかった', 'パーソナル食事スタイル', 100);
