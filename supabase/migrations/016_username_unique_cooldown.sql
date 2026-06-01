-- ============================================================
-- 016_username_unique_cooldown.sql —— 用户名唯一 + 7 天改名冷却
--   - profiles.username           大小写不敏感唯一
--   - profiles.username_changed_at 最近一次改名时间（NULL=从未改过，可随时改）
--   - 去重存量重名（保留最早注册者，其余加 #user_no 后缀）
--   - handle_new_user() 注册时若默认用户名撞名，自动加 _user_no 后缀，避免注册失败
-- 依赖 010_forum.sql 的 profiles、015_user_no.sql 的 user_no / 序列。
-- 手动在 Supabase SQL Editor 运行。幂等，可重复 Run。
-- ============================================================

-- 1) 改名时间列（NULL 表示注册后从未改名）。
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.username_changed_at IS '最近一次修改用户名的时间；NULL=注册后从未改过。用于 7 天改名冷却。';

-- 2) 去重存量重名：同名（大小写不敏感）里保留 user_no 最小者，其余追加 #user_no 唯一后缀。
--    user_no 全局唯一，保证生成的后缀名互不冲突。仅在建唯一索引前清场，幂等安全。
WITH dups AS (
  SELECT id,
         row_number() OVER (PARTITION BY lower(username) ORDER BY user_no) AS rn,
         user_no
  FROM public.profiles
)
UPDATE public.profiles p
SET username = p.username || '#' || d.user_no
FROM dups d
WHERE p.id = d.id AND d.rn > 1;

-- 3) 大小写不敏感唯一索引（"Alice" 与 "alice" 视为同名）。
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON public.profiles (lower(username));

-- 4) 改触发器：默认用户名（邮箱前缀/metadata）撞名时加 _user_no 后缀，绝不让注册因重名失败。
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_no   BIGINT := nextval('public.profiles_user_no_seq');
  v_base TEXT   := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  v_name TEXT   := v_base;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_name)) THEN
    v_name := v_base || '_' || v_no;
  END IF;

  INSERT INTO public.profiles (id, username, role, user_no)
  VALUES (
    NEW.id,
    v_name,
    COALESCE(NEW.raw_app_meta_data->>'role', 'user'),
    v_no
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
