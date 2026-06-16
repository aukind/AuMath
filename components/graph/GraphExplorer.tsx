'use client';

// 知识星图编排层：Server Component 不能持有交互 state，故由此 client 件统管
// 选中态 / 搜索聚光 / 局部图谱聚焦（Obsidian Local Graph）/ 显示开关，
// 组合全屏画布 KnowledgeCanvas + 知识点 Inspector（双向链接面板）+ 题目抽屉 SidePeekDrawer。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Search, Network, LogOut, Eye, EyeOff } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import KnowledgeCanvas, { type CanvasHandle } from '@/components/graph/KnowledgeCanvas';
import SidePeekDrawer from '@/components/graph/SidePeekDrawer';
import TopicInspector from '@/components/graph/TopicInspector';
import TheoremInspector from '@/components/graph/TheoremInspector';
import type { GraphDataPayload, GraphLink, GraphNode } from '@/types/graph';

interface Props {
  data: GraphDataPayload;
  /** ?focus=知识点名 直达：来自 [[维基链接]] 的跳转，进场即聚焦该知识点的局部图谱 */
  initialFocusName?: string;
}

const NODE_LEGEND: { color: string; label: string }[] = [
  { color: '#8b5cf6', label: '知识点' },
  { color: '#d97706', label: '定理' },
  { color: '#a1a1aa', label: '未做' },
  { color: '#ef4444', label: '错题' },
  { color: '#10b981', label: '已掌握' },
];

const LINK_LEGEND: { className: string; label: string }[] = [
  { className: 'border-t-2 border-dashed border-indigo-400', label: '层级' },
  { className: 'border-t-2 border-violet-400', label: '共现' },
  { className: 'border-t-2 border-amber-400', label: '双链' },
  { className: 'border-t border-dotted border-amber-500', label: '定理' },
];

const idOf = (end: unknown): string =>
  typeof end === 'object' && end !== null ? (end as { id: string }).id : (end as string);

export default function GraphExplorer({ data, initialFocusName }: Props) {
  const router = useRouter();
  // ?focus= 直达：按名称解析知识点（惰性初始化，仅首渲染执行一次），
  // 进场即打开 Inspector + 局部图谱。
  // [[维基链接]] 可指向知识点或定理，故按名在两类节点里解析。
  const resolveInitialFocus = () => {
    if (!initialFocusName) return null;
    const ns = data.nodes.filter(n => n.type === 'topic' || n.type === 'theorem');
    return ns.find(n => n.name === initialFocusName)
      ?? ns.find(n => n.name.includes(initialFocusName))
      ?? null;
  };
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    () => { const h = resolveInitialFocus(); return h?.type === 'topic' ? h.id : null; },
  );
  const [selectedTheoremId, setSelectedTheoremId] = useState<string | null>(
    () => { const h = resolveInitialFocus(); return h?.type === 'theorem' ? h.id : null; },
  );
  const [focus, setFocus] = useState<{ id: string; depth: number } | null>(() => {
    const hit = resolveInitialFocus();
    return hit ? { id: hit.id, depth: 1 } : null;
  });
  const [query, setQuery] = useState('');
  const [showQuestions, setShowQuestions] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<CanvasHandle | null>(null);

  const topics = useMemo(
    () => data.nodes.filter(n => n.type === 'topic').map(n => ({ id: n.id, name: n.name })),
    [data],
  );

  // 邻接表（全图）：局部图谱 BFS 用。链路对象会被力导向库原地改写成节点引用，故经 idOf 取 id。
  const adjacency = useMemo(() => {
    const m = new Map<string, string[]>();
    const add = (a: string, b: string) => {
      const arr = m.get(a);
      if (arr) arr.push(b);
      else m.set(a, [b]);
    };
    for (const l of data.links) {
      const s = idOf(l.source);
      const t = idOf(l.target);
      add(s, t);
      add(t, s);
    }
    return m;
  }, [data]);

  // ── 视图数据：局部图谱 BFS 截取 + 题目节点显隐。复用原节点对象，保住力导向坐标。 ──
  const viewData: GraphDataPayload = useMemo(() => {
    let nodes: GraphNode[] = data.nodes;
    let links: GraphLink[] = data.links;

    if (focus) {
      const kept = new Set<string>([focus.id]);
      let frontier = [focus.id];
      for (let d = 0; d < focus.depth; d++) {
        const next: string[] = [];
        for (const id of frontier) {
          for (const nb of adjacency.get(id) ?? []) {
            if (!kept.has(nb)) {
              kept.add(nb);
              next.push(nb);
            }
          }
        }
        frontier = next;
      }
      nodes = nodes.filter(n => kept.has(n.id));
      links = links.filter(l => kept.has(idOf(l.source)) && kept.has(idOf(l.target)));
    }

    if (!showQuestions) {
      nodes = nodes.filter(n => n.type !== 'question');
      links = links.filter(l => l.kind !== 'qt' && l.kind !== 'theorem_cite');
    }

    return { nodes, links };
  }, [data, focus, adjacency, showQuestions]);

  // ── 搜索聚光：命中节点保亮，其余沉入夜色 ──
  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<string>();
    for (const n of viewData.nodes) {
      if (n.name.toLowerCase().includes(q)) set.add(n.id);
    }
    return set;
  }, [query, viewData]);

  const selectTopic = useCallback((id: string) => {
    setSelectedTheoremId(null);
    setSelectedTopicId(id);
    setFocus(f => (f ? { id, depth: f.depth } : f)); // 聚焦模式下导航 = 换根
    canvasRef.current?.focusNode(id);
  }, []);

  const selectTheorem = useCallback((id: string) => {
    setSelectedTopicId(null);
    setSelectedTheoremId(id);
    canvasRef.current?.focusNode(id);
  }, []);

  const handleSearchSubmit = useCallback(() => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = viewData.nodes.find(n => n.type === 'topic' && n.name.toLowerCase().includes(q))
      ?? viewData.nodes.find(n => n.name.toLowerCase().includes(q));
    if (!hit) return;
    if (hit.type === 'topic') selectTopic(hit.id);
    else if (hit.type === 'theorem') selectTheorem(hit.id);
    else setSelectedQuestionId(hit.id);
  }, [query, viewData, selectTopic, selectTheorem]);

  const exitFocus = useCallback(() => {
    setFocus(null);
    // 物理引擎冷却后会自动 zoomToFit，无需手动
  }, []);

  // ── 键盘： / 聚焦搜索；Esc 逐层后退（抽屉 → Inspector → 聚焦模式 → 搜索） ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement instanceof HTMLInputElement
        || document.activeElement instanceof HTMLTextAreaElement;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (typing) {
          (document.activeElement as HTMLElement).blur();
        } else if (selectedQuestionId) {
          setSelectedQuestionId(null);
        } else if (selectedTheoremId) {
          setSelectedTheoremId(null);
        } else if (selectedTopicId) {
          setSelectedTopicId(null);
        } else if (focus) {
          exitFocus();
        } else if (query) {
          setQuery('');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedQuestionId, selectedTheoremId, selectedTopicId, focus, query, exitFocus]);

  const topicCount = data.nodes.filter(n => n.type === 'topic').length;
  const questionCount = data.nodes.length - topicCount;
  const isEmpty = data.nodes.length === 0;
  const focusName = focus ? (data.nodes.find(n => n.id === focus.id)?.name ?? '') : '';

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {isEmpty ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-base font-medium text-zinc-700 dark:text-zinc-200">星图暂为空</p>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            题库尚无已发布且关联知识点的题目，录入后将在此汇成星河。
          </p>
        </div>
      ) : (
        <KnowledgeCanvas
          data={viewData}
          selectedId={selectedTopicId ?? selectedQuestionId ?? selectedTheoremId}
          matchIds={matchIds}
          onQuestionClick={setSelectedQuestionId}
          onTopicClick={id => { setSelectedTheoremId(null); setSelectedTopicId(id); }}
          onTheoremClick={id => { setSelectedTopicId(null); setSelectedTheoremId(id); }}
          onBackgroundClick={() => { setSelectedTopicId(null); setSelectedTheoremId(null); }}
          onHandleReady={h => { canvasRef.current = h; }}
        />
      )}

      {/* 顶栏：返回 + 标题（左）／搜索（中）／显示开关 + 主题（右），悬浮于画布之上 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-4 py-3">
        <div className="pointer-events-auto flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-1 rounded-xl border border-zinc-200/60 bg-white/70 px-2.5 py-1.5 text-sm font-medium text-zinc-600 shadow-sm backdrop-blur-xl transition-colors hover:text-zinc-900 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            <ChevronLeft size={15} /> 返回首页
          </Link>
          <div className="hidden rounded-xl border border-zinc-200/60 bg-white/70 px-3 py-1.5 shadow-sm backdrop-blur-xl md:block dark:border-zinc-700/60 dark:bg-zinc-900/70">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">知识星图</span>
            <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">
              {topicCount} 知识点 · {questionCount} 题
            </span>
          </div>
        </div>

        {/* 搜索：输入即聚光，回车跳转首个命中 */}
        <div className="pointer-events-auto relative mx-auto w-full max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearchSubmit()}
            placeholder="搜索星图…（/）"
            className="w-full rounded-xl border border-zinc-200/60 bg-white/70 py-1.5 pl-8 pr-3 text-sm text-zinc-800 shadow-sm outline-none backdrop-blur-xl transition-all placeholder:text-zinc-400 focus:border-indigo-400 focus:shadow-md focus:shadow-indigo-500/10 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-100 dark:focus:border-indigo-500"
          />
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setShowQuestions(v => !v)}
            title={showQuestions ? '隐藏题目节点（只看知识网）' : '显示题目节点'}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200/60 bg-white/70 px-2.5 py-1.5 text-sm font-medium text-zinc-600 shadow-sm backdrop-blur-xl transition-colors hover:text-zinc-900 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:text-zinc-50"
          >
            {showQuestions ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="hidden sm:inline">题目</span>
          </button>
          <div className="rounded-xl border border-zinc-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/70">
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* 局部图谱模式控制条：底部居中浮岛 */}
      <AnimatePresence>
        {focus && (
          <motion.div
            initial={{ y: 64, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 64, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-indigo-200/60 bg-white/75 px-4 py-2.5 shadow-xl shadow-indigo-500/10 backdrop-blur-xl dark:border-indigo-500/25 dark:bg-zinc-900/75"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-300">
              <Network size={15} />
              <span className="max-w-[140px] truncate">{focusName}</span>
              <span className="text-xs text-zinc-400">局部图谱</span>
            </span>
            <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              深度
              <input
                type="range"
                min={1}
                max={3}
                step={1}
                value={focus.depth}
                onChange={e => setFocus({ id: focus.id, depth: Number(e.target.value) })}
                className="h-1 w-20 accent-indigo-500"
              />
              <span className="w-3 text-center font-mono text-indigo-500 dark:text-indigo-400">{focus.depth}</span>
            </label>
            <button
              onClick={exitFocus}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <LogOut size={12} /> 退出
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 图例：左下角（节点染色 + 连线类型） */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 rounded-xl border border-zinc-200/60 bg-white/70 px-3.5 py-2.5 shadow-sm backdrop-blur-xl dark:border-zinc-700/60 dark:bg-zinc-900/70">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          {NODE_LEGEND.map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          {LINK_LEGEND.map(({ className, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
              <span className={`inline-block w-4 ${className}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* 知识点 Inspector：双向链接面板（点恒星弹出） */}
      <TopicInspector
        topicId={selectedTopicId}
        allTopics={topics}
        onClose={() => setSelectedTopicId(null)}
        onNavigate={selectTopic}
        onNavigateTheorem={selectTheorem}
        onFocusLocal={id => setFocus(f => ({ id, depth: f?.depth ?? 1 }))}
        onQuestionClick={setSelectedQuestionId}
        onLinksChanged={() => router.refresh()}
      />

      {/* 定理 Inspector：点金色菱形节点弹出（定理库联动） */}
      <TheoremInspector
        theoremId={selectedTheoremId}
        onClose={() => setSelectedTheoremId(null)}
        onNavigateTopic={selectTopic}
        onQuestionClick={setSelectedQuestionId}
        onFocusLocal={id => setFocus(f => ({ id, depth: f?.depth ?? 1 }))}
      />

      {/* 右侧抽屉：点击题目节点弹出，不路由跳转 */}
      <SidePeekDrawer questionId={selectedQuestionId} onClose={() => setSelectedQuestionId(null)} />
    </div>
  );
}
