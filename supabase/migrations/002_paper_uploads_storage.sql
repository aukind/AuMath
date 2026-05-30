-- ============================================================
-- 试卷上传 · Supabase Storage 配置
-- ============================================================
-- 创建私有 bucket（文件不对外公开，通过签名 URL 访问）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'paper-uploads',
  'paper-uploads',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ── RLS 策略 ─────────────────────────────────────────────────

-- 已认证用户可上传
CREATE POLICY "auth_upload_papers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'paper-uploads');

-- 已认证用户可读取（用于生成签名 URL）
CREATE POLICY "auth_read_papers"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'paper-uploads');

-- 已认证用户可删除（录错时清理）
CREATE POLICY "auth_delete_papers"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'paper-uploads');