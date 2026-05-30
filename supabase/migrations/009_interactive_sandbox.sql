-- ============================================================
-- 交互式 Rive 沙盒支持：为题目添加可交互动画配置
-- ============================================================
--
-- 新增列 interactive_sandbox JSONB：
--   {
--     "asset_path":    "https://<project>.supabase.co/storage/v1/object/public/interactive-sandboxes/<file>.riv",
--     "state_machine": "Main",
--     "controls": [
--       { "input_name": "Angle",   "type": "number",  "label": "角度",   "default": 0,  "min": 0, "max": 360, "step": 1 },
--       { "input_name": "ShowAxis","type": "boolean", "label": "显示坐标轴", "default": true },
--       { "input_name": "Reset",   "type": "trigger", "label": "重置" }
--     ]
--   }
--
-- 约定：NULL 或缺失代表"该题无交互沙盒"，QuestionCard 不渲染任何额外 UI。

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS interactive_sandbox JSONB;

COMMENT ON COLUMN questions.interactive_sandbox IS
  '可选：交互式 Rive 沙盒配置。结构见 types/database.ts 中的 InteractiveSandboxConfig 类型。';

-- ── Storage 存储桶：公开读，仅 service_role 写入 ──────────────
-- 用 ON CONFLICT 保证脚本可重复执行（idempotent）。

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'interactive-sandboxes',
  'interactive-sandboxes',
  true,
  10 * 1024 * 1024,             -- 单文件上限 10 MB（.riv 通常 < 1 MB）
  ARRAY['application/octet-stream', 'application/x-rive', 'binary/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  public            = EXCLUDED.public,
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── RLS 策略：任何人可读，写入仅限服务端（admin client）─────────
-- service_role 自动绕过 RLS，无需额外策略。这里只放公开读策略。

DROP POLICY IF EXISTS "Public read access for interactive-sandboxes" ON storage.objects;
CREATE POLICY "Public read access for interactive-sandboxes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'interactive-sandboxes');
