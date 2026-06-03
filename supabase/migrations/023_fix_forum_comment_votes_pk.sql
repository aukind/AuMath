-- ============================================================
-- 023: 修正论坛投票/收藏表约束 —— 确保「每人每条一票」(复合键)
--      而非「每人一票」(user_id 单列键)。
--
-- 背景：若 forum_comment_votes 早期曾以 user_id 单列做主键/唯一键被创建，
-- 010 的 `CREATE TABLE IF NOT EXISTS` 对已存在的表是 no-op，从未修正约束。
-- 单列 user_id 唯一键 → 每个用户全站只能留一条点赞（赞 B 时 A 被挤掉）。
--
-- 本迁移幂等：约束本就正确（复合键）时为 no-op；可安全重复执行。
-- 同时顺带校验 022 的两张帖子表（通常已正确，仅保险）。
-- ============================================================

DO $$
DECLARE
  rec record;
  con record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('forum_comment_votes', 'comment_id'),
      ('forum_post_votes',    'post_id'),
      ('forum_post_favorites','post_id')
    ) AS t(tbl, keycol)
  LOOP
    -- 表不存在则跳过
    IF to_regclass('public.' || rec.tbl) IS NULL THEN
      CONTINUE;
    END IF;

    -- 删除任何「列集合恰为 {user_id} 单列」的主键/唯一约束（历史遗留错误约束）
    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = ('public.' || rec.tbl)::regclass
        AND c.contype IN ('p', 'u')
        AND (
          SELECT array_agg(a.attname ORDER BY a.attname)
          FROM unnest(c.conkey) k
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
        ) = ARRAY['user_id']::name[]
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', rec.tbl, con.conname);
    END LOOP;

    -- 若已无主键，则补上正确的复合主键 (keycol, user_id)
    -- （旧约束是单列 user_id 时每用户至多一行，不会有 (keycol,user_id) 重复，加键安全）
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = ('public.' || rec.tbl)::regclass AND c.contype = 'p'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD PRIMARY KEY (%I, user_id)', rec.tbl, rec.keycol);
    END IF;
  END LOOP;
END $$;
