'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  processPaper, extractAnswers, createUploadUrl, createReadUrl,
  publishPaperBundles, detectDuplicatePapers,
  type ExtractedPaperBundle, type ExtractedQuestion, type DuplicatePaperInfo, type DuplicateStrategy,
} from '@/app/actions/process-paper';
import { uploadFigureImage } from '@/app/actions/figure-image';
import { detectPageFigures } from '@/app/actions/detect-figures';
import {
  rasterizePdfPages,
  rasterizeImageUrl,
  canvasToDetectBase64,
  cropBox,
  toXYXY,
  type PageRaster,
} from '@/lib/paper/figure-extract';
import { screenshotToTikz } from '@/app/actions/screenshot-tikz';
import { compileTikzAction, uploadTikzFigureAction } from '@/app/actions/tikz';

type FigureMode = 'image' | 'cloud-vector';

interface DetectedFigure {
  url: string;
  question_number: number | null;
  page: number | null;
}

// 几何图识别的实时进度（在第二步与 Gemini 提取并行展示）
type FigureState =
  | { status: 'idle' }
  | { status: 'skipped' }                          // 没有可检图的文件
  | { status: 'running'; detected: number; percent?: number }  // 检测中：已上传 N 张 + 整卷扫描百分比
  | { status: 'done'; detected: number; merged: number; unassigned: number }
  | { status: 'error'; message: string };
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
    <ol className="mb-6 flex items-center gap-0 opacity-60">
      {STEPS.map((step, idx) => {
        const num = (idx + 1) as WorkflowStep;
        const done = num < current;
        const active = num === current;
        return (
          <li key={num} className="flex flex-1 items-center">
            <div className="flex items-center gap-1.5">
              <div
                className={[
                  'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                  done
                    ? 'bg-primary text-primary-foreground'
                    : active
                      ? 'border-2 border-primary text-primary'
                      : 'border-2 border-border text-muted-foreground',
                ].join(' ')}
              >
                {done ? <CheckCircle2 className="h-3 w-3" /> : num}
              </div>
              <span className={`text-[11px] ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`mx-2 h-px flex-1 ${done ? 'bg-primary/60' : 'bg-border'}`} />
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
          一键提取并校对（{files.length} 个文件）
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
  | { status: 'done'; papers: ExtractedPaperBundle[]; fileIdxOfPaper: number[]; usedModel?: string }
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

/** 自挂载起的秒数计时器；active=false 时停表。用于让长耗时步骤有「实时在动」的感觉。 */
function useElapsed(active: boolean): number {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  return sec;
}

type RowState = 'pending' | 'running' | 'done' | 'error';

/** 进度清单里的一行：状态图标 + 标题 + 右侧实时计数/说明。 */
function TaskRow({ state, title, detail }: { state: RowState; title: string; detail?: string }) {
  const icon =
    state === 'done'    ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
    state === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> :
    state === 'error'   ? <AlertCircle className="h-4 w-4 text-destructive" /> :
    <div className="h-4 w-4 rounded-full border-2 border-border" />;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="shrink-0">{icon}</span>
      <span className={`text-sm ${state === 'pending' ? 'text-muted-foreground' : 'text-foreground'}`}>{title}</span>
      {detail && <span className="ml-auto text-xs text-muted-foreground font-mono tabular-nums">{detail}</span>}
    </div>
  );
}

function AiExtractPanel({
  job,
  figureState,
  onDone,
  onBack,
}: {
  job: ExtractJob;
  figureState: FigureState;
  onDone: (papers: ExtractedPaperBundle[], fileIdxOfPaper: number[]) => void;
  onBack: () => void;
}) {
  const [state, setState] = useState<ExtractionState>({ status: 'idle' });
  const figRunning = figureState.status === 'running';
  const figElapsed = useElapsed(figRunning);

  const runExtraction = useCallback(async () => {
    const papers: ExtractedPaperBundle[] = [];
    const fileIdxOfPaper: number[] = []; // 与 papers 等长：每卷来自哪个上传文件（供图按卷归属）
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
        for (const p of qPapers) { papers.push(p); fileIdxOfPaper.push(0); }
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
          for (const p of r.value.papers) { papers.push(p); fileIdxOfPaper.push(i); }
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
    setState({ status: 'done', papers, fileIdxOfPaper, usedModel: badge });
  }, [job]);

  // 放进微任务回调再启动，避免 effect 体内同步 setState（runExtraction 开头会置 extracting 态）。
  useEffect(() => { queueMicrotask(() => { void runExtraction(); }); }, [runExtraction]);

  // 提取成功后自动进入校对界面（少一次点击）；ref 防 StrictMode 重复触发导致图重复插入
  const advancedRef = useRef(false);
  useEffect(() => {
    if (state.status === 'done' && !advancedRef.current) {
      advancedRef.current = true;
      onDone(state.papers, state.fileIdxOfPaper);
    }
  }, [state, onDone]);

  // ── 三行实时进度清单 ──
  const geminiRow: RowState =
    state.status === 'extracting' ? 'running' :
    state.status === 'done'       ? 'done' :
    state.status === 'error'      ? 'error' : 'pending';
  const geminiDetail =
    state.status === 'extracting' ? (state.total > 1 ? `${state.done}/${state.total} 文件` : '识别中') :
    state.status === 'done'       ? `${state.papers.length} 套 · ${state.papers.reduce((s, p) => s + p.questions.length, 0)} 题` :
    undefined;

  const figRow: RowState =
    figureState.status === 'running' ? 'running' :
    figureState.status === 'done'    ? 'done' :
    figureState.status === 'error'   ? 'error' : 'pending';
  const figPercent = figureState.status === 'running' ? (figureState.percent ?? 0)
    : figureState.status === 'done' ? 100 : 0;
  const figDetail =
    figureState.status === 'running' ? `${figPercent}% · 已识别 ${figureState.detected} 张 · ${figElapsed}s` :
    figureState.status === 'done'    ? `${figureState.detected} 张` :
    figureState.status === 'error'   ? '失败，转人工托盘' :
    figureState.status === 'skipped' ? '—' : undefined;

  // 归属行：图都到位后才结算（merged/unassigned 在 done 时有值）
  const matchRow: RowState =
    figureState.status === 'done'   ? 'done' :
    figureState.status === 'running' ? 'pending' :
    figureState.status === 'error'  ? 'error' : 'pending';
  const matchDetail =
    figureState.status === 'done'
      ? `归属 ${figureState.merged} 张${figureState.unassigned ? ` · 待放 ${figureState.unassigned}` : ''}`
      : undefined;
  const showFigRows = figureState.status !== 'skipped' && figureState.status !== 'idle';

  return (
    <div className="space-y-5">
      {/* 实时进度清单：取代旧的大转圈+营销文案 */}
      {state.status !== 'error' && (
        <div className="space-y-1.5">
          <div className="rounded-lg border bg-muted/20 px-4 py-1 divide-y divide-border/50">
            <TaskRow state={geminiRow} title="提取文字与 LaTeX 公式" detail={geminiDetail} />
            {showFigRows && <TaskRow state={figRow} title="检测几何图（本地 CV）" detail={figDetail} />}
            {showFigRows && <TaskRow state={matchRow} title="图文自动归属题号" detail={matchDetail} />}
          </div>
          {figRunning && (
            <div className="px-1 pt-0.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${figPercent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground/70">
                整卷扫描中 {figPercent}%（约 1 分钟出全部图）；进度条在动即正常运行。
              </p>
            </div>
          )}
          {state.status === 'extracting' && (
            <div className="px-1 pt-1">
              <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-foreground transition-colors">
                <RotateCcw className="h-3 w-3" /> 返回上一步（保留已传文件）
              </button>
            </div>
          )}
        </div>
      )}

      {state.status === 'error' && (
        <div className="space-y-4 py-8">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <pre className="mx-auto max-w-2xl whitespace-pre-wrap text-left text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-4 font-sans leading-relaxed">{state.message}</pre>
          <div className="flex justify-center gap-3">
            <button onClick={onBack} className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors">
              <RotateCcw className="h-3.5 w-3.5" /> 返回上一步
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
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {figRunning ? `几何图识别中（${figElapsed}s）…` : '正在进入校对…'}
            </span>
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
  figures = [],
  onReset,
  onBack,
}: {
  papers: ExtractedPaperBundle[];
  figures?: DetectedFigure[];
  onReset: () => void;
  onBack: () => void;
}) {
  const [publishState, setPublishState] = useState<BulkPublishState>({ status: 'idle' });
  const [activePapers, setActivePapers] = useState<boolean[]>(papers.map(() => true));
  const [dupModal, setDupModal] = useState<{ duplicates: DuplicatePaperInfo[]; selected: ExtractedPaperBundle[] } | null>(null);
  // 本地可变副本：人工把未归属的图插回某卷某题后，从这份发布（papers prop 不可变）
  const [editedPapers, setEditedPapers] = useState<ExtractedPaperBundle[]>(papers);

  // 未归属图托盘：自动归对的已合进 content，这里只收没认出题号的，让人工选「卷+题」插回。
  const unplacedFigures = useMemo(() => figures.filter(f => f.question_number == null), [figures]);
  const [figSel, setFigSel] = useState<Record<number, { p: number; q: number }>>({});
  const [placedFigs, setPlacedFigs] = useState<Set<number>>(new Set());

  const insertFigure = useCallback((figIdx: number, url: string) => {
    const sel = figSel[figIdx] ?? { p: 0, q: 0 };
    setEditedPapers(prev => prev.map((paper, pi) => pi !== sel.p ? paper : {
      ...paper,
      questions: paper.questions.map((qq, qi) => qi !== sel.q ? qq : { ...qq, content: `${qq.content}\n\n![几何图](${url})` }),
    }));
    setPlacedFigs(prev => new Set(prev).add(figIdx));
    const tgt = editedPapers[sel.p]?.questions[sel.q];
    toast.success(`已插入到「${editedPapers[sel.p]?.paper_title ?? `试卷${sel.p + 1}`}」第${tgt?.question_number ?? sel.q + 1}题`);
  }, [figSel, editedPapers]);

  const selectedPapers = editedPapers.filter((_, i) => activePapers[i]);

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
      {/* 未归属几何图托盘：给每张图选「试卷 + 题号」插回，避免多卷批量时丢图 */}
      {unplacedFigures.length > placedFigs.size && (
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="mb-2 text-xs text-muted-foreground">
            另有 {unplacedFigures.length - placedFigs.size} 张几何图未自动归属 —— 给每张选「试卷 + 题号」插入（自动归对的已在题里）
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {unplacedFigures.map((fig, i) => {
              if (placedFigs.has(i)) return null;
              const sel = figSel[i] ?? { p: 0, q: 0 };
              const qs = editedPapers[sel.p]?.questions ?? [];
              return (
                <div key={i} className="flex shrink-0 flex-col gap-1.5 rounded border bg-white p-2 dark:bg-zinc-900">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fig.url} alt={`图${i + 1}`} className="h-20 w-auto max-w-[140px] self-center object-contain" />
                  <select
                    value={sel.p}
                    onChange={e => setFigSel(prev => ({ ...prev, [i]: { p: Number(e.target.value), q: 0 } }))}
                    className="rounded border bg-background px-1 py-0.5 text-[11px] text-foreground"
                  >
                    {editedPapers.map((p, pi) => (
                      <option key={pi} value={pi}>{p.paper_title ?? `试卷${pi + 1}`}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    <select
                      value={sel.q}
                      onChange={e => setFigSel(prev => ({ ...prev, [i]: { p: sel.p, q: Number(e.target.value) } }))}
                      className="flex-1 rounded border bg-background px-1 py-0.5 text-[11px] text-foreground"
                    >
                      {qs.map((qq, qi) => (
                        <option key={qi} value={qi}>第{qq.question_number ?? qi + 1}题</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => insertFigure(i, fig.url)}
                      disabled={qs.length === 0}
                      className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      插入
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 试卷勾选列表（难度改为发布后由用户众包评分，这里不再设置） */}
      <ul className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {editedPapers.map((paper, i) => {
          // 批量录入分诊：渲染失败的公式数（录入期 KaTeX 校验）+ 配图缺口（期望张数 vs 已贴回）。
          const latexErrors = paper.questions.reduce((s, q) => s + (q.latex_issues ?? 0), 0);
          const expectedFigs = paper.questions.reduce((s, q) => s + (q.figure_count ?? 0), 0);
          const placedFigs = paper.questions.reduce((s, q) => s + (q.content.match(/!\[/g)?.length ?? 0), 0);
          const figDeficit = Math.max(0, expectedFigs - placedFigs);
          return (
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
                  {latexErrors > 0 && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300" title="录入期 KaTeX 渲染校验失败的公式数，建议进单卷校对修正">
                      ⚠ {latexErrors} 个公式渲染失败
                    </span>
                  )}
                  {figDeficit > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300" title={`Gemini 数出本卷应有 ${expectedFigs} 张配图，目前已贴回 ${placedFigs} 张`}>
                      缺 {figDeficit} 张图
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
          );
        })}
      </ul>

      {/* 发布按钮 */}
      <div className="flex items-center justify-between pt-2 border-t">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <RotateCcw className="h-3.5 w-3.5" /> 返回上一步
          </button>
          <span className="text-sm text-muted-foreground">
            已选 {selectedPapers.length}/{papers.length} 套 · 共 {selectedPapers.reduce((s, p) => s + p.questions.length, 0)} 道题
            {(() => {
              const totalLatexErrors = selectedPapers.reduce((s, p) => s + p.questions.reduce((t, q) => t + (q.latex_issues ?? 0), 0), 0);
              return totalLatexErrors > 0
                ? <span className="ml-2 text-red-600 dark:text-red-400">· ⚠ {totalLatexErrors} 个公式渲染失败</span>
                : null;
            })()}
          </span>
        </div>
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
          一键提取并校对 <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Main Workflow Orchestrator ─────────────────────────────────────────────────

const DRAFT_KEY = 'aumath_paper_draft_v2';

// 题干里引用图的特征词（Gemini 文字可靠，远胜扫描件 OCR 题号）
// 覆盖「如图 / 图中 / 上图·下图 / 图所示 / 示意图 / 图N」等明确指代配图的措辞——
// 漏一个就会让后续的图按阅读顺序整体错位（如「图中曲线C」未识别 → 它的图被顺延塞给下一道含「如图」的题）。
// 刻意不含「图象」——它是函数题描述曲线的高频词（如「两函数图象有相同对称轴」），并不意味着该题配了
// 几何图，否则会把图误塞给三角/函数题。注意：以上各词均不会误匹配到「图象」「图形」「试图」等。
const FIG_REF_RE = /如图|图中|[上下]图|图所示|示意图|图\s*\d+/;

/** 把一组 x 中心按间隔聚成列，返回每个的列序号（0=最左）。用于图的阅读顺序排序。 */
function columnRanks(centers: number[]): number[] {
  if (centers.length === 0) return [];
  const order = centers.map((c, i) => ({ c, i })).sort((a, b) => a.c - b.c);
  const span = order[order.length - 1].c - order[0].c;
  const gap = Math.max(span * 0.15, 1); // 间隔超过总跨度 15% 视为换列
  const rank = new Array<number>(centers.length).fill(0);
  let r = 0;
  rank[order[0].i] = 0;
  for (let k = 1; k < order.length; k++) {
    if (order[k].c - order[k - 1].c > gap) r += 1;
    rank[order[k].i] = r;
  }
  return rank;
}

type RawFigure = { url: string; box: number[]; page: number; fileIdx: number };

// 几何图逐页检测的并发度。每页一次「编码 2000px PNG→Vercel 中转→Fly YOLO→裁剪上传」，
// 串行时大的多卷文件会拖到几分钟。4 个并发先把墙钟砍数倍；Fly 扩容/多开后可再调高。
const FIGURE_DETECT_CONCURRENCY = 4;

/** 慢活：客户端 pdf.js 光栅化每页 → Gemini 视觉检测几何图 bbox → canvas 裁剪 → 上传 Storage。
 *  纯 Vercel、不依赖本地 cv-service。**与 Gemini 文字提取并行跑**（不依赖其结果，图↔题对位在
 *  matchFiguresToQuestions 里用 figure_count 配额完成）。
 *  mode='image'：裁剪原图位图入库（与原卷一致，默认）；
 *  mode='cloud-vector'：每张裁图再走 直连 HF DeTikZify → 编译 → 上传 SVG，任一步失败回退位图。
 *  onProgress：percent=按页扫描进度；detected=已上传图数。 */
async function detectAndUploadFigures(
  files: UploadedFile[],
  mode: FigureMode,
  onProgress?: (p: { detected?: number; percent?: number }) => void,
): Promise<{ raws: RawFigure[]; error?: string }> {
  const raws: RawFigure[] = [];
  let firstError: string | undefined;

  // 1) 每个文件光栅化成页 canvas（PDF 逐页；图片型单页）。统计总页数用于进度。
  const filePages: { fileIdx: number; pages: PageRaster[] }[] = [];
  for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
    const f = files[fileIdx];
    try {
      const pages = f.fileType === 'pdf'
        ? await rasterizePdfPages(f.signedUrl)
        : [await rasterizeImageUrl(f.signedUrl)];
      filePages.push({ fileIdx, pages });
    } catch (e) {
      firstError ??= `页面光栅化失败：${e instanceof Error ? e.message : String(e)}`;
    }
  }
  const totalPages = filePages.reduce((s, fp) => s + fp.pages.length, 0) || 1;
  let donePages = 0;

  // 2) 并发检测 + 裁剪上传。
  //    原先逐页串行：大的多卷文件（几十页）会被「一页编码 2000px PNG→中转→检测→上传」
  //    这条串行链路放大成几分钟。改为跨文件展平任务队列 + 限流并发池（一次 FIGURE_DETECT_CONCURRENCY
  //    页），墙钟时间砍数倍。不开全量 Promise.all：并发受 Fly YOLO 机器数/CPU 约束，过高会互相挤 CPU。
  type Task = { fp: { fileIdx: number; pages: PageRaster[] }; pg: PageRaster };
  const tasks: Task[] = [];
  for (const fp of filePages) for (const pg of fp.pages) tasks.push({ fp, pg });

  const processOne = async ({ fp, pg }: Task) => {
    const { base64, mime } = canvasToDetectBase64(pg.canvas);
    if (!base64) {
      firstError ??= '页面取图失败（图片跨域未配 CORS？）';
      donePages++;
      onProgress?.({ percent: Math.min(99, Math.round((donePages / totalPages) * 100)) });
      return;
    }
    const det = await detectPageFigures(base64, mime);
    donePages++;
    onProgress?.({ percent: Math.min(99, Math.round((donePages / totalPages) * 100)) });
    if (!det.success) { firstError ??= det.error; return; }

    // 同一页的图并发处理（裁剪同步 + 上传异步）。
    await Promise.all(det.figures.map(async (fb) => {
      const cropBase64 = cropBox(pg.canvas, fb.box);
      if (!cropBase64) return;
      let url: string | null = null;
      if (mode === 'cloud-vector') {
        try {
          const tk = await screenshotToTikz(cropBase64, 'image/png');
          if (tk.success) {
            const cp = await compileTikzAction(tk.tikz, { tikzLibraries: tk.libraries });
            if (cp.success) {
              const up = await uploadTikzFigureAction(cp.svg);
              if (up.success) url = up.url;
            }
          }
        } catch { /* 回退位图 */ }
      }
      if (!url) {
        const up = await uploadFigureImage(cropBase64);
        if (up.success) url = up.url;
      }
      if (!url) return;
      raws.push({ url, box: toXYXY(fb.box), page: pg.pageNumber, fileIdx: fp.fileIdx });
      onProgress?.({ detected: raws.length });
    }));
  };

  // 限流并发池：N 个 worker 从同一队列取页（JS 单线程，cursor++ / push 无竞态）。
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      await processOne(tasks[cursor++]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FIGURE_DETECT_CONCURRENCY, tasks.length) }, () => worker()),
  );

  onProgress?.({ percent: 100 });
  return { raws, error: firstError };
}

/**
 * 快活：图 ↔ 含『如图』的题 按序对位，合进 content。瞬时，需 Gemini 结果。
 *
 * 多卷批量导入也支持：图按来源文件分组（fileIdx），只与「同一文件提取出的那些卷」里的含图题对位，
 * 并以 (卷下标, 题号) 精确归属——避免把图插进别卷的同号题（多卷都有第9题时的串卷 bug）。
 * 单卷只是「单文件单卷」的退化情形，逻辑一致。
 */
function matchFiguresToQuestions(
  papers: ExtractedPaperBundle[],
  fileIdxOfPaper: number[],
  raws: RawFigure[],
): { papers: ExtractedPaperBundle[]; merged: number; unassigned: number; figures: DetectedFigure[] } {
  // 归属表：卷在 papers 中的下标 → (题号 → 图 URL[])。以卷下标为键，多卷间题号不互串。
  const assign = new Map<number, Map<number, string[]>>();
  const figures: DetectedFigure[] = [];
  let unassigned = 0;

  const fileIdxs = Array.from(new Set(raws.map(r => r.fileIdx))).sort((a, b) => a - b);
  for (const fi of fileIdxs) {
    // a) 该文件的图，按文档阅读顺序排序：页 → 列 → 纵坐标
    const figs = raws.filter(r => r.fileIdx === fi);
    const ranks = columnRanks(figs.map(r => (r.box[0] + r.box[2]) / 2));
    const orderedFigs = figs
      .map((r, i) => ({ ...r, col: ranks[i] }))
      .sort((a, b) => a.page - b.page || a.col - b.col || a.box[1] - b.box[1]);

    // b) 该文件提取出的卷里「需要配图」的题，按卷序 → 题号序，带配额收集 (卷下标, 题号, 张数)。
    //    首选 Gemini 数出的 figure_count（支持一题多图，如三视图 5 张）；
    //    若整文件都没数到任何配图（老数据/漏填）→ 回退「含如图措辞各计 1 张」的旧启发式。
    const quotaQs: { paperIdx: number; qnum: number; count: number }[] = [];
    papers.forEach((p, paperIdx) => {
      if (fileIdxOfPaper[paperIdx] !== fi) return;
      p.questions
        .filter(q => q.question_number != null && (q.figure_count ?? 0) > 0)
        .sort((a, b) => (a.question_number ?? 0) - (b.question_number ?? 0))
        .forEach(q => quotaQs.push({ paperIdx, qnum: q.question_number!, count: q.figure_count! }));
    });
    let refQs: { paperIdx: number; qnum: number; count: number }[];
    if (quotaQs.length > 0) {
      refQs = quotaQs;
    } else {
      // 回退：含「如图」措辞的题各计 1 张图
      refQs = [];
      papers.forEach((p, paperIdx) => {
        if (fileIdxOfPaper[paperIdx] !== fi) return;
        p.questions
          .filter(q => FIG_REF_RE.test(q.content || ''))
          .sort((a, b) => (a.question_number ?? 0) - (b.question_number ?? 0))
          .forEach(q => { if (q.question_number != null) refQs.push({ paperIdx, qnum: q.question_number, count: 1 }); });
      });
    }

    // c) 阅读顺序的图按配额依次填进各题：refQs[0] 取走前 count 张，refQs[1] 取走接着的 count 张…
    //    图取完则后续题少分；多出来的图进托盘（unassigned）——绝不乱塞给别的题。
    let fc = 0; // 已分配到的图游标
    for (const ref of refQs) {
      for (let k = 0; k < ref.count && fc < orderedFigs.length; k++, fc++) {
        const r = orderedFigs[fc];
        figures.push({ url: r.url, question_number: ref.qnum, page: r.page });
        const qmap = assign.get(ref.paperIdx) ?? new Map<number, string[]>();
        qmap.set(ref.qnum, [...(qmap.get(ref.qnum) ?? []), r.url]);
        assign.set(ref.paperIdx, qmap);
      }
    }
    // 剩余未分配的图 → 托盘
    for (; fc < orderedFigs.length; fc++) {
      figures.push({ url: orderedFigs[fc].url, question_number: null, page: orderedFigs[fc].page });
      unassigned += 1;
    }
  }

  // 合并进 content：按卷下标精确定位，杜绝多卷同号题串卷
  let merged = 0;
  const out = assign.size === 0 ? papers : papers.map((p, paperIdx) => {
    const qmap = assign.get(paperIdx);
    if (!qmap) return p;
    return {
      ...p,
      questions: p.questions.map((q: ExtractedQuestion) => {
        const urls = q.question_number != null ? qmap.get(q.question_number) : undefined;
        if (!urls?.length) return q;
        merged += urls.length;
        // 一题多图放进同一段、空格分隔 → MathRenderer 里平铺换行成一行（一题多图不再竖向堆叠）。
        const imgs = urls.map(u => `![几何图](${u})`).join(' ');
        return { ...q, content: `${q.content}\n\n${imgs}` };
      }),
    };
  });

  return { papers: out, merged, unassigned, figures };
}

export default function PaperUploadWorkflow() {
  const [step, setStep] = useState<WorkflowStep>(1);
  const [mode, setMode] = useState<ImportMode>('questions-only');
  const [uploadResults, setUploadResults] = useState<UploadedFile[]>([]);
  const [questionFile, setQuestionFile] = useState<UploadedFile | null>(null);
  const [answerFile, setAnswerFile] = useState<UploadedFile | null>(null);
  const [extractedPapers, setExtractedPapers] = useState<ExtractedPaperBundle[]>([]);
  const [figureMode, setFigureMode] = useState<FigureMode>('image');
  const [detectedFigures, setDetectedFigures] = useState<DetectedFigure[]>([]);
  const [figureState, setFigureState] = useState<FigureState>({ status: 'idle' });
  // CV 检图与 Gemini 提取并行：进第二步即启动检图，存其 promise，提取完成时再对位
  const figuresPromiseRef = useRef<Promise<{ raws: RawFigure[]; error?: string }> | null>(null);

  // 恢复草稿：sessionStorage 只在挂载后可读；放进微任务回调，避免 effect 体内同步 setState。
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as ExtractedPaperBundle[];
        if (Array.isArray(saved) && saved.length > 0) {
          setExtractedPapers(saved);
          setStep(3);
        }
      } catch {}
    });
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
    setDetectedFigures([]);
    setFigureState({ status: 'idle' });
    figuresPromiseRef.current = null;
    setStep(1);
    try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
  }, [clearUploads]);

  // 返回上一步：回到第1步上传，但**保留已传文件**（不重新跑 Gemini）。复位检测态，避免旧进度串到下次提取。
  const handleBackToUpload = useCallback(() => {
    setFigureState({ status: 'idle' });
    figuresPromiseRef.current = null;
    setStep(1);
  }, []);

  // 切模式时清掉已传文件，避免两套状态混淆
  const switchMode = useCallback((next: ImportMode) => {
    setMode(next);
    clearUploads();
  }, [clearUploads]);

  // 进第二步：在 Gemini 提取的同时，并行启动本地 CV 检图（不依赖 Gemini 结果）→ 合成一步、省一次等待
  const handleNextStep = useCallback(() => {
    const figureFiles = mode === 'paired' ? (questionFile ? [questionFile] : []) : uploadResults;
    if (figureFiles.length > 0) {
      setFigureState({ status: 'running', detected: 0, percent: 0 });
      // 实时上报：百分比（整卷扫描）与已上传图数分别更新到 running 状态（与 Gemini 提取并行）
      figuresPromiseRef.current = detectAndUploadFigures(figureFiles, figureMode, (p) =>
        setFigureState(prev => prev.status === 'running'
          ? { status: 'running', detected: p.detected ?? prev.detected, percent: p.percent ?? prev.percent }
          : { status: 'running', detected: p.detected ?? 0, percent: p.percent ?? 0 }));
    } else {
      figuresPromiseRef.current = null;
      setFigureState({ status: 'skipped' });
    }
    setStep(2);
  }, [mode, questionFile, uploadResults, figureMode]);

  const handleExtractionDone = useCallback(async (papers: ExtractedPaperBundle[], fileIdxOfPaper: number[]) => {
    let finalPapers = papers;
    if (figuresPromiseRef.current) {
      try {
        // 检图多半已在 Gemini 提取期间跑完，这里只等收尾 + 瞬时对位
        const { raws, error } = await figuresPromiseRef.current;
        const { papers: enriched, merged, unassigned, figures } = matchFiguresToQuestions(papers, fileIdxOfPaper, raws);
        finalPapers = enriched;
        setDetectedFigures(figures);
        if (raws.length === 0 && error) {
          setFigureState({ status: 'error', message: error });
          toast.error(`几何图识别失败：${error}`);
        } else {
          setFigureState({ status: 'done', detected: raws.length, merged, unassigned });
          if (merged > 0) {
            toast.success(`自动插入 ${merged} 张几何图${unassigned ? `（另有 ${unassigned} 张待人工放置）` : ''}`);
          } else if (unassigned > 0) {
            toast.info(`检测到 ${unassigned} 张图但未自动归属，请用编辑器托盘手动放置`);
          } else {
            toast.info('未检测到几何图');
          }
        }
      } catch {
        setFigureState({ status: 'error', message: 'CV 服务不可用' });
        /* CV 服务不可用则跳过，不阻断录题 */
      }
    }
    setExtractedPapers(finalPapers);
    setStep(3);
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(finalPapers)); } catch {}
  }, []);

  // Step 2 的提取任务
  const job: ExtractJob | null =
    mode === 'paired'
      ? (questionFile && answerFile ? { mode: 'paired', questionFile, answerFile } : null)
      : (uploadResults.length > 0 ? { mode: 'questions-only', files: uploadResults } : null);

  return (
    <div>
      <StepIndicator current={step} />

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
            figureState={figureState}
            onDone={handleExtractionDone}
            onBack={handleBackToUpload}
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
              figures={detectedFigures}
              onReset={handleBackToUpload}
              onContinue={handleReset}
            />
          ) : (
            <MultiBulkPublisher papers={extractedPapers} figures={detectedFigures} onReset={handleReset} onBack={handleBackToUpload} />
          )}
        </section>
      )}
    </div>
  );
}
