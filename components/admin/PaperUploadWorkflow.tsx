'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  processPaper, extractAnswers, createUploadUrl, createReadUrl,
  publishPaperBundles, detectDuplicatePapers,
  type ExtractedPaperBundle, type ExtractedQuestion, type DuplicatePaperInfo, type DuplicateStrategy,
} from '@/app/actions/process-paper';
import { autoFiguresFromDoc } from '@/app/actions/cv-tikz';
import { uploadFigureImage, uploadFigureSvg } from '@/app/actions/figure-image';

type FigureMode = 'image' | 'cloud-vector';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  ChevronRight,
  Sparkles,
  ListChecks,
  BookOpen,
  SendHorizonal,
} from 'lucide-react';

// DualPaneEditor 体积较大，懒加载避免首屏负担
const DualPaneEditor = dynamic(
  () => import('@/components/admin/DualPaneEditor'),
  { ssr: false, loading: () => <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> },
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface UploadedFile {
  storagePath: string;
  signedUrl:   string;
  fileType:    'pdf' | 'image';
  fileName:    string;
}

// 每个文件在 Dropzone 内的上传状态（多文件并行）
type FileUploadStatus =
  | { name: string; status: 'uploading' }
  | { name: string; status: 'done'; file: UploadedFile }
  | { name: string; status: 'error'; message: string };

type WorkflowStep = 1 | 2 | 3;

// 录入模式：仅题目（多文件并行）/ 题目+答案配对
type ImportMode = 'questions-only' | 'paired';

// 交给 AiExtractPanel 的提取任务
type ExtractJob =
  | { mode: 'questions-only'; files: UploadedFile[] }
  | { mode: 'paired'; questionFile: UploadedFile; answerFile: UploadedFile };

// ── Constants ──────────────────────────────────────────────────────────────────

const BUCKET = 'paper-uploads';
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const ACCEPT = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

const STEPS: { label: string; desc: string }[] = [
  { label: '上传试卷', desc: 'PDF / 图片直传云端' },
  { label: 'AI 提取', desc: '视觉模型识别 + LaTeX 清洗' },
  { label: '校对入库', desc: '双屏编辑 → 发布' },
];

// ── Step Indicator ─────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: WorkflowStep }) {
  return (
    <ol className="mb-8 flex items-center gap-0">
      {STEPS.map((step, idx) => {
        const num = (idx + 1) as WorkflowStep;
        const done = num < current;
        const active = num === current;
        return (
          <li key={num} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  done
                    ? 'bg-primary text-primary-foreground'
                    : active
                      ? 'border-2 border-primary text-primary'
                      : 'border-2 border-border text-muted-foreground',
                ].join(' ')}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : num}
              </div>
              <div className="text-center">
                <p className={`text-xs font-medium ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.label}
                </p>
                <p className="text-[10px] text-muted-foreground hidden sm:block">{step.desc}</p>
              </div>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`mx-2 mb-5 h-px flex-1 ${done ? 'bg-primary' : 'bg-border'}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ── Upload Success Banner ──────────────────────────────────────────────────────

function UploadSuccess({
  files,
  onReset,
  onNext,
}: {
  files: UploadedFile[];
  onReset: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <CheckCircle2 className="h-14 w-14 text-green-500" />
      <div className="text-center">
        <p className="font-semibold text-foreground">上传成功 · {files.length} 个文件</p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground max-w-md mx-auto">
          {files.map((f) => (
            <li key={f.storagePath} className="truncate">
              {f.fileType === 'pdf' ? '📄' : '🖼️'} {f.fileName}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重新上传
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          下一步：AI 提取（{files.length} 个文件）
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Dropzone ──────────────────────────────────────────────────────────────────

/** 上传单个文件：签名 URL → 直传 Storage → 生成读取 URL。失败抛错。 */
async function uploadOneFile(file: File): Promise<UploadedFile> {
  // 1. 服务端生成签名上传 URL（admin client，无需 RLS）
  const urlResult = await createUploadUrl(file.name);
  if (!urlResult.success) throw new Error(urlResult.error);

  // 2. 客户端直接 PUT 到 Supabase Storage（绕过 Vercel 4.5 MB 限制）
  const uploadRes = await fetch(urlResult.signedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!uploadRes.ok) throw new Error(`上传失败 (HTTP ${uploadRes.status})，请重试`);

  // 3. 服务端生成签名读取 URL（供 AI 提取使用）
  const readResult = await createReadUrl(urlResult.path);
  if (!readResult.success) throw new Error(`读取 URL 生成失败：${readResult.error}`);

  return {
    storagePath: urlResult.path,
    signedUrl:   readResult.signedUrl,
    fileType:    file.type === 'application/pdf' ? 'pdf' : 'image',
    fileName:    file.name,
  };
}

function PaperDropzone({
  onUploadDone,
}: {
  onUploadDone: (files: UploadedFile[]) => void;
}) {
  const [statuses, setStatuses] = useState<FileUploadStatus[]>([]);
  const [busy, setBusy] = useState(false);

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return;
    setBusy(true);
    setStatuses(accepted.map((f) => ({ name: f.name, status: 'uploading' as const })));

    // 所有文件并行上传，逐个完成时更新各自状态
    const results = await Promise.all(
      accepted.map(async (file, i): Promise<UploadedFile | null> => {
        try {
          const uploaded = await uploadOneFile(file);
          setStatuses((prev) => prev.map((s, idx) =>
            idx === i ? { name: file.name, status: 'done', file: uploaded } : s));
          return uploaded;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          setStatuses((prev) => prev.map((s, idx) =>
            idx === i ? { name: file.name, status: 'error', message } : s));
          toast.error(`${file.name} 上传失败：${message}`);
          return null;
        }
      }),
    );

    setBusy(false);
    const ok = results.filter((r): r is UploadedFile => r !== null);
    if (ok.length) onUploadDone(ok);
  }, [onUploadDone]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: MAX_BYTES,
    multiple: true,
    disabled: busy,
    onDropRejected: (rejections) => {
      const msg = rejections[0]?.errors[0]?.message ?? '文件格式或大小不符合要求';
      toast.error(msg);
    },
  });

  const zoneClass = [
    'relative flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed px-8 py-20 transition-all cursor-pointer select-none',
    isDragActive && !isDragReject
      ? 'border-primary bg-primary/5 scale-[1.01]'
      : isDragReject
        ? 'border-destructive bg-destructive/5'
        : 'border-border hover:border-primary/40 hover:bg-muted/20',
    busy ? 'pointer-events-none opacity-60' : '',
  ].join(' ');

  return (
    <div className="space-y-3">
      <div {...getRootProps()} className={zoneClass}>
        <input {...getInputProps()} />

        {busy ? (
          <>
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">
              正在并行上传 {statuses.length} 个文件到 Supabase Storage…
            </p>
            <p className="text-xs text-muted-foreground/60">文件不经过 Vercel 服务器，直传云端</p>
          </>
        ) : (
          <>
            <div className="flex items-end gap-3 text-muted-foreground/50">
              <FileText className="h-12 w-12" />
              <ImageIcon className="h-10 w-10 mb-0.5" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">
                {isDragActive ? '松开以上传' : '拖拽文件到此处，或点击选择（支持多选）'}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                支持 PDF、JPG、PNG、WebP · 单文件最大 50 MB · 可一次拖入多套试卷并行处理
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <Upload className="h-3 w-3" />
              客户端直传，绕过 Vercel 4.5 MB 限制
            </div>
          </>
        )}
      </div>

      {/* 每个文件的上传进度/结果 */}
      {statuses.length > 0 && (
        <ul className="space-y-1.5">
          {statuses.map((s, i) => (
            <li
              key={`${s.name}-${i}`}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              {s.status === 'uploading' && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
              {s.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />}
              {s.status === 'error' && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
              <span className="truncate text-foreground">{s.name}</span>
              {s.status === 'error' && (
                <span className="ml-auto shrink-0 text-xs text-destructive">{s.message}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Step 2: AI Extraction Panel ───────────────────────────────────────────────

type ExtractionState =
  | { status: 'idle' }
  | { status: 'extracting'; done: number; total: number }
  | { status: 'done'; papers: ExtractedPaperBundle[]; usedModel?: string }
  | { status: 'error'; message: string };

/** 对单个上传文件跑 AI 提取，返回其中所有试卷。结果过大时从 Storage 拉回。 */
async function extractOneFile(u: UploadedFile): Promise<{ papers: ExtractedPaperBundle[]; usedModel?: string }> {
  const result = await processPaper(u.signedUrl, u.fileType);
  if (!result.success) throw new Error(result.error);
  // 体积大时服务端把结果写到 Storage，前端 fetch 拿回——绕开 Vercel 函数 4.5MB 响应上限
  if ('resultUrl' in result) {
    const resp = await fetch(result.resultUrl);
    if (!resp.ok) throw new Error(`拉取 Storage 结果失败 (HTTP ${resp.status})`);
    const data = await resp.json() as { papers: ExtractedPaperBundle[] };
    return { papers: data.papers, usedModel: result.usedModel };
  }
  return { papers: result.papers, usedModel: result.usedModel };
}

function modelBadge(m?: string) {
  if (!m) return null;
  const label =
    m === 'flash'           ? '⚡ Flash' :
    m === 'pro'             ? '🔬 Pro 精修' :
    m === 'flash-degraded'  ? '⚡ Flash（降级）' :
    m.startsWith('flash×')  ? `⚡ ${m}（分批）` : m;
  return (
    <span className="rounded-full border border-green-300 dark:border-green-700 px-2 py-0.5 text-[10px] text-green-600 dark:text-green-400 font-mono">
      {label}
    </span>
  );
}

function AiExtractPanel({
  job,
  onDone,
  onBack,
}: {
  job: ExtractJob;
  onDone: (papers: ExtractedPaperBundle[]) => void;
  onBack: () => void;
}) {
  const [state, setState] = useState<ExtractionState>({ status: 'idle' });

  const runExtraction = useCallback(async () => {
    const papers: ExtractedPaperBundle[] = [];
    const errors: string[] = [];
    let usedModel: string | undefined;
    let total = 1;

    if (job.mode === 'paired') {
      // 配对：题面（processPaper）与答案（extractAnswers）两个独立 Server Action 并行，
      // 各自 POST 更短、结果更小，再按题号合并；答案失败则降级为仅录题目。
      total = 2;
      setState({ status: 'extracting', done: 0, total: 2 });
      let completed = 0;
      const bump = () => {
        completed += 1;
        setState((prev) => prev.status === 'extracting' ? { status: 'extracting', done: completed, total: 2 } : prev);
      };
      const [qRes, aRes] = await Promise.allSettled([
        extractOneFile(job.questionFile).finally(bump),
        extractAnswers(job.answerFile.signedUrl).finally(bump),
      ]);

      if (qRes.status === 'rejected') {
        errors.push(`题目提取失败：${qRes.reason instanceof Error ? qRes.reason.message : String(qRes.reason)}`);
      } else {
        const qPapers = qRes.value.papers;
        usedModel = qRes.value.usedModel;
        // 合并答案：按题号把 answer/analysis 填回每道题
        if (aRes.status === 'fulfilled' && aRes.value.success) {
          const amap = new Map(aRes.value.answers.map((a) => [a.question_number, a]));
          for (const p of qPapers) for (const q of p.questions) {
            if (q.question_number != null && amap.has(q.question_number)) {
              const a = amap.get(q.question_number)!;
              q.answer   = a.answer;
              q.analysis = a.analysis;
            }
          }
          usedModel = `${usedModel ?? 'flash'}·配对`;
        } else {
          const amsg = aRes.status === 'rejected'
            ? (aRes.reason instanceof Error ? aRes.reason.message : String(aRes.reason))
            : (aRes.value.success ? '' : aRes.value.error);
          toast.error(`答案未提取成功，已仅录题目（可在校对页补答案）：${amsg}`.slice(0, 160));
        }
        papers.push(...qPapers);
      }
    } else {
      // 仅题目：所有文件并行提取（每个 processPaper 都是独立的 Server Action 实例，各享 maxDuration）
      total = job.files.length;
      setState({ status: 'extracting', done: 0, total });
      let completed = 0;
      const settled = await Promise.allSettled(
        job.files.map(async (u) => {
          try {
            return await extractOneFile(u);
          } finally {
            completed += 1;
            setState((prev) => prev.status === 'extracting'
              ? { status: 'extracting', done: completed, total }
              : prev);
          }
        }),
      );
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        if (r.status === 'fulfilled') {
          papers.push(...r.value.papers);
          usedModel ??= r.value.usedModel;
        } else {
          const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
          errors.push(`${job.files[i].fileName}：${msg}`);
        }
      }
    }

    // Stale Server Action：服务端已部署新版本，旧 ID 找不到 → 自动刷新
    if (errors.some((e) => /Server Action .* was not found/i.test(e))) {
      toast.error('版本不一致：服务端已更新，正在自动刷新页面…', { duration: 2000 });
      setTimeout(() => window.location.reload(), 800);
      return;
    }

    // 全部失败 → 给出友好诊断
    if (papers.length === 0) {
      const joined = errors.join('\n') || '未提取到任何题目';
      const isQuotaExhausted = /RESOURCE_EXHAUSTED|prepayment|depleted|billing/i.test(joined);
      const isProxyDown = /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(joined);
      const isTimeoutLike = /Failed to fetch|NetworkError|timeout|aborted/i.test(joined);
      const friendly = isQuotaExhausted
        ? `Gemini API 余额 / 配额耗尽。\n\n解决方法：\n① 到 https://ai.studio/projects 给当前项目充值\n② 或到 https://aistudio.google.com/apikey 创建新的免费 key，换掉 .env.local 里的 GEMINI_API_KEY 后重启 dev\n③ 免费 tier 有每分钟 / 每天的配额，过一会儿可能自动恢复\n\n原始错误：\n${joined}`
        : isProxyDown
        ? `代理或网络不可达。\n\n检查：\n① Clash Verge / ClashX 是否在运行\n② .env.local 里的 HTTPS_PROXY 端口（默认 7897）是否和代理软件实际端口一致\n\n原始错误：\n${joined}`
        : isTimeoutLike
        ? `网络中断或处理超时。\n\n建议：\n① **Cmd+Shift+R 强制刷新**\n② 或把 PDF 拆小后重传\n\n原始错误：\n${joined}`
        : joined;
      setState({ status: 'error', message: friendly });
      toast.error('AI 提取失败，详情见下方说明');
      return;
    }

    // 部分失败 → 提示失败的文件，其余正常进入下一步
    if (errors.length) {
      toast.error(`${errors.length} 个文件提取失败，其余已完成`);
    }
    const badge = (job.mode === 'questions-only' && total > 1)
      ? `${usedModel ?? 'flash'}·${total}文件`
      : usedModel;
    setState({ status: 'done', papers, usedModel: badge });
  }, [job]);

  useEffect(() => { runExtraction(); }, [runExtraction]);

  return (
    <div className="space-y-6">
      {state.status === 'extracting' && (
        <div className="flex flex-col items-center gap-4 py-20">
          <div className="relative">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-yellow-500" />
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground">
              {job.mode === 'paired'
                ? '正在用 Gemini 2.5 Flash 提取题目，并按题号从答案卷照抄答案与解析（不自行解题）…'
                : state.total > 1
                  ? `正在并行提取 ${state.total} 个文件（已完成 ${state.done}/${state.total}）…`
                  : '正在用 Gemini 2.5 Flash 极速转写文字与 LaTeX（仅转写题面，不自行解题）…'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">AI 正在识别 LaTeX 公式并通过 AST 管线清洗…</p>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="space-y-4 py-8">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <pre className="mx-auto max-w-2xl whitespace-pre-wrap text-left text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-4 font-sans leading-relaxed">{state.message}</pre>
          <div className="flex justify-center gap-3">
            <button onClick={onBack} className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
              <RotateCcw className="h-3.5 w-3.5" /> 重新上传
            </button>
            <button onClick={runExtraction} className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Sparkles className="h-3.5 w-3.5" /> 重试提取
            </button>
          </div>
        </div>
      )}

      {state.status === 'done' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">
                提取完成：{state.papers.length} 套试卷，共 {state.papers.reduce((s, p) => s + p.questions.length, 0)} 道题
              </span>
              {modelBadge(state.usedModel)}
            </div>
            <button
              onClick={() => onDone(state.papers)}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <ListChecks className="h-4 w-4" />
              {state.papers.length === 1 ? '进入校对编辑器' : '进入多卷发布面板'}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* 试卷列表预览 */}
          <ul className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {state.papers.map((paper, pi) => (
              <li key={pi} className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium text-sm text-foreground">
                    {paper.paper_title ?? `试卷 ${pi + 1}`}
                  </span>
                  {paper.paper_year && (
                    <span className="text-xs text-muted-foreground">{paper.paper_year}</span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground font-mono">
                    {paper.questions.length} 题
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1 font-mono">
                  {paper.questions[0]?.content ?? '（无题目预览）'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Step 3b: 多卷批量发布面板 ──────────────────────────────────────────────────

type BulkPublishState =
  | { status: 'idle' }
  | { status: 'publishing' }
  | { status: 'done'; publishedPapers: number; totalQuestions: number };

function MultiBulkPublisher({
  papers,
  onReset,
}: {
  papers: ExtractedPaperBundle[];
  onReset: () => void;
}) {
  const [publishState, setPublishState] = useState<BulkPublishState>({ status: 'idle' });
  const [activePapers, setActivePapers] = useState<boolean[]>(papers.map(() => true));
  const [dupModal, setDupModal] = useState<{ duplicates: DuplicatePaperInfo[]; selected: ExtractedPaperBundle[] } | null>(null);

  const selectedPapers = papers.filter((_, i) => activePapers[i]);

  const handleStaleAction = useCallback((msg: string): boolean => {
    if (/Server Action .* was not found/i.test(msg)) {
      toast.error('版本不一致：服务端已更新，正在自动刷新页面…', { duration: 2000 });
      setTimeout(() => window.location.reload(), 800);
      return true;
    }
    return false;
  }, []);

  const runPublish = useCallback(async (selected: ExtractedPaperBundle[], strategy: DuplicateStrategy) => {
    setPublishState({ status: 'publishing' });
    try {
      const result = await publishPaperBundles(selected, strategy);
      if (!result.success) {
        toast.error(`发布失败：${result.error}`);
        setPublishState({ status: 'idle' });
        return;
      }
      const failed  = result.results.filter(r => r.error);
      const skipped = result.results.filter(r => r.skipped);
      if (failed.length) toast.error(`${failed.length} 套试卷发布失败，其余已入库`);
      else if (skipped.length) toast.success(`成功发布 ${result.publishedPapers} 套（跳过 ${skipped.length} 套重名）`);
      else toast.success(`全部 ${result.publishedPapers} 套试卷发布成功，共 ${result.totalQuestions} 道题`);
      setPublishState({ status: 'done', publishedPapers: result.publishedPapers, totalQuestions: result.totalQuestions });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (handleStaleAction(msg)) return;
      toast.error(`发布异常：${msg}`);
      setPublishState({ status: 'idle' });
    }
  }, [handleStaleAction]);

  const handlePublishAll = useCallback(async () => {
    if (!selectedPapers.length) { toast.error('请至少选择一套试卷'); return; }
    setPublishState({ status: 'publishing' });

    // 先做重名预检
    try {
      const detect = await detectDuplicatePapers(selectedPapers);
      if (detect.success && detect.duplicates.length > 0) {
        setDupModal({ duplicates: detect.duplicates, selected: selectedPapers });
        setPublishState({ status: 'idle' });
        return;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (handleStaleAction(msg)) return;
      console.warn('[detectDuplicatePapers] failed:', msg);
    }
    await runPublish(selectedPapers, 'skip');
  }, [selectedPapers, runPublish, handleStaleAction]);

  if (publishState.status === 'done') {
    return (
      <div className="flex flex-col items-center gap-6 py-10">
        <CheckCircle2 className="h-14 w-14 text-green-500" />
        <div className="text-center">
          <p className="font-semibold text-foreground">发布完成</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {publishState.publishedPapers} 套试卷 · {publishState.totalQuestions} 道题已入库
          </p>
        </div>
        <button onClick={onReset} className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
          <RotateCcw className="h-3.5 w-3.5" /> 继续上传
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 试卷勾选列表（难度改为发布后由用户众包评分，这里不再设置） */}
      <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {papers.map((paper, i) => (
          <li key={i} className={['rounded-lg border p-4 transition-colors', activePapers[i] ? 'bg-muted/30' : 'opacity-50'].join(' ')}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={activePapers[i]}
                onChange={e => setActivePapers(prev => prev.map((v, idx) => idx === i ? e.target.checked : v))}
                className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-foreground">
                    {paper.paper_title ?? `试卷 ${i + 1}`}
                  </span>
                  {paper.paper_year && <span className="text-xs text-muted-foreground">{paper.paper_year}</span>}
                  {paper.paper_type && (
                    <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                      {paper.paper_type === 'real' ? '真题' : '模拟'}
                    </span>
                  )}
                  <span className="ml-auto text-xs font-mono text-muted-foreground">{paper.questions.length} 题</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-1 font-mono">
                  {paper.questions[0]?.content ?? ''}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* 发布按钮 */}
      <div className="flex items-center justify-between pt-2 border-t">
        <span className="text-sm text-muted-foreground">
          已选 {selectedPapers.length}/{papers.length} 套 · 共 {selectedPapers.reduce((s, p) => s + p.questions.length, 0)} 道题
        </span>
        <button
          onClick={handlePublishAll}
          disabled={publishState.status === 'publishing' || !selectedPapers.length}
          className="flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {publishState.status === 'publishing'
            ? <><Loader2 className="h-4 w-4 animate-spin" /> 发布中…</>
            : <><SendHorizonal className="h-4 w-4" /> 一键全部发布</>}
        </button>
      </div>

      {/* 重名确认 modal */}
      {dupModal && (
        <DuplicateConfirmModal
          duplicates={dupModal.duplicates}
          onClose={() => setDupModal(null)}
          onSkip={() => { const m = dupModal; setDupModal(null); runPublish(m.selected, 'skip'); }}
          onReplace={() => { const m = dupModal; setDupModal(null); runPublish(m.selected, 'replace'); }}
        />
      )}
    </div>
  );
}

function DuplicateConfirmModal({
  duplicates,
  onClose,
  onSkip,
  onReplace,
}: {
  duplicates: DuplicatePaperInfo[];
  onClose: () => void;
  onSkip: () => void;
  onReplace: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          <h2 className="font-semibold text-foreground">检测到 {duplicates.length} 套同名试卷已在题库中</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          为防止数据重复，请选择处理方式：
        </p>
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 mb-5 text-sm">
          {duplicates.map(d => (
            <li key={d.existingId} className="px-3 py-2 flex items-center justify-between">
              <span className="truncate">{d.title}{d.year ? ` · ${d.year}` : ''}</span>
              <span className="text-xs text-muted-foreground shrink-0 ml-3">已含 {d.existingCount} 题</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-3 gap-2.5">
          <button
            onClick={onClose}
            className="rounded-xl py-2.5 text-sm font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onSkip}
            title="保留旧试卷，只发布不重名的"
            className="rounded-xl py-2.5 text-sm font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            跳过重名
          </button>
          <button
            onClick={onReplace}
            title="删除旧的试卷与其全部题目，用新的覆盖"
            className="rounded-xl py-2.5 text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 active:scale-95 transition-all"
          >
            替换旧试卷
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 单文件拖拽区（配对模式用：试题卷 / 答案卷各一个）─────────────────────────────

function SingleFileDropzone({
  label, hint, file, onUploaded,
}: {
  label: string;
  hint: string;
  file: UploadedFile | null;
  onUploaded: (f: UploadedFile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    setBusy(true); setError(null);
    try {
      onUploaded(await uploadOneFile(f));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(`${label}上传失败：${msg}`);
    } finally { setBusy(false); }
  }, [label, onUploaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPT, maxSize: MAX_BYTES, multiple: false, disabled: busy,
  });

  return (
    <div className="flex-1">
      <p className="mb-1.5 text-xs font-semibold text-foreground">{label}</p>
      <div
        {...getRootProps()}
        className={[
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center cursor-pointer transition-all select-none',
          isDragActive ? 'border-primary bg-primary/5'
            : file ? 'border-green-400/60 bg-green-50/40 dark:bg-green-900/10'
            : 'border-border hover:border-primary/40 hover:bg-muted/20',
          busy ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        <input {...getInputProps()} />
        {busy ? <Loader2 className="h-6 w-6 animate-spin text-primary" />
          : file ? <CheckCircle2 className="h-6 w-6 text-green-500" />
          : <FileText className="h-6 w-6 text-muted-foreground/50" />}
        <p className="text-sm text-foreground truncate max-w-full">
          {busy ? '上传中…'
            : file ? `${file.fileType === 'pdf' ? '📄' : '🖼️'} ${file.fileName}`
            : (isDragActive ? '松开以上传' : hint)}
        </p>
        {file && !busy && <p className="text-[11px] text-muted-foreground">点击可重新选择</p>}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── 配对上传：试题卷 + 答案卷 ───────────────────────────────────────────────────

function PairedUpload({
  questionFile, answerFile, onQuestion, onAnswer, onReset, onNext,
}: {
  questionFile: UploadedFile | null;
  answerFile:   UploadedFile | null;
  onQuestion: (f: UploadedFile) => void;
  onAnswer:   (f: UploadedFile) => void;
  onReset: () => void;
  onNext:  () => void;
}) {
  const ready = !!questionFile && !!answerFile;
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <SingleFileDropzone label="① 试题卷 PDF" hint="拖入或点击选择试题文件" file={questionFile} onUploaded={onQuestion} />
        <SingleFileDropzone label="② 答案卷 PDF" hint="拖入或点击选择答案 / 参考答案文件" file={answerFile} onUploaded={onAnswer} />
      </div>
      <p className="text-xs text-muted-foreground">
        两份都上传后进入提取：题目从试题卷读取，答案与解析按题号从答案卷<strong>照抄</strong>（选填只录答案、大题录完整解答并含全部解法），<strong>不会让 AI 自行解题</strong>。
      </p>
      <div className="flex justify-end gap-3">
        <button onClick={onReset} className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
          <RotateCcw className="h-3.5 w-3.5" /> 重置
        </button>
        <button
          onClick={onNext}
          disabled={!ready}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          下一步：AI 提取 <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Main Workflow Orchestrator ─────────────────────────────────────────────────

const DRAFT_KEY = 'aumath_paper_draft_v2';

/** 抽取后自动识别几何图，裁出原图传 Storage，按题号以 ![](url) 合进对应题。
 *  无损位图路线：和原卷一模一样、零畸变。CV 服务失败则原样返回，不阻断录题。 */
async function enrichPapersWithFigures(
  papers: ExtractedPaperBundle[],
  files: UploadedFile[],
  mode: FigureMode,
): Promise<{ papers: ExtractedPaperBundle[]; merged: number; unassigned: number }> {
  const byQuestion = new Map<number, string[]>(); // question_number -> [图片URL]
  let unassigned = 0;
  for (const f of files) {
    const res = await autoFiguresFromDoc(f.signedUrl, f.fileType, { mode, vectorize: false });
    if (!res.success) continue;
    for (const fig of res.figures) {
      if (fig.question_number == null) { unassigned++; continue; }
      // cloud-vector：优先用云端 8B 编译的 SVG；失败/位图模式则用裁剪原图兜底（绝不丢图）
      let url: string | null = null;
      if (mode === 'cloud-vector' && fig.svg) {
        const up = await uploadFigureSvg(fig.svg);
        if (up.success) url = up.url;
      }
      if (!url && fig.crop_base64) {
        const up = await uploadFigureImage(fig.crop_base64);
        if (up.success) url = up.url;
      }
      if (!url) continue;
      const arr = byQuestion.get(fig.question_number) ?? [];
      arr.push(url);
      byQuestion.set(fig.question_number, arr);
    }
  }
  if (byQuestion.size === 0) return { papers, merged: 0, unassigned };

  let merged = 0;
  const out = papers.map(p => ({
    ...p,
    questions: p.questions.map((q: ExtractedQuestion) => {
      const urls = q.question_number != null ? byQuestion.get(q.question_number) : undefined;
      if (!urls?.length) return q;
      merged += urls.length;
      return { ...q, content: `${q.content}${urls.map(u => `\n\n![几何图](${u})`).join('')}` };
    }),
  }));
  return { papers: out, merged, unassigned };
}

export default function PaperUploadWorkflow() {
  const [step, setStep] = useState<WorkflowStep>(1);
  const [mode, setMode] = useState<ImportMode>('questions-only');
  const [uploadResults, setUploadResults] = useState<UploadedFile[]>([]);
  const [questionFile, setQuestionFile] = useState<UploadedFile | null>(null);
  const [answerFile, setAnswerFile] = useState<UploadedFile | null>(null);
  const [extractedPapers, setExtractedPapers] = useState<ExtractedPaperBundle[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [figureMode, setFigureMode] = useState<FigureMode>('image');

  // 恢复草稿
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as ExtractedPaperBundle[];
      if (Array.isArray(saved) && saved.length > 0) {
        setExtractedPapers(saved);
        setStep(3);
      }
    } catch {}
  }, []);

  const handleUploadDone = useCallback((files: UploadedFile[]) => {
    setUploadResults(files);
  }, []);

  const clearUploads = useCallback(() => {
    setUploadResults([]);
    setQuestionFile(null);
    setAnswerFile(null);
  }, []);

  const handleReset = useCallback(() => {
    clearUploads();
    setExtractedPapers([]);
    setStep(1);
    try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
  }, [clearUploads]);

  // 切模式时清掉已传文件，避免两套状态混淆
  const switchMode = useCallback((next: ImportMode) => {
    setMode(next);
    clearUploads();
  }, [clearUploads]);

  const handleNextStep = useCallback(() => setStep(2), []);

  const handleExtractionDone = useCallback(async (papers: ExtractedPaperBundle[]) => {
    // 抽取完文字后，自动识别几何图并按题号合进对应题（图文分离的「图」这步补回）
    const figureFiles = mode === 'paired' ? (questionFile ? [questionFile] : []) : uploadResults;
    let finalPapers = papers;
    if (figureFiles.length > 0) {
      setEnriching(true);
      try {
          const { papers: enriched, merged, unassigned } = await enrichPapersWithFigures(papers, figureFiles, figureMode);
        finalPapers = enriched;
        if (merged > 0) {
          toast.success(`自动识别并插入 ${merged} 张几何图${unassigned ? `（另有 ${unassigned} 张未能归属，可在编辑器手动插入）` : ''}`);
        } else if (unassigned > 0) {
          toast.info(`检测到 ${unassigned} 张图但未能自动归属，请用「插入几何图」手动放置`);
        }
      } catch {
        /* CV 服务不可用则跳过，不阻断录题 */
      }
      setEnriching(false);
    }
    setExtractedPapers(finalPapers);
    setStep(3);
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(finalPapers)); } catch {}
  }, [mode, questionFile, uploadResults, figureMode]);

  // Step 2 的提取任务
  const job: ExtractJob | null =
    mode === 'paired'
      ? (questionFile && answerFile ? { mode: 'paired', questionFile, answerFile } : null)
      : (uploadResults.length > 0 ? { mode: 'questions-only', files: uploadResults } : null);

  return (
    <div>
      <StepIndicator current={step} />

      {enriching && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 正在自动识别几何图并插入对应题…（本地 CV）
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">第一步：上传试卷文件</h2>

          {/* 模式切换 */}
          <div className="mb-5 inline-flex rounded-lg border bg-muted/40 p-1 text-sm">
            {([
              ['questions-only', '仅题目'],
              ['paired', '题目 + 答案配对'],
            ] as [ImportMode, string][]).map(([m, label]) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={[
                  'rounded-md px-4 py-1.5 font-medium transition-colors',
                  mode === m ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 几何图处理方式 */}
          <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-4 py-3 text-sm">
            <span className="text-muted-foreground">几何图：</span>
            {([
              ['image', '无损位图（快·稳）'],
              ['cloud-vector', '云端矢量 8B（最优·慢）'],
            ] as [FigureMode, string][]).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setFigureMode(m)}
                className={[
                  'rounded-md px-3 py-1 font-medium transition-colors',
                  figureMode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
            <span className="text-xs text-muted-foreground">
              {figureMode === 'cloud-vector'
                ? '调云端 DeTikZify-8B 生成干净矢量；逐图较慢、走代理，失败自动回退位图'
                : '裁出原图嵌入，和原卷一致'}
            </span>
          </div>

          {mode === 'questions-only' ? (
            uploadResults.length > 0 ? (
              <UploadSuccess files={uploadResults} onReset={handleReset} onNext={handleNextStep} />
            ) : (
              <PaperDropzone onUploadDone={handleUploadDone} />
            )
          ) : (
            <PairedUpload
              questionFile={questionFile}
              answerFile={answerFile}
              onQuestion={setQuestionFile}
              onAnswer={setAnswerFile}
              onReset={handleReset}
              onNext={handleNextStep}
            />
          )}
        </section>
      )}

      {/* Step 2: AI Extraction */}
      {step === 2 && job && (
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">第二步：AI 视觉提取</h2>
          <AiExtractPanel
            job={job}
            onDone={handleExtractionDone}
            onBack={handleReset}
          />
        </section>
      )}

      {/* Step 3: 单卷精编 or 多卷批量发布 */}
      {step === 3 && extractedPapers.length > 0 && (
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {extractedPapers.length === 1 ? '第三步：校对并入库' : `第三步：批量发布（${extractedPapers.length} 套试卷）`}
          </h2>
          {extractedPapers.length === 1 ? (
            <DualPaneEditor
              initialQuestions={extractedPapers[0].questions}
              initialPaperTitle={extractedPapers[0].paper_title}
              initialPaperYear={extractedPapers[0].paper_year}
              initialPaperType={extractedPapers[0].paper_type}
              initialPaperGrade={extractedPapers[0].paper_grade}
              onReset={handleReset}
            />
          ) : (
            <MultiBulkPublisher papers={extractedPapers} onReset={handleReset} />
          )}
        </section>
      )}
    </div>
  );
}
