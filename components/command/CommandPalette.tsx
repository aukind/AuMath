'use client';

// 全局命令面板 / Quick Switcher（⌘K · Ctrl+K）。Obsidian 化导航三件套之一。
// 零依赖自建：首次打开拉取轻量索引（知识点/定理/我的笔记），前端本地模糊过滤；
// 题目/帖子/用户走按需 searchAll（防抖）。↑↓ 选择、Enter 跳转、Esc 关闭。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Orbit, Sigma, NotebookPen, FileText, MessagesSquare, User as UserIcon,
  CornerDownLeft, CalendarDays, CalendarClock, Library, SquarePen, FileCode, Home,
  FilePlus, LayoutDashboard, CalendarPlus,
} from 'lucide-react';
import { getCommandIndex, type CommandIndex } from '@/app/actions/command-palette';
import { searchAll, type SearchResult } from '@/app/actions/search';
import { getOrCreateDailyNote } from '@/app/actions/notes';
import { createCanvas } from '@/app/actions/canvas';

interface Item {
  key: string;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  run: () => void;
}
interface Group { title: string; items: Item[] }

// 静态导航命令（始终可达，按关键词过滤）。
const NAV: { label: string; keywords: string; href: string; icon: React.ReactNode }[] = [
  { label: '知识星图', keywords: 'explore graph 星图 zhishi', href: '/explore', icon: <Orbit size={15} /> },
  { label: '我的笔记', keywords: 'notes 笔记 biji', href: '/notes', icon: <NotebookPen size={15} /> },
  { label: '每日一题', keywords: 'daily 每日 meiri', href: '/daily', icon: <CalendarDays size={15} /> },
  { label: '竞赛日历', keywords: 'calendar 竞赛 日历 jingsai', href: '/calendar', icon: <CalendarClock size={15} /> },
  { label: '资源大厅', keywords: 'library 资源 ziyuan', href: '/library', icon: <Library size={15} /> },
  { label: '录题', keywords: 'contribute 录题 luti', href: '/contribute', icon: <SquarePen size={15} /> },
  { label: 'LaTeX 工作室', keywords: 'studio latex 工作室', href: '/studio', icon: <FileCode size={15} /> },
  { label: '首页 / 社区', keywords: 'home 首页 社区 forum', href: '/', icon: <Home size={15} /> },
];

const CAP = 8;

/** 题目命中的展示标签：出处+年份+题号，回退正文片段。 */
function questionLabel(q: { source?: string | null; year?: number | null; content?: string | null; metadata?: { exam_number?: unknown } | null }): string {
  const examNo = String(q.metadata?.exam_number ?? '').trim();
  const head = String(q.source ?? (q.year ?? '')).trim();
  const tag = [head, examNo].filter(Boolean).join(' ');
  if (tag) return tag;
  const c = (q.content ?? '').replace(/\$[^$]*\$/g, '').replace(/\s+/g, ' ').trim();
  return c.slice(0, 36) || '题目';
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<CommandIndex | null>(null);
  const [hits, setHits] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // ── ⌘K / Ctrl+K 开关 ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 开关切换时复位（渲染期派生，避免 set-state-in-effect）。输入聚焦交给 autoFocus。
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setActive(0);
    setQuery('');
    setHits(null);
    setSearching(false);
  }

  // 首次打开拉取索引（仅一次）。setIndex 在异步回调里，非同步 set-state。
  useEffect(() => {
    if (open && !index) getCommandIndex().then(setIndex).catch(() => setIndex({ topics: [], theorems: [], notes: [] }));
  }, [open, index]);

  // 题目/帖子/用户按需搜索（防抖 220ms）。所有 setState 均置于定时器回调内，
  // 不在 effect 体同步调用（满足 react-hooks/set-state-in-effect）。
  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(async () => {
      if (q.length < 1) { setHits(null); setSearching(false); return; }
      setSearching(true);
      try { setHits(await searchAll(q)); } catch { setHits(null); }
      finally { setSearching(false); }
    }, q.length < 1 ? 0 : 220);
    return () => clearTimeout(t);
  }, [query]);

  const close = useCallback(() => setOpen(false), []);

  // ── 组装分组结果 ──
  const groups: Group[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (s: string) => s.toLowerCase().includes(q);
    const go = (href: string) => () => { close(); router.push(href); };
    const act = (fn: () => Promise<void>) => () => { close(); void fn(); };
    const out: Group[] = [];

    // 动作命令（新建类）：直接创建/打开并跳转
    const ACTIONS: { label: string; kw: string; icon: React.ReactNode; run: () => void }[] = [
      { label: '新建笔记', kw: 'new note xinjian biji', icon: <FilePlus size={15} className="text-cyan-500" />, run: go('/notes?new=1') },
      { label: '今日学习日志', kw: 'daily today riji rizhi 今日', icon: <CalendarPlus size={15} className="text-amber-500" />, run: act(async () => { const r = await getOrCreateDailyNote(); if (r.ok) router.push(`/notes/${r.id}`); }) },
      { label: '新建白板', kw: 'new canvas baiban', icon: <LayoutDashboard size={15} className="text-rose-500" />, run: act(async () => { const r = await createCanvas(); if (r.ok) router.push(`/canvas/${r.id}`); }) },
    ];
    const actionItems = (q ? ACTIONS.filter(a => match(a.label) || a.kw.includes(q)) : ACTIONS)
      .map<Item>(a => ({ key: `act-${a.label}`, label: a.label, icon: a.icon, run: a.run }));
    if (actionItems.length) out.push({ title: '新建', items: actionItems });

    // 命令（导航）
    const navItems = (q ? NAV.filter(n => match(n.label) || n.keywords.includes(q)) : NAV)
      .map<Item>(n => ({ key: `nav-${n.href}`, label: n.label, icon: n.icon, run: go(n.href) }));
    if (navItems.length) out.push({ title: '前往', items: navItems });

    if (index) {
      const topics = (q ? index.topics.filter(t => match(t.name)) : []).slice(0, CAP)
        .map<Item>(t => ({ key: `t-${t.id}`, label: t.name, icon: <Orbit size={15} className="text-violet-500" />, run: go(`/explore?focus=${encodeURIComponent(t.name)}`) }));
      if (topics.length) out.push({ title: '知识点', items: topics });

      const theorems = (q ? index.theorems.filter(t => match(t.name)) : []).slice(0, CAP)
        .map<Item>(t => ({ key: `th-${t.id}`, label: t.name, icon: <Sigma size={15} className="text-amber-500" />, run: go(`/explore?focus=${encodeURIComponent(t.name)}&type=theorem`) }));
      if (theorems.length) out.push({ title: '定理', items: theorems });

      // 笔记：无查询时展示最近 5 条，便于快速回到笔记。
      const notes = (q ? index.notes.filter(n => match(n.title)) : index.notes.slice(0, 5)).slice(0, CAP)
        .map<Item>(n => ({ key: `n-${n.id}`, label: n.title, icon: <NotebookPen size={15} className="text-cyan-500" />, run: go(`/notes/${n.id}`) }));
      if (notes.length) out.push({ title: '我的笔记', items: notes });
    }

    if (hits) {
      const questions = hits.questions.slice(0, 6)
        .map<Item>(qq => ({ key: `q-${qq.id}`, label: questionLabel(qq as never), icon: <FileText size={15} className="text-zinc-400" />, run: go(`/question/${qq.id}`) }));
      if (questions.length) out.push({ title: '题目', items: questions });

      const posts = hits.posts.slice(0, 5)
        .map<Item>(p => ({ key: `p-${p.id}`, label: p.title, sub: p.authorName, icon: <MessagesSquare size={15} className="text-indigo-400" />, run: go(`/forum/${p.id}`) }));
      if (posts.length) out.push({ title: '社区帖子', items: posts });

      const users = hits.users.slice(0, 5)
        .map<Item>(u => ({ key: `u-${u.userId}`, label: u.username, sub: u.userNo ? `UID ${u.userNo}` : undefined, icon: <UserIcon size={15} className="text-emerald-400" />, run: go(`/u/${u.userId}`) }));
      if (users.length) out.push({ title: '用户', items: users });
    }

    return out;
  }, [query, index, hits, router, close]);

  // 扁平化用于键盘上下选择。active 可能因结果变动越界 → 渲染期派生 safeActive 钳制。
  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const safeActive = active < flat.length ? active : 0;

  // 选中项滚入视野（纯 DOM 副作用，无 setState）。
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${safeActive}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [safeActive]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); flat[safeActive]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  if (!open) return null;

  let runningIdx = -1;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm" onClick={close}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 输入条 */}
        <div className="flex items-center gap-2.5 border-b border-zinc-100 px-4 dark:border-zinc-800">
          <Search size={17} className="shrink-0 text-zinc-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="搜知识点 / 定理 / 笔记 / 题目 / 用户…"
            className="w-full bg-transparent py-3.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
          />
          {searching && <span className="shrink-0 text-xs text-zinc-400">搜索中…</span>}
          <kbd className="shrink-0 rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700">Esc</kbd>
        </div>

        {/* 结果 */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-1.5" data-lenis-prevent>
          {flat.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">
              {query.trim() ? '没有匹配项' : '输入以搜索，或选择下方命令'}
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.title} className="mb-1">
                <div className="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{g.title}</div>
                {g.items.map((it) => {
                  runningIdx += 1;
                  const idx = runningIdx;
                  const isActive = idx === safeActive;
                  return (
                    <button
                      key={it.key}
                      data-idx={idx}
                      onMouseEnter={() => setActive(idx)}
                      onClick={it.run}
                      className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm ${
                        isActive ? 'bg-indigo-50 text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-100' : 'text-zinc-700 dark:text-zinc-200'
                      }`}
                    >
                      <span className="shrink-0">{it.icon}</span>
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.sub && <span className="shrink-0 text-xs text-zinc-400">{it.sub}</span>}
                      {isActive && <CornerDownLeft size={13} className="shrink-0 text-indigo-400" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
