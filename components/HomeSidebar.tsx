'use client';

// 首页左栏主体（Linear 风主导航 + 高考题库手风琴）。
//   · 主导航 6 项：社区 / 高考题库 / 资源大厅 / 知识星图 / 每日一题 / 我的题库（accent 竖条高亮）。
//   · 社区 · 我的题库：由 PageLayout 提升的工作区状态驱动（0ms keep-alive 秒切）；
//     无 onWorkspaceChange 时（移动抽屉 / 当前在 browse 视图）回退为服务端软导航。
//   · 高考题库：手风琴开关，展开后在下方滚动区显示 知识点/真题/模拟题 树（原 SidebarTabs）。
//     资源大厅筛选已交由 /library 页承载，此处不再内嵌预览。

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  MessagesSquare,
  Landmark as LibraryIcon,
  CalendarDays,
  BookMarked,
  BookOpen,
  Orbit,
  NotebookPen,
  LayoutDashboard,
  Target,
  ChevronDown,
  BadgeCheck,
  Users,
  Newspaper,
  GraduationCap,
  Trophy,
  SquarePen,
  FileCode,
  CalendarClock,
} from 'lucide-react';
import Magnetic from '@/components/motion/Magnetic';
import SidebarTabs from '@/components/SidebarTabs';
import { useSoftNav, isPlainLeftClick } from '@/components/ui/useSoftNav';
import type { MainView } from '@/components/PageLayout';
import type { TopicWithChildren, PaperRow } from '@/types/database';

type IconType = React.ComponentType<{ size?: number | string; className?: string; strokeWidth?: number }>;
type Workspace = 'forum' | 'bank';

interface Props {
  topics: TopicWithChildren[];
  papers: PaperRow[];
  selectedTopicId?: string;
  selectedPaperId?: string;
  isAdmin?: boolean;
  /** 登录用户才显示「创作」组（录题 / LaTeX 工作室）。 */
  isLoggedIn?: boolean;
  mainView: MainView;
  /** 受控工作区（仅桌面端 PageLayout 注入，用于 0ms 秒切高亮）。 */
  activeWorkspace?: Workspace;
  /** 工作区切换回调；存在即走客户端秒切，缺省则回退服务端软导航。 */
  onWorkspaceChange?: (w: Workspace) => void;
  onNavigate?: () => void; // 移动端抽屉内点击后关闭
}

const rowClass = (active: boolean) =>
  [
    'group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
    active
      ? 'bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800/70 dark:text-zinc-50'
      : 'font-medium text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-200',
  ].join(' ');

/** 行内容：accent 竖条 + 磁吸图标 + 标签（fragment，模块级稳定，无重挂载）。 */
function RowInner({ Icon, label, active, loading }: { Icon: IconType; label: string; active: boolean; loading: boolean }) {
  return (
    <>
      <span
        aria-hidden
        className={[
          'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-indigo-500 transition-opacity',
          active || loading ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />
      <Magnetic intensity={0.35} range={10}>
        <Icon size={16} className={active ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'} strokeWidth={2} />
      </Magnetic>
      {label}
    </>
  );
}

/** 资源树分组标题（不可点，仅分隔）。 */
function LibGroup({ Icon, label }: { Icon: IconType; label: string }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 px-2 pb-0.5 pt-1 text-[0.7rem] font-semibold uppercase tracking-wider text-zinc-400 first:mt-0">
      <Icon size={12} className="text-zinc-400" />
      {label}
    </div>
  );
}

/** 资源树叶子（可点，软导航到 /library?cat=…）。 */
function LibLeaf({
  Icon, label, href, active, onClick, loading,
}: { Icon: IconType; label: string; href: string; active: boolean; onClick: (e: React.MouseEvent) => void; loading: boolean }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.82rem] transition-colors',
        active
          ? 'bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
          : 'font-medium text-zinc-500 hover:bg-zinc-100/70 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-200',
      ].join(' ')}
    >
      <Icon size={14} className={active ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'} />
      {label}
      {loading && <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />}
    </Link>
  );
}

export default function HomeSidebar({
  topics,
  papers,
  selectedTopicId,
  selectedPaperId,
  isAdmin = false,
  isLoggedIn = false,
  mainView,
  activeWorkspace,
  onWorkspaceChange,
  onNavigate,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { navigate, pendingHref } = useSoftNav();
  // 互斥单开手风琴：同一时刻只展开「高考题库」或「资源大厅」之一。
  const [openSection, setOpenSection] = useState<'bank' | 'library' | null>(
    mainView === 'browse' ? 'bank' : pathname.startsWith('/library') ? 'library' : null,
  );
  const bankOpen = openSection === 'bank';
  const libOpen = openSection === 'library';
  const currentCat = pathname.startsWith('/library') ? (searchParams.get('cat') ?? 'all') : null;

  // 工作区高亮：受控实例认 activeWorkspace；非受控（移动端）回退 mainView。browse 时两者皆不亮。
  const wsActive = (w: Workspace) =>
    mainView === 'browse'
      ? false
      : onWorkspaceChange
        ? activeWorkspace === w
        : pathname === '/' && (w === 'forum' ? mainView === 'forum' : mainView === 'mybank');

  const goLink = (href: string) => (e: React.MouseEvent) => {
    if (!isPlainLeftClick(e)) return;
    e.preventDefault();
    onNavigate?.();
    navigate(href);
  };

  const goWorkspace = (w: Workspace, href: string) => (e: React.MouseEvent) => {
    if (!isPlainLeftClick(e)) return;
    e.preventDefault();
    onNavigate?.();
    // 有常驻容器（非 browse）且受控 → 客户端秒切；否则服务端软导航离开当前视图。
    if (onWorkspaceChange && mainView !== 'browse') onWorkspaceChange(w);
    else navigate(href);
  };

  const communityActive = wsActive('forum');
  const mybankActive = wsActive('bank');
  const bankActive = mainView === 'browse';
  const libraryActive = pathname.startsWith('/library');
  const graphActive = pathname.startsWith('/explore');
  const notesActive = pathname.startsWith('/notes');
  const canvasActive = pathname.startsWith('/canvas');
  const reviewActive = pathname.startsWith('/review');
  const dailyActive = pathname.startsWith('/daily');
  const calendarActive = pathname.startsWith('/calendar');
  const contributeActive = pathname.startsWith('/contribute');
  const studioActive = pathname.startsWith('/studio');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <nav aria-label="主导航" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {/* 社区（工作区驱动） */}
        <Link
          href="/"
          onClick={goWorkspace('forum', '/')}
          aria-current={communityActive ? 'page' : undefined}
          className={rowClass(communityActive)}
        >
          <RowInner Icon={MessagesSquare} label="社区" active={communityActive} loading={pendingHref === '/'} />
        </Link>

        {/* 高考题库（手风琴开关：展开下方题目树） */}
        <button
          type="button"
          onClick={() => setOpenSection((s) => (s === 'bank' ? null : 'bank'))}
          aria-expanded={bankOpen}
          aria-controls="sidebar-bank-tree"
          className={`${rowClass(bankActive)} cursor-pointer`}
        >
          <RowInner Icon={BookOpen} label="高考题库" active={bankActive} loading={false} />
          <ChevronDown
            size={14}
            aria-hidden
            className={['ml-auto text-zinc-400 transition-transform duration-200', bankOpen ? 'rotate-180' : ''].join(' ')}
          />
        </button>
        {/* 高考题库语境面板：紧贴「高考题库」下方显示 知识点 / 真题 / 模拟题 树。
            自身限高内部滚动，后续 nav 项（资源大厅等）仍可见。 */}
        {bankOpen && (
          <div
            id="sidebar-bank-tree"
            className="mb-0.5 ml-3 max-h-[50vh] overflow-y-auto border-l border-zinc-200/70 pl-2 dark:border-zinc-800"
          >
            <SidebarTabs
              topics={topics}
              papers={papers}
              selectedTopicId={selectedTopicId}
              selectedPaperId={selectedPaperId}
              isAdmin={isAdmin}
            />
          </div>
        )}

        {/* 资源大厅（手风琴：展开分级目录树） */}
        <button
          type="button"
          onClick={() => setOpenSection((s) => (s === 'library' ? null : 'library'))}
          aria-expanded={libOpen}
          aria-controls="sidebar-library-tree"
          className={`${rowClass(libraryActive)} cursor-pointer`}
        >
          <RowInner Icon={LibraryIcon} label="资源大厅" active={libraryActive} loading={(pendingHref ?? '').startsWith('/library')} />
          <ChevronDown
            size={14}
            aria-hidden
            className={['ml-auto text-zinc-400 transition-transform duration-200', libOpen ? 'rotate-180' : ''].join(' ')}
          />
        </button>
        {libOpen && (
          <div id="sidebar-library-tree" className="mb-0.5 ml-3 flex flex-col gap-0.5 border-l border-zinc-200/70 pl-2 dark:border-zinc-800">
            {/* 官方严选 ─ 期刊 / 教材 / 竞赛 */}
            <LibGroup Icon={BadgeCheck} label="官方严选" />
            <LibLeaf Icon={Newspaper} label="期刊" href="/library?cat=journal" active={currentCat === 'journal'} onClick={goLink('/library?cat=journal')} loading={pendingHref === '/library?cat=journal'} />
            <LibLeaf Icon={GraduationCap} label="教材" href="/library?cat=textbook" active={currentCat === 'textbook'} onClick={goLink('/library?cat=textbook')} loading={pendingHref === '/library?cat=textbook'} />
            <LibLeaf Icon={Trophy} label="竞赛" href="/library?cat=competition" active={currentCat === 'competition'} onClick={goLink('/library?cat=competition')} loading={pendingHref === '/library?cat=competition'} />
            {/* 社区共享 */}
            <LibGroup Icon={Users} label="社区共享" />
            <LibLeaf Icon={Users} label="社区资料" href="/library?cat=community" active={currentCat === 'community'} onClick={goLink('/library?cat=community')} loading={pendingHref === '/library?cat=community'} />
          </div>
        )}

        {/* 知识星图 */}
        <Link
          href="/explore"
          onClick={goLink('/explore')}
          aria-current={graphActive ? 'page' : undefined}
          className={rowClass(graphActive)}
        >
          <RowInner Icon={Orbit} label="知识星图" active={graphActive} loading={pendingHref === '/explore'} />
        </Link>

        {/* 我的笔记（Zettelkasten 原子笔记，长进星图） */}
        <Link
          href="/notes"
          onClick={goLink('/notes')}
          aria-current={notesActive ? 'page' : undefined}
          className={rowClass(notesActive)}
        >
          <RowInner Icon={NotebookPen} label="我的笔记" active={notesActive} loading={pendingHref === '/notes'} />
        </Link>

        {/* 白板（无限画布，卡片连线） */}
        <Link
          href="/canvas"
          onClick={goLink('/canvas')}
          aria-current={canvasActive ? 'page' : undefined}
          className={rowClass(canvasActive)}
        >
          <RowInner Icon={LayoutDashboard} label="白板" active={canvasActive} loading={pendingHref === '/canvas'} />
        </Link>

        {/* 学习复盘（弱点雷达 + 热力图 + AI 点评） */}
        <Link
          href="/review"
          onClick={goLink('/review')}
          aria-current={reviewActive ? 'page' : undefined}
          className={rowClass(reviewActive)}
        >
          <RowInner Icon={Target} label="学习复盘" active={reviewActive} loading={pendingHref === '/review'} />
        </Link>

        {/* 每日一题 */}
        <Link
          href="/daily"
          onClick={goLink('/daily')}
          aria-current={dailyActive ? 'page' : undefined}
          className={rowClass(dailyActive)}
        >
          <RowInner Icon={CalendarDays} label="每日一题" active={dailyActive} loading={pendingHref === '/daily'} />
        </Link>

        {/* 竞赛日历 */}
        <Link
          href="/calendar"
          onClick={goLink('/calendar')}
          aria-current={calendarActive ? 'page' : undefined}
          className={rowClass(calendarActive)}
        >
          <RowInner Icon={CalendarClock} label="竞赛日历" active={calendarActive} loading={pendingHref === '/calendar'} />
        </Link>

        {/* 我的题库（工作区驱动） */}
        <Link
          href="/?view=mybank"
          onClick={goWorkspace('bank', '/?view=mybank')}
          aria-current={mybankActive ? 'page' : undefined}
          className={rowClass(mybankActive)}
        >
          <RowInner Icon={BookMarked} label="我的题库" active={mybankActive} loading={pendingHref === '/?view=mybank'} />
        </Link>

        {/* 创作（仅登录可见）：自助录题 / LaTeX 文档工作室 */}
        {isLoggedIn && (
          <>
            <div className="mx-2 my-1.5 border-t border-zinc-100 dark:border-zinc-800/70" />
            <Link
              href="/contribute"
              onClick={goLink('/contribute')}
              aria-current={contributeActive ? 'page' : undefined}
              className={rowClass(contributeActive)}
            >
              <RowInner Icon={SquarePen} label="录题" active={contributeActive} loading={pendingHref === '/contribute'} />
            </Link>
            <Link
              href="/studio"
              onClick={goLink('/studio')}
              aria-current={studioActive ? 'page' : undefined}
              className={rowClass(studioActive)}
            >
              <RowInner Icon={FileCode} label="LaTeX 工作室" active={studioActive} loading={pendingHref === '/studio'} />
            </Link>
          </>
        )}
      </nav>
    </div>
  );
}
