'use client';

// 资源大厅交互主体（客户端编排器）。
//   · AnimatedTabs（复用 components/ui/AnimatedTabs）弹簧切换 全部/官方/社区；
//   · 检索 + 类型/学段筛选（客户端即时）；
//   · 官方区 → <OfficialBookshelf>（3D 视差橱窗）；社区区 → <CommunityMasonry>（瀑布流 + 点赞）；
//   · 点击卡片 → 懒载 <ImmersiveReader>（dynamic ssr:false），经 layoutId 从卡片放大展开；
//   · 登录上传 / 点赞 / 举报 / 管理员加精，均走 Server Actions + sonner 反馈。
//   · <LayoutGroup> 包裹卡片与阅读器，保证封面 ↔ 阅读器共享布局动画在同一组内。

import { useCallback, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { LayoutGroup } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { Drawer } from 'vaul';
import { toast } from 'sonner';
import * as tus from 'tus-js-client';
import {
  BadgeCheck,
  Users,
  LayoutGrid,
  Upload,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import AnimatedTabs from '@/components/ui/AnimatedTabs';
import OfficialBookshelf from '@/components/library/OfficialBookshelf';
import CommunityMasonry from '@/components/library/CommunityMasonry';
import { createClient } from '@/lib/supabase/client';
import {
  getLibraryItems,
  finalizeLibraryUpload,
  uploadLibraryCover,
  reportItem,
  promoteItem,
  toggleUpvote,
} from '@/app/actions/library';
import { saveLibraryItemToKnowledge, unsaveLibraryItem } from '@/app/actions/knowledge';
import {
  type LibraryFilter,
  type LibraryItem,
} from '@/types/library';

const BUCKET = 'library-pdfs';
const TUS_CHUNK = 6 * 1024 * 1024; // Supabase TUS 硬性要求固定 6MB 分片
const MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

// 阅读器只在点击后懒载，禁 SSR（react-pdf 需要浏览器环境）。
const ImmersiveReader = dynamic(() => import('./ImmersiveReader'), { ssr: false });

// 后台生成第1页封面：动态 import 把 pdfjs 留到运行时（不进 SSR/首屏 bundle）。失败静默（封面是增强项）。
async function generateAndUploadCover(itemId: string, pdfUrl: string, onDone: () => void) {
  try {
    const { generateCoverBlob } = await import('@/lib/library/generateCover');
    const blob = await generateCoverBlob(pdfUrl);
    if (!blob) return;
    const fd = new FormData();
    fd.append('cover', blob, 'cover.jpg');
    const res = await uploadLibraryCover(itemId, fd);
    if (res.success) onDone();
  } catch {
    /* ignore */
  }
}

const TABS = [
  { id: 'all', label: '全部', icon: <LayoutGrid size={14} /> },
  { id: 'official', label: '官方', icon: <BadgeCheck size={14} /> },
  { id: 'community', label: '社区', icon: <Users size={14} /> },
];

const FEED_TITLE: Record<LibraryFilter, string> = {
  all: '社区海域',
  official: '官方资料',
  community: '社区资料',
};

interface Props {
  initialItems: LibraryItem[];
  initialFilter?: LibraryFilter;
  initialQuery?: string;
  initialVotedIds?: string[];
  initialSavedIds?: string[];
  isAdmin: boolean;
  currentUserId: string | null;
}

export default function LibraryFeed({
  initialItems,
  initialFilter = 'all',
  initialQuery = '',
  initialVotedIds = [],
  initialSavedIds = [],
  isAdmin,
  currentUserId,
}: Props) {
  const [items, setItems] = useState<LibraryItem[]>(initialItems);
  const [filter, setFilter] = useState<LibraryFilter>(initialFilter);
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useState<LibraryItem | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [votedIds, setVotedIds] = useState<Set<string>>(() => new Set(initialVotedIds));
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set(initialSavedIds));
  // 检索（客户端即时，对已加载列表过滤）；初值可由首页导航深链注入。分类已交由侧栏分级目录承载。
  const [query, setQuery] = useState(initialQuery);

  const refresh = useCallback((f: LibraryFilter) => {
    startTransition(async () => {
      setItems(await getLibraryItems(f));
    });
  }, []);

  const onTab = (id: string) => {
    const f = id as LibraryFilter;
    setFilter(f);
    refresh(f);
  };

  // 检索 + 分类组合过滤
  const q = query.trim().toLowerCase();
  const visible = items.filter((i) => {
    if (q) {
      const hay = [i.title, i.description ?? '', i.tags.join(' '), i.author?.username ?? '']
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const officialItems = visible.filter((i) => i.is_official);
  const feedItems = filter === 'all' ? visible.filter((i) => !i.is_official) : visible;
  const showcase = filter === 'all' && officialItems.length > 0;
  const isFiltering = !!q;

  // ── 点赞（乐观更新，失败回滚，成功对齐服务端真值） ─────────────
  const onToggleUpvote = async (item: LibraryItem) => {
    if (!currentUserId) {
      toast.error('请先登录后点赞');
      return;
    }
    const wasVoted = votedIds.has(item.id);
    const bump = (delta: number) =>
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, upvote_count: Math.max(0, i.upvote_count + delta) } : i,
        ),
      );
    const setVoted = (on: boolean) =>
      setVotedIds((prev) => {
        const n = new Set(prev);
        if (on) n.add(item.id);
        else n.delete(item.id);
        return n;
      });

    // 乐观
    setVoted(!wasVoted);
    bump(wasVoted ? -1 : 1);

    const res = await toggleUpvote(item.id);
    if (!res.success) {
      // 回滚
      setVoted(wasVoted);
      bump(wasVoted ? 1 : -1);
      toast.error('操作失败，请重试');
      return;
    }
    // 对齐服务端真值
    setVoted(res.upvoted);
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, upvote_count: res.upvotes } : i)),
    );
  };

  // ── 收藏到我的知识库（乐观更新，失败回滚） ─────────────
  const onToggleSave = async (item: LibraryItem) => {
    if (!currentUserId) {
      toast.error('请先登录后收藏');
      return;
    }
    const wasSaved = savedIds.has(item.id);
    const setSaved = (on: boolean) =>
      setSavedIds((prev) => {
        const n = new Set(prev);
        if (on) n.add(item.id);
        else n.delete(item.id);
        return n;
      });

    setSaved(!wasSaved); // 乐观
    const res = wasSaved
      ? await unsaveLibraryItem(item.id)
      : await saveLibraryItemToKnowledge(item.id);
    if (!res.success) {
      setSaved(wasSaved); // 回滚
      toast.error(res.error ?? '操作失败，请重试');
      return;
    }
    toast.success(wasSaved ? '已从知识库移除' : '已收藏到我的知识库');
  };

  // ── 举报 ──────────────────────────────────────────────
  const onReport = async (item: LibraryItem) => {
    const res = await reportItem(item.id);
    if (!res.success) {
      toast.error('举报失败，请先登录');
      return;
    }
    if (res.hidden) {
      toast.success('举报已记录，该资料已进入审核池');
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } else {
      toast.success('举报已记录，感谢反馈');
    }
  };

  // ── 加精 ──────────────────────────────────────────────
  const onPromote = async (item: LibraryItem) => {
    const ok = await promoteItem(item.id);
    if (ok) {
      toast.success(`已加精「${item.title}」`);
      refresh(filter);
    } else {
      toast.error('加精失败');
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* 顶部操作行 */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <AnimatedTabs tabs={TABS} activeTab={filter} onChange={onTab} />
        {currentUserId && (
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
          >
            <Upload size={15} /> 上传资料
          </button>
        )}
      </div>

      {/* 检索框 */}
      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索资料标题 / 简介 / 标签 / 上传者…"
          className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-9 text-sm outline-none transition-colors focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="清空"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="mb-5" />

      <LayoutGroup>
        {/* 官方严选 3D 橱窗 */}
        {showcase && <OfficialBookshelf items={officialItems} onOpen={setActive} />}

        {/* 社区瀑布流 */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {FEED_TITLE[filter]}
            {isPending && (
              <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-zinc-400" />
            )}
          </h2>

          {feedItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-400 dark:border-zinc-700">
              {isFiltering
                ? '没有匹配的资料，换个关键词或分类试试'
                : `还没有资料，${currentUserId ? '点击右上角上传第一份吧' : '登录后即可上传'}`}
            </div>
          ) : (
            <CommunityMasonry
              items={feedItems}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              votedIds={votedIds}
              savedIds={savedIds}
              onOpen={setActive}
              onReport={onReport}
              onPromote={onPromote}
              onToggleUpvote={onToggleUpvote}
              onToggleSave={onToggleSave}
            />
          )}
        </section>

        {/* 阅读器（懒载，layoutId 从卡片放大展开）。传入收藏态 → 官方/社区任意 PDF 均可一键收藏。 */}
        {active && (
          <ImmersiveReader
            key={active.id}
            item={active}
            onClose={() => setActive(null)}
            saved={savedIds.has(active.id)}
            onToggleSave={() => onToggleSave(active)}
          />
        )}
      </LayoutGroup>

      {/* 上传抽屉 */}
      <UploadDrawer
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        userId={currentUserId}
        onUploaded={() => refresh(filter)}
      />
    </div>
  );
}

// ── 上传抽屉（tus 断点续传直传 ≤5GB） ───────────────────────
function UploadDrawer({
  open,
  onOpenChange,
  userId,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string | null;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [progress, setProgress] = useState<number | null>(null); // null=未开始
  const [submitting, setSubmitting] = useState(false);
  const uploadRef = useRef<tus.Upload | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    multiple: false,
    disabled: submitting,
    onDrop: (accepted) => {
      const f = accepted[0];
      if (f) {
        setFile(f);
        if (!title) setTitle(f.name.replace(/\.pdf$/i, ''));
      }
    },
  });

  const reset = () => {
    setFile(null);
    setTitle('');
    setDescription('');
    setTags('');
    setProgress(null);
  };

  // 关闭时若有进行中的上传则中止（保留 tus 指纹，下次可续传）
  const handleOpenChange = (o: boolean) => {
    if (!o && uploadRef.current && submitting) {
      uploadRef.current.abort().catch(() => {});
    }
    onOpenChange(o);
  };

  const submit = async () => {
    if (!userId) return toast.error('请先登录');
    if (!file) return toast.error('请先选择 PDF');
    if (!title.trim()) return toast.error('请填写标题');
    if (file.size > MAX_BYTES) return toast.error('文件不能超过 5GB');

    // ① 客户端先验 %PDF 头（仅读 8 字节，GB 级也瞬时）
    try {
      const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (!(head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46)) {
        return toast.error('文件不是合法的 PDF');
      }
    } catch {
      return toast.error('无法读取文件');
    }

    // ② 取用户 token（tus 用本人身份直传，受 storage.objects RLS 约束）
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return toast.error('登录已过期，请重新登录');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const objectName = `${userId}/${crypto.randomUUID()}.pdf`;
    const pdfUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${objectName}`;
    const meta = {
      title: title.trim(),
      description: description.trim(),
      tags: Array.from(
        new Set(tags.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean)),
      ).slice(0, 8),
    };

    setSubmitting(true);
    setProgress(0);

    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: anonKey,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK, // 必须 6MB
      metadata: {
        bucketName: BUCKET,
        objectName,
        contentType: 'application/pdf',
        cacheControl: '3600',
      },
      onError: (err) => {
        console.error('[tus]', err);
        toast.error('上传失败：' + (err instanceof Error ? err.message : '网络异常'));
        setSubmitting(false);
        setProgress(null);
      },
      onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
      onSuccess: async () => {
        // 文件已落 Storage → 服务端 finalize（Range 复验 + 落元数据）
        const res = await finalizeLibraryUpload({ objectName, ...meta });
        setSubmitting(false);
        if (res.success) {
          toast.success('上传成功，已进入社区流');
          reset();
          onOpenChange(false);
          onUploaded();
          // 后台生成第1页封面（走 Range 不下整文），完成后再刷新一次显示封面
          if (res.id) void generateAndUploadCover(res.id, pdfUrl, onUploaded);
        } else {
          toast.error(res.error ?? '入库失败');
          setProgress(null);
        }
      },
    });
    uploadRef.current = upload;

    // 若有未完成的同文件上传，从断点续传
    const previous = await upload.findPreviousUploads();
    if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
    upload.start();
  };

  return (
    <Drawer.Root open={open} onOpenChange={handleOpenChange} direction="bottom">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90vh] max-w-lg flex-col rounded-t-2xl bg-white p-5 outline-none dark:bg-zinc-900">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <div className="mb-4 flex items-center justify-between">
            <Drawer.Title className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              上传资料
            </Drawer.Title>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-3 overflow-y-auto">
            <div
              {...getRootProps()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                isDragActive
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                  : 'border-zinc-300 hover:border-indigo-400 dark:border-zinc-700'
              } ${submitting ? 'pointer-events-none opacity-60' : ''}`}
            >
              <input {...getInputProps()} />
              <Upload className="h-6 w-6 text-zinc-400" />
              {file ? (
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {file.name}
                  <span className="ml-1 text-xs text-zinc-400">
                    （{(file.size / 1024 / 1024).toFixed(1)} MB）
                  </span>
                </span>
              ) : (
                <span className="text-sm text-zinc-500">点击或拖拽 PDF 到此处（≤ 5GB，支持断点续传）</span>
              )}
            </div>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
              placeholder="标题（必填）"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              placeholder="简介（选填）"
              rows={2}
              className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              disabled={submitting}
              placeholder="标签，逗号分隔（选填，最多 8 个）"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>

          {/* 进度条 */}
          {progress !== null && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-zinc-500">
                <span>{progress < 100 ? '上传中…' : '处理中…'}</span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload size={15} />}
            {submitting ? '上传中…' : '发布到社区'}
          </button>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
