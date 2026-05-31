'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  processPaper, createUploadUrl, createReadUrl,
  publishPaperBundles, detectDuplicatePapers,
  type ExtractedPaperBundle, type DuplicatePaperInfo, type DuplicateStrategy,
} from '@/app/actions/process-paper';
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

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'done'; storagePath: string; signedUrl: string; fileType: 'pdf' | 'image'; fileName: string }
  | { status: 'error'; message: string };

type WorkflowStep = 1 | 2 | 3;

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
  state,
  onReset,
  onNext,
}: {
  state: Extract<UploadState, { status: 'done' }>;
  onReset: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <CheckCircle2 className="h-14 w-14 text-green-500" />
      <div className="text-center">
        <p className="font-semibold text-foreground">上传成功</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {state.fileType === 'pdf' ? '📄' : '🖼️'} {state.fileName}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60 font-mono break-all max-w-xs">
          {state.storagePath}
        </p>
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
          下一步：AI 提取
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Dropzone ──────────────────────────────────────────────────────────────────

function PaperDropzone({
  onUploadDone,
}: {
  onUploadDone: (state: Extract<UploadState, { status: 'done' }>) => void;
}) {
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });

  const handleUpload = useCallback(async (file: File) => {
    setUploadState({ status: 'uploading' });
    try {
      // 1. 服务端生成签名上传 URL（admin client，无需 RLS）
      const urlResult = await createUploadUrl(file.name);
      if (!urlResult.success) {
        setUploadState({ status: 'error', message: urlResult.error });
        toast.error(`上传失败：${urlResult.error}`);
        return;
      }

      // 2. 客户端直接 PUT 到 Supabase Storage（绕过 Vercel 4.5 MB 限制）
      const uploadRes = await fetch(urlResult.signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!uploadRes.ok) {
        const msg = `上传失败 (HTTP ${uploadRes.status})，请重试`;
        setUploadState({ status: 'error', message: msg });
        toast.error(msg);
        return;
      }

      // 3. 服务端生成签名读取 URL（供 AI 提取使用）
      const readResult = await createReadUrl(urlResult.path);
      if (!readResult.success) {
        setUploadState({ status: 'error', message: readResult.error });
        toast.error(`读取 URL 生成失败：${readResult.error}`);
        return;
      }

      const fileType: 'pdf' | 'image' = file.type === 'application/pdf' ? 'pdf' : 'image';
      const doneState: Extract<UploadState, { status: 'done' }> = {
        status: 'done',
        storagePath: urlResult.path,
        signedUrl: readResult.signedUrl,
        fileType,
        fileName: file.name,
      };
      setUploadState(doneState);
      onUploadDone(doneState);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setUploadState({ status: 'error', message: `上传异常：${msg}` });
      toast.error(`文件上传失败：${msg}`);
    }
  }, [onUploadDone]);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) handleUpload(accepted[0]);
    },
    [handleUpload],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: MAX_BYTES,
    maxFiles: 1,
    disabled: uploadState.status === 'uploading',
    onDropRejected: (rejections) => {
      const msg = rejections[0]?.errors[0]?.message ?? '文件格式或大小不符合要求';
      setUploadState({ status: 'error', message: msg });
    },
  });

  const zoneClass = [
    'relative flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed px-8 py-20 transition-all cursor-pointer select-none',
    isDragActive && !isDragReject
      ? 'border-primary bg-primary/5 scale-[1.01]'
      : isDragReject
        ? 'border-destructive bg-destructive/5'
        : 'border-border hover:border-primary/40 hover:bg-muted/20',
    uploadState.status === 'uploading' ? 'pointer-events-none opacity-60' : '',
  ].join(' ');

  return (
    <div className="space-y-3">
      <div {...getRootProps()} className={zoneClass}>
        <input {...getInputProps()} />

        {uploadState.status === 'uploading' ? (
          <>
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">正在上传到 Supabase Storage…</p>
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
                {isDragActive ? '松开以上传' : '拖拽文件到此处，或点击选择'}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                支持 PDF、JPG、PNG、WebP · 单文件最大 50 MB
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <Upload className="h-3 w-3" />
              客户端直传，绕过 Vercel 4.5 MB 限制
            </div>
          </>
        )}
      </div>

      {uploadState.status === 'error' && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {uploadState.message}
        </div>
      )}
    </div>
  );
}

// ── Step 2: AI Extraction Panel ───────────────────────────────────────────────

type ExtractionState =
  | { status: 'idle' }
  | { status: 'extracting'; hint: string }
  | { status: 'done'; papers: ExtractedPaperBundle[]; usedModel?: string }
  | { status: 'error'; message: string };

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
  uploadResult,
  onDone,
  onBack,
}: {
  uploadResult: Extract<UploadState, { status: 'done' }>;
  onDone: (papers: ExtractedPaperBundle[]) => void;
  onBack: () => void;
}) {
  const [state, setState] = useState<ExtractionState>({ status: 'idle' });

  const runExtraction = useCallback(async () => {
    setState({ status: 'extracting', hint: uploadResult.fileType === 'pdf' ? '正在用 Gemini 2.5 Flash 极速提取文字与 LaTeX（已剥离 SVG 生成，单次 5-15 秒）…' : '正在识别图片…' });
    try {
      const result = await processPaper(uploadResult.signedUrl, uploadResult.fileType);
      if (!result.success) {
        setState({ status: 'error', message: result.error });
        toast.error(`AI 提取失败：${result.error}`);
        return;
      }
      // 体积大时服务端把结果写到 Storage，前端 fetch 拿回——绕开 Vercel 函数 4.5MB 响应上限
      if ('resultUrl' in result) {
        setState({ status: 'extracting', hint: `结果较大（${result.paperCount} 套 / ${result.questionCount} 题），从 Storage 拉取…` });
        const resp = await fetch(result.resultUrl);
        if (!resp.ok) throw new Error(`拉取 Storage 结果失败 (HTTP ${resp.status})`);
        const data = await resp.json() as { papers: ExtractedPaperBundle[] };
        setState({ status: 'done', papers: data.papers, usedModel: result.usedModel });
      } else {
        setState({ status: 'done', papers: result.papers, usedModel: result.usedModel });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Stale Server Action：服务端已部署新版本，旧 ID 找不到 → 自动刷新
      if (/Server Action .* was not found/i.test(msg)) {
        toast.error('版本不一致：服务端已更新，正在自动刷新页面…', { duration: 2000 });
        setTimeout(() => window.location.reload(), 800);
        return;
      }
      const isTimeoutLike = /Failed to fetch|NetworkError|timeout|aborted/i.test(msg);
      const isPayloadIssue = /unexpected response|Body exceeded|Payload Too Large|413/i.test(msg);
      const isQuotaExhausted = /RESOURCE_EXHAUSTED|prepayment|depleted|billing/i.test(msg);
      const isProxyDown = /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(msg);
      const friendly = isQuotaExhausted
        ? `Gemini API 余额 / 配额耗尽（${msg.slice(0, 200)}…）。\n\n解决方法：\n① 到 https://ai.studio/projects 给当前项目充值\n② 或到 https://aistudio.google.com/apikey 创建新的免费 key，换掉 .env.local 里的 GEMINI_API_KEY 后重启 dev\n③ 免费 tier 有每分钟 / 每天的配额，过一会儿可能自动恢复`
        : isProxyDown
        ? `代理或网络不可达（${msg}）。\n\n检查：\n① Clash Verge / ClashX 是否在运行\n② .env.local 里的 HTTPS_PROXY 端口（默认 7897）是否和代理软件的实际端口一致\n③ \`scutil --proxy | grep HTTPPort\` 看真实端口`
        : isPayloadIssue
        ? `服务端返回异常（${msg}）。\n\n最可能的原因：\n• 提取出的题目太多 / SVG 太复杂，JSON 响应体积超过 Server Action 上限\n• 服务端函数中途崩溃\n\n解决方法：\n① **Cmd+Shift+R 强制刷新**（确保拿到带 15MB 上限的最新版）\n② 如果刷新后还不行：把 PDF 拆成 2-3 套试卷一份分批上传\n③ 或先点「重试提取」，分块路径每块小、容易过`
        : isTimeoutLike
        ? `网络中断或处理超时（${msg}）。\n\n建议：\n① **Cmd+Shift+R 强制刷新**\n② 或把 PDF 拆小后重传`
        : `请求异常：${msg}`;
      setState({ status: 'error', message: friendly });
      toast.error('AI 提取失败，详情见下方说明');
    }
  }, [uploadResult]);

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
            <p className="font-medium text-foreground">{state.hint}</p>
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

// ── Main Workflow Orchestrator ─────────────────────────────────────────────────

const DRAFT_KEY = 'aumath_paper_draft_v2';

export default function PaperUploadWorkflow() {
  const [step, setStep] = useState<WorkflowStep>(1);
  const [uploadResult, setUploadResult] = useState<Extract<UploadState, { status: 'done' }> | null>(null);
  const [extractedPapers, setExtractedPapers] = useState<ExtractedPaperBundle[]>([]);

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

  const handleUploadDone = useCallback((state: Extract<UploadState, { status: 'done' }>) => {
    setUploadResult(state);
  }, []);

  const handleReset = useCallback(() => {
    setUploadResult(null);
    setExtractedPapers([]);
    setStep(1);
    try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
  }, []);

  const handleNextStep = useCallback(() => setStep(2), []);

  const handleExtractionDone = useCallback((papers: ExtractedPaperBundle[]) => {
    setExtractedPapers(papers);
    setStep(3);
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(papers)); } catch {}
  }, []);

  return (
    <div>
      <StepIndicator current={step} />

      {/* Step 1: Upload */}
      {step === 1 && (
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">第一步：上传试卷文件</h2>
          {uploadResult ? (
            <UploadSuccess state={uploadResult} onReset={handleReset} onNext={handleNextStep} />
          ) : (
            <PaperDropzone onUploadDone={handleUploadDone} />
          )}
        </section>
      )}

      {/* Step 2: AI Extraction */}
      {step === 2 && uploadResult && (
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-foreground">第二步：AI 视觉提取</h2>
          <AiExtractPanel
            uploadResult={uploadResult}
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
