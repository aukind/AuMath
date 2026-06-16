-- ============================================================
-- 收藏夹：给「我的收藏」分门别类
--   · favorite_folders —— 用户自建的收藏夹（单归属，像文件夹）
--   · user_favorites.folder_id —— 每道收藏题归到某个收藏夹；NULL = 未分类
-- 删除收藏夹时，其下的收藏题 folder_id 置空（落回「未分类」），不丢收藏。
-- ============================================================

-- ── 收藏夹表 ────────────────────────────────────────────────
CREATE TABLE favorite_folders (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_favorite_folders_user ON favorite_folders (user_id, sort_order, created_at);
ALTER TABLE favorite_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own folders" ON favorite_folders FOR ALL USING (auth.uid() = user_id);

-- ── 收藏题归属：folder_id 外键，删夹自动落回未分类 ───────────
ALTER TABLE user_favorites
  ADD COLUMN folder_id UUID REFERENCES favorite_folders(id) ON DELETE SET NULL;
CREATE INDEX idx_user_favorites_folder ON user_favorites (user_id, folder_id);
