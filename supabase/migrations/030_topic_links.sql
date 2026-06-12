-- ============================================================
-- 知识点双向链接（Obsidian 式显式双链）
-- 无向边：约定 source_topic_id < target_topic_id 规范化存储，
-- 一行即一条双链（应用层查询时双向解读），天然去重。
-- 未跑此迁移时知识星图静默降级（仅少手动双链层，不影响其余功能）。
-- ============================================================

CREATE TABLE topic_links (
  source_topic_id UUID        NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  target_topic_id UUID        NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  note            TEXT,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_topic_id, target_topic_id),
  CONSTRAINT topic_links_canonical_order CHECK (source_topic_id < target_topic_id)
);

COMMENT ON TABLE  topic_links      IS '知识点之间的手动双向链接（无向，规范化为 source<target 存储）。';
COMMENT ON COLUMN topic_links.note IS '可选备注，如「换元法常与此同考」。';

-- 反向端点查找（按 target 找双链另一端）
CREATE INDEX idx_topic_links_target ON topic_links (target_topic_id);

ALTER TABLE topic_links ENABLE ROW LEVEL SECURITY;

-- 全员可读（公共知识网底图）
CREATE POLICY "topic_links_public_read"
  ON topic_links FOR SELECT USING (TRUE);

-- 仅管理员可写（与 isAdminUser 同口径：app_metadata.role = 'admin'）
CREATE POLICY "topic_links_admin_write"
  ON topic_links FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
