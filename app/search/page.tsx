// 全站搜索（RSC）。?q= 触发题目+帖子搜索。公开可见。
import Link from 'next/link';
import { ChevronLeft, Infinity as InfinityIcon, FileQuestion, Users } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import SearchBox from '@/components/SearchBox';
import QuestionCard from '@/components/QuestionCard';
import { searchAll } from '@/app/actions/search';
import { getFavoritedQuestionIds, getErroredQuestionIds } from '@/app/actions/user-workspace';
import { getMyDifficultyRatings } from '@/app/actions/difficulty';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: '搜索 · AuMath' };

// 用户结果头像：有图用图，否则渐变占位（与公开主页同款风格）。
function UserAvatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  const supabase = await createClient();
  const [{ data: { user } }, result, favoritedIds, erroredIds, myRatings] = await Promise.all([
    supabase.auth.getUser(),
    query ? searchAll(query) : Promise.resolve({ questions: [], posts: [], users: [] }),
    getFavoritedQuestionIds(),
    getErroredQuestionIds(),
    getMyDifficultyRatings(),
  ]);

  const total = result.questions.length + result.posts.length + result.users.length;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ChevronLeft size={16} /> 返回社区
          </Link>
          <Link href="/" className="ml-auto flex items-center gap-1.5">
            <InfinityIcon className="h-5 w-5 stroke-[1.5] text-indigo-600 dark:text-indigo-400" />
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-sm font-extrabold tracking-tight text-transparent dark:from-indigo-400 dark:to-purple-400">
              AuMath
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <SearchBox initialQuery={query} />

        {!query ? (
          <p className="py-16 text-center text-sm text-zinc-400">输入关键词，搜索题库与社区帖子。</p>
        ) : total === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-16 text-center text-sm text-zinc-400 dark:border-zinc-700">
            没有找到与「{query}」相关的内容。
          </div>
        ) : (
          <>
            {/* 用户结果 */}
            {result.users.length > 0 && (
              <section className="space-y-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  <Users size={15} className="text-indigo-500" /> 用户 · {result.users.length}
                </h2>
                <ul className="space-y-2">
                  {result.users.map((u) => (
                    <li key={u.userId}>
                      <Link
                        href={`/u/${u.userId}`}
                        className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
                      >
                        <UserAvatar name={u.username} url={u.avatarUrl} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{u.username}</p>
                          {u.userNo !== null && (
                            <p className="text-xs text-zinc-400">UID: <span className="tabular-nums">{u.userNo}</span></p>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 帖子结果 */}
            {result.posts.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">社区帖子 · {result.posts.length}</h2>
                <ul className="space-y-2">
                  {result.posts.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/forum/${p.id}`}
                        className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
                      >
                        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{p.title}</p>
                        <p className="mt-0.5 text-xs text-zinc-400">{p.authorName}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 题目结果 */}
            {result.questions.length > 0 && (
              <section className="space-y-3">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  <FileQuestion size={15} className="text-indigo-500" /> 题目 · {result.questions.length}
                </h2>
                <div className="space-y-3">
                  {result.questions.map((qq) => (
                    <QuestionCard
                      key={qq.id}
                      question={qq}
                      isLoggedIn={!!user}
                      initialFavorited={favoritedIds.includes(qq.id)}
                      initialErrored={erroredIds.includes(qq.id)}
                      initialMyRating={myRatings[qq.id] ?? null}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
