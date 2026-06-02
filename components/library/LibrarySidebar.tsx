'use client';

// 资源大厅导航面板（首页左栏默认内容）。按 范围/类型/学段 浏览，点击软导航深链进 /library 预筛选。
// 冷静极简：细行列表 + hover 浅底 + 少量靠色强调；头部品牌 + 最新封面缩略。

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import LibraryMark from '@/components/library/LibraryMark';
import CoverArt from '@/components/library/CoverArt';
import { useSoftNav, isPlainLeftClick } from '@/components/ui/useSoftNav';
import { RESOURCE_TYPES, EDU_STAGES, type LibraryItem } from '@/types/library';

const SCOPES = [
  { label: '全部', href: '/library?tab=all' },
  { label: '官方严选', href: '/library?tab=official' },
  { label: '社区共享', href: '/library?tab=community' },
];
// 去掉「其他」，导航只列有意义的分类
const TYPES = RESOURCE_TYPES.filter((t) => t !== '其他');
const STAGES = EDU_STAGES.filter((s) => s !== '其他');

export default function LibrarySidebar({ highlights }: { highlights: LibraryItem[] }) {
  const { navigate, isPending, pendingHref } = useSoftNav();

  const go = (href: string) => (e: React.MouseEvent) => {
    if (!isPlainLeftClick(e)) return;
    e.preventDefault();
    navigate(href);
  };

  const covers = highlights.slice(0, 4);

  return (
    <div className="flex flex-col gap-4">
      {/* 头部 */}
      <Link
        href="/library"
        onClick={go('/library')}
        className="group flex items-center gap-2 rounded-lg px-1 py-1"
      >
        <LibraryMark size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">资源大厅</div>
          <div className="text-[11px] text-zinc-400">教材 · 讲义 · 真题</div>
        </div>
        <ChevronRight size={15} className="text-zinc-400 transition-transform group-hover:translate-x-0.5" />
      </Link>

      <NavSection title="范围">
        {SCOPES.map((s) => (
          <NavRow key={s.href} href={s.href} label={s.label} pending={isPending && pendingHref === s.href} onNav={go(s.href)} />
        ))}
      </NavSection>

      <NavSection title="按类型">
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <Chip key={t} href={`/library?type=${encodeURIComponent(t)}`} label={t} onNav={go(`/library?type=${encodeURIComponent(t)}`)} />
          ))}
        </div>
      </NavSection>

      <NavSection title="按学段">
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <Chip key={s} href={`/library?stage=${encodeURIComponent(s)}`} label={s} onNav={go(`/library?stage=${encodeURIComponent(s)}`)} />
          ))}
        </div>
      </NavSection>

      {covers.length > 0 && (
        <NavSection title="最新上传">
          <div className="grid grid-cols-4 gap-1.5">
            {covers.map((it) => (
              <Link
                key={it.id}
                href="/library"
                onClick={go('/library')}
                title={it.title}
                className="aspect-[3/4] overflow-hidden rounded-md ring-1 ring-zinc-200 transition-transform hover:-translate-y-0.5 dark:ring-zinc-800"
              >
                <CoverArt item={it} className="h-full" />
              </Link>
            ))}
          </div>
        </NavSection>
      )}
    </div>
  );
}

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{title}</div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function NavRow({
  href,
  label,
  pending,
  onNav,
}: {
  href: string;
  label: string;
  pending: boolean;
  onNav: (e: React.MouseEvent) => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNav}
      className={[
        'flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors',
        pending
          ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800/70 dark:text-zinc-100'
          : 'text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-200',
      ].join(' ')}
    >
      {label}
      <ChevronRight size={13} className="text-zinc-300 dark:text-zinc-600" />
    </Link>
  );
}

function Chip({ href, label, onNav }: { href: string; label: string; onNav: (e: React.MouseEvent) => void }) {
  return (
    <Link
      href={href}
      onClick={onNav}
      className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300"
    >
      {label}
    </Link>
  );
}
