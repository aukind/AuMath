// 资源大厅内容区（外壳 + 常驻侧栏由 app/library/layout.tsx 提供）。
// 按侧栏分级目录的 cat 参数路由：期刊 / 教材 / 竞赛 / 社区共享 / 全部。
import { getLibraryItems, getMyLibraryUpvotes } from '@/app/actions/library';
import { getMyKnowledgeItemIds } from '@/app/actions/knowledge';
import { getCompetitionPapers } from '@/app/actions/questions';
import { getJournalArticles } from '@/app/actions/journals';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import LibraryFeed from '@/components/library/LibraryFeed';
import CompetitionView from '@/components/library/CompetitionView';
import JournalList from '@/components/library/JournalList';
import { type LibraryFilter } from '@/types/library';

export const dynamic = 'force-dynamic';
export const metadata = { title: '资源大厅 · AuMath' };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; q?: string }>;
}) {
  const { cat, q } = await searchParams;

  // 竞赛 → 复用题库引擎（逐题渲染走首页 browse）
  if (cat === 'competition') {
    return <CompetitionView papers={await getCompetitionPapers()} />;
  }

  // 期刊 → 元数据 + 外链
  if (cat === 'journal') {
    return <JournalList articles={await getJournalArticles()} />;
  }

  // 教材 = 官方严选 PDF；社区共享 = UGC；缺省 = 全部
  const filter: LibraryFilter =
    cat === 'textbook' ? 'official' : cat === 'community' ? 'community' : 'all';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [items, votedIds, savedIds] = await Promise.all([
    getLibraryItems(filter),
    getMyLibraryUpvotes(),
    getMyKnowledgeItemIds(),
  ]);

  return (
    <LibraryFeed
      initialItems={items}
      initialFilter={filter}
      initialQuery={q ?? ''}
      initialVotedIds={votedIds}
      initialSavedIds={savedIds}
      isAdmin={isAdminUser(user)}
      currentUserId={user?.id ?? null}
    />
  );
}
