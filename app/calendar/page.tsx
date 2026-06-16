// 竞赛日历（RSC）。吸收数之谜「考试安排」：首屏大倒计时 + 即将到来的竞赛日程。
import Link from 'next/link';
import { ChevronLeft, Infinity as InfinityIcon, CalendarClock, MapPin, ExternalLink, Settings, Hourglass } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import CompetitionCountdown from '@/components/competitions/CompetitionCountdown';
import { getUpcomingCompetitions } from '@/app/actions/competitions';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/utils/auth';
import { levelMeta, formatCnDate, weekdayCn, deadlinePassed } from '@/lib/competitions/meta';

export const dynamic = 'force-dynamic';
export const metadata = { title: '竞赛日历 · AuMath' };

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = isAdminUser(user);

  const upcoming = await getUpcomingCompetitions(24);
  const hero = upcoming.find(c => c.is_featured) ?? upcoming[0] ?? null;
  const rest = hero ? upcoming.filter(c => c.id !== hero.id) : upcoming;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ChevronLeft size={16} /> 返回首页
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

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-2">
          <CalendarClock className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">竞赛日历</h1>
          {isAdmin && (
            <Link
              href="/admin/competitions"
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Settings size={14} /> 管理
            </Link>
          )}
        </div>

        {!hero ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-3xl border border-zinc-200 bg-white px-8 py-20 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <CalendarClock size={36} className="text-zinc-300 dark:text-zinc-600" />
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">暂无即将到来的竞赛</h2>
            <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {isAdmin ? '前往「管理」初始化常见竞赛，或手动添加。' : '管理员录入后，这里将显示各级竞赛的倒计时与日程。'}
            </p>
          </div>
        ) : (
          <>
            {/* 首屏大倒计时 */}
            <section className="mb-8 overflow-hidden rounded-3xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-white p-6 shadow-sm dark:border-indigo-500/25 dark:from-indigo-950/30 dark:to-zinc-900 sm:p-8">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${levelMeta(hero.level).cls}`}>
                  {levelMeta(hero.level).label}
                </span>
                <span className="text-xs text-zinc-400">距下一场</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-2xl">
                {hero.short_name || hero.name}
              </h2>
              <p className="mb-5 mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {formatCnDate(hero.exam_date)} · {weekdayCn(hero.exam_date)}
              </p>
              <CompetitionCountdown examDate={hero.exam_date} variant="lg" />
              {hero.url && (
                <a
                  href={hero.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  <ExternalLink size={14} /> 官网 / 报名
                </a>
              )}
            </section>

            {/* 即将到来列表 */}
            {rest.length > 0 && (
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  接下来
                </h3>
                <ul className="space-y-2.5">
                  {rest.map(c => (
                    <li
                      key={c.id}
                      className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${levelMeta(c.level).cls}`}>
                            {levelMeta(c.level).label}
                          </span>
                          <span className="truncate font-semibold text-zinc-900 dark:text-zinc-50">
                            {c.short_name || c.name}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                          {formatCnDate(c.exam_date)} · {weekdayCn(c.exam_date)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400 dark:text-zinc-500">
                          {c.registration_deadline && (
                            <span className={`inline-flex items-center gap-1 ${deadlinePassed(c.registration_deadline) ? 'text-zinc-400 line-through' : 'text-amber-600 dark:text-amber-400'}`}>
                              <Hourglass size={11} /> 报名截止 {formatCnDate(c.registration_deadline)}
                            </span>
                          )}
                          {c.location && (
                            <span className="inline-flex items-center gap-1"><MapPin size={11} /> {c.location}</span>
                          )}
                          {c.url && (
                            <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400">
                              <ExternalLink size={11} /> 官网
                            </a>
                          )}
                        </div>
                      </div>
                      <CompetitionCountdown examDate={c.exam_date} variant="sm" className="mt-0.5 shrink-0" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
