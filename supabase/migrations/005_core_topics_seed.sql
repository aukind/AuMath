-- ============================================================
-- 补全 6 个高考数学核心知识点分类（根节点，无 parent_id 依赖）
-- 同时添加 sort_order 列用于前端自定义排序
-- ============================================================

ALTER TABLE topics ADD COLUMN IF NOT EXISTS sort_order SMALLINT;
UPDATE topics SET sort_order = order_index WHERE sort_order IS NULL;

INSERT INTO topics (name, slug, description, parent_id, level, order_index, sort_order)
SELECT '数列', 'sequences-core', '等差数列、等比数列、求和', NULL, 0, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM topics WHERE name = '数列');

INSERT INTO topics (name, slug, description, parent_id, level, order_index, sort_order)
SELECT '三角', 'trigonometry', '三角函数、正弦定理、余弦定理', NULL, 0, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM topics WHERE name = '三角');

INSERT INTO topics (name, slug, description, parent_id, level, order_index, sort_order)
SELECT '函数与导数', 'functions-and-derivatives', '函数性质、导数与微积分应用', NULL, 0, 2, 2
WHERE NOT EXISTS (SELECT 1 FROM topics WHERE name = '函数与导数');

INSERT INTO topics (name, slug, description, parent_id, level, order_index, sort_order)
SELECT '解析几何', 'analytic-geometry-core', '圆锥曲线（椭圆、双曲线、抛物线）与直线', NULL, 0, 3, 3
WHERE NOT EXISTS (SELECT 1 FROM topics WHERE name = '解析几何');

INSERT INTO topics (name, slug, description, parent_id, level, order_index, sort_order)
SELECT '立体几何', 'solid-geometry', '空间向量、平行与垂直、体积计算', NULL, 0, 4, 4
WHERE NOT EXISTS (SELECT 1 FROM topics WHERE name = '立体几何');

INSERT INTO topics (name, slug, description, parent_id, level, order_index, sort_order)
SELECT '概率统计', 'probability-statistics', '概率、排列组合、统计与抽样', NULL, 0, 5, 5
WHERE NOT EXISTS (SELECT 1 FROM topics WHERE name = '概率统计');

UPDATE topics SET sort_order = 0 WHERE name = '数列';
UPDATE topics SET sort_order = 1 WHERE name = '三角';
UPDATE topics SET sort_order = 2 WHERE name = '函数与导数';
UPDATE topics SET sort_order = 3 WHERE name = '解析几何';
UPDATE topics SET sort_order = 4 WHERE name = '立体几何';
UPDATE topics SET sort_order = 5 WHERE name = '概率统计';
