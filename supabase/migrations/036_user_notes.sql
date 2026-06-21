-- ============================================================
-- 用户原子笔记层（Zettelkasten / 卡片盒）—— Obsidian 化的「灵魂层」
--
-- 在此之前，知识星图的节点全是系统生成的（topic / question / theorem）。
-- 本迁移引入第四类、也是唯一「用户亲手写」的节点：user_notes。
-- 笔记正文里的 [[维基链接]] 在保存时被解析成 note_links 行（指向知识点/定理/题/别的笔记），
-- 这些边喂给星图（app/actions/graph.ts 的个人化层）与反向链接面板，
-- 学生的笔记由此真正长进知识网，成为「第二大脑」。
--
-- ★ 隐私铁律：笔记默认私有。星图的公共底图走匿名缓存客户端（全站共享），
--   私人笔记绝不能进那个缓存——笔记节点/边一律在 getPersonalizedGraphData 里
--   按当前登录用户用「带 cookie 的鉴权客户端」现算，不缓存、不串号。
--
-- ⚠️ 本项目无 Supabase CLI/psql，需手动在 SQL Editor Run（见 project_supabase_workflow）。
--   未跑时：/notes 与星图笔记层静默降级为空，其余功能不受影响。
-- ============================================================

-- ── 笔记本体 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,                 -- [[笔记标题]] 维基链接按 (user_id,title) 命中
  body_md     TEXT        NOT NULL DEFAULT '',      -- 正文（Markdown + LaTeX，复用 MathRenderer）
  is_public   BOOLEAN     NOT NULL DEFAULT false,   -- 默认私有；公开后他人可只读（暂不进全站底图）
  metadata    JSONB       NOT NULL DEFAULT '{}',    -- 颜色/置顶/模板等可变属性，沿用 JSONB 约定
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 同一用户下标题唯一，才能让 [[标题]] 无歧义解析到一条笔记。
  CONSTRAINT user_notes_user_title_unique UNIQUE (user_id, title)
);
CREATE INDEX IF NOT EXISTS idx_user_notes_user ON public.user_notes (user_id, updated_at DESC);

-- ── 出链（笔记 → 任意实体）：维基链接保存时重建，喂星图边 + 反链 ──
-- target_id 为 NULL = 悬挂链接（写了 [[某某]] 但当前还没有对应实体），仍保留以便未来补建。
CREATE TABLE IF NOT EXISTS public.note_links (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id      UUID        NOT NULL REFERENCES public.user_notes(id) ON DELETE CASCADE,
  target_type  TEXT        NOT NULL CHECK (target_type IN ('topic', 'theorem', 'question', 'note')),
  target_id    UUID,                                -- 解析命中的实体 id；NULL=悬挂
  target_label TEXT        NOT NULL,                -- 原始 [[...]] 文本（用于悬挂链接展示/重解析）
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 同一笔记内同一 (类型,文本) 只记一条出链。
  CONSTRAINT note_links_unique UNIQUE (note_id, target_type, target_label)
);
CREATE INDEX IF NOT EXISTS idx_note_links_note   ON public.note_links (note_id);
-- 反向链接：某实体被哪些笔记引用（按目标查源）。
CREATE INDEX IF NOT EXISTS idx_note_links_target ON public.note_links (target_type, target_id);

-- updated_at 自动维护
CREATE OR REPLACE FUNCTION public.touch_user_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_notes_updated_at ON public.user_notes;
CREATE TRIGGER trg_user_notes_updated_at
  BEFORE UPDATE ON public.user_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_notes_updated_at();

-- ── RLS：笔记是私产 ─────────────────────────────────────────
-- user_notes：本人全权；公开笔记任何人可只读。
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own notes full access" ON public.user_notes FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "public notes read" ON public.user_notes FOR SELECT
  USING (is_public = true);

-- note_links：可读性跟随其所属笔记（本人 or 公开）；写入仅笔记主人。
ALTER TABLE public.note_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "note_links read follows note" ON public.note_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_notes n
    WHERE n.id = note_links.note_id
      AND (n.user_id = auth.uid() OR n.is_public = true)
  ));
CREATE POLICY "note_links owner write" ON public.note_links FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_notes n
    WHERE n.id = note_links.note_id AND n.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_notes n
    WHERE n.id = note_links.note_id AND n.user_id = auth.uid()
  ));
