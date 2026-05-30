import PaperUploadWorkflow from '@/components/admin/PaperUploadWorkflow';
import { createAdminClient } from '@/lib/supabase/admin';

// Vercel Hobby 上限 300s，依赖并行分块策略压缩 wall-time
export const maxDuration = 300;

export const metadata = { title: '试卷录入工作台 · AuMath' };

const BUCKET_CONFIG = {
  public:           false,
  fileSizeLimit:    52428800,
  allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as string[],
};

/** 确保 paper-uploads bucket 存在。首次访问时自动创建，幂等。 */
async function ensureBucket() {
  try {
    const supabase = createAdminClient();
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) {
      console.error('[ensureBucket] listBuckets 失败:', listErr.message);
      return;
    }
    const exists = buckets?.some(b => b.id === 'paper-uploads');
    if (!exists) {
      const { error: createErr } = await supabase.storage.createBucket('paper-uploads', BUCKET_CONFIG);
      if (createErr) console.error('[ensureBucket] createBucket 失败:', createErr.message);
      else console.log('[ensureBucket] paper-uploads bucket 创建成功');
    }
  } catch (e) {
    console.error('[ensureBucket] 未捕获异常:', e);
  }
}

export default async function PaperUploadPage() {
  await ensureBucket();

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <a href="/" className="hover:text-foreground transition-colors">首页</a>
            <span>/</span>
            <span>试卷录入</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            试卷录入工作台
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            上传试卷照片或 PDF → AI 识别题目并生成 LaTeX → 双屏校对 → 一键入库
          </p>
        </header>

        <PaperUploadWorkflow />
      </div>
    </main>
  );
}
