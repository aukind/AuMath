-- ============================================================
-- 015_user_no.sql —— B 站式数字 UID（按注册时间递增，从 0 开始）
--   - profiles.user_no  唯一、永久不变的数字编号，第一个注册者 = 0
--   - 存量用户按 auth.users.created_at 逐一回填
--   - 新用户注册时由 handle_new_user() 触发器自动分配下一个号
-- 依赖 010_forum.sql 的 public.profiles 与 handle_new_user()。
-- 手动在 Supabase SQL Editor 运行（本项目无 DDL/CLI 权限）。幂等，可重复 Run。
-- ============================================================

-- 1) 加列：数字 UID。
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_no BIGINT;

COMMENT ON COLUMN public.profiles.user_no IS '数字 UID：按注册时间递增、从 0 开始、唯一且永久不变。';

-- 2) 唯一索引（兼作 UID 精确搜索的加速索引）。
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_no ON public.profiles (user_no);

-- 3) 回填存量用户：按真实注册时间排序，最早者 = 0。
--    仅处理 user_no 为空的行，保证可重复 Run。
WITH ranked AS (
  SELECT p.id,
         row_number() OVER (ORDER BY u.created_at ASC, p.id ASC) - 1 AS rn
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.user_no IS NULL
)
UPDATE public.profiles p
SET user_no = ranked.rn
FROM ranked
WHERE p.id = ranked.id;

-- 4) 分配序列（MINVALUE 0 支持从 0 起；OWNED BY 让它随列删除自动清理）。
CREATE SEQUENCE IF NOT EXISTS public.profiles_user_no_seq
  MINVALUE 0 START WITH 0 OWNED BY public.profiles.user_no;

-- 把序列推进到「现有最大号 + 1」；无用户时 next nextval 仍为 0。
-- is_called = false → 下一次 nextval 恰好返回该值本身。
SELECT setval(
  'public.profiles_user_no_seq',
  COALESCE((SELECT max(user_no) FROM public.profiles), -1) + 1,
  false
);

-- 5) 回填完成后置为 NOT NULL（幂等可重复）。
ALTER TABLE public.profiles ALTER COLUMN user_no SET NOT NULL;

-- 6) 改触发器函数：新用户注册时自动领取下一个 UID。
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role, user_no)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_app_meta_data->>'role', 'user'),
    nextval('public.profiles_user_no_seq')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
