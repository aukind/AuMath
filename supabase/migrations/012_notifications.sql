-- ============================================================
-- 012_notifications.sql —— 站内通知
--   - notifications  recipient 收到 actor 触发的通知
--     type: reply_post | reply_comment | like | follow
-- 依赖 010_forum.sql 的 profiles / forum_posts。幂等，可重复 Run。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL,
  -- 论坛类通知关联的帖子（用于跳转）；follow 类为空
  post_id      UUID        REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  read         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_check CHECK (type IN ('reply_post', 'reply_comment', 'like', 'follow')),
  CONSTRAINT notifications_no_self    CHECK (recipient_id <> actor_id)
);

COMMENT ON TABLE public.notifications IS '站内通知：recipient 收到由 actor 触发的 type 类通知。';

-- 收件箱按时间倒序 / 未读统计
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread    ON public.notifications (recipient_id) WHERE read = FALSE;

-- ── RLS ──
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 仅本人可读自己的通知
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT
  TO authenticated USING (recipient_id = auth.uid());

-- 登录用户只能以自己身份(actor)创建通知（防止伪造他人触发）
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications FOR INSERT
  TO authenticated WITH CHECK (actor_id = auth.uid());

-- 本人可标记已读 / 删除自己的通知
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE
  TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE
  TO authenticated USING (recipient_id = auth.uid());
