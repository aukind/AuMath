// 资源大厅 /library（RSC 入口）。服务端预取数据 + 鉴权，注入客户端交互层。
import Link from 'next/link';
import { Toaster } from 'sonner';
import { ChevronLeft, Infinity as InfinityIcon } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import LibraryFeed from '@/components/library/LibraryFeed';
import LibraryMark from '@/components/library/LibraryMark';
import { getLibraryItems, getMyLibraryUpvotes } from '@/app/actions/library';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import {
  RESOURCE_TYPES,
  EDU_STAGES,
  type EduStage,
  type LibraryFilter,
  type ResourceType,
} from '@/types/library';

export const dynamic = 'force-dynamic';
export const metadata = { title: '资源大厅 · AuMath' };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; type?: string; stage?: string; q?: string }>;
}) {
  const { tab, type, stage, q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 深链筛选（来自首页资源大厅导航）：校验白名单后作为初值
  const filter: LibraryFilter =
    tab === 'official' || tab === 'community' ? tab : 'all';
  const initialType = (RESOURCE_TYPES as readonly string[]).includes(type ?? '')
    ? (type as ResourceType)
    : null;
  const initialStage = (EDU_STAGES as readonly string[]).includes(stage ?? '')
    ? (stage as EduStage)
    : null;

  const [items, votedIds] = await Promise.all([
    getLibraryItems(filter),
    getMyLibraryUpvotes(),
  ]);
  const isAdmin = isAdminUser(user);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Toaster richColors position="top-center" />
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ChevronLeft size={16} /> 返回
          </Link>
          <span className="ml-1 flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            <LibraryMark size={18} /> 资源大厅
          </span>
          <Link href="/" className="ml-auto flex items-center gap-1.5">
            <InfinityIcon className="h-5 w-5 stroke-[1.5] text-indigo-600 dark:text-indigo-400" />
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-sm font-extrabold tracking-tight text-transparent dark:from-indigo-400 dark:to-purple-400">
              AuMath
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <LibraryFeed
        initialItems={items}
        initialFilter={filter}
        initialType={initialType}
        initialStage={initialStage}
        initialQuery={q ?? ''}
        initialVotedIds={votedIds}
        isAdmin={isAdmin}
        currentUserId={user?.id ?? null}
      />
    </div>
  );
}
