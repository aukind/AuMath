// 智能复盘（RSC）。把错题 + 复习流水聚合成弱点雷达 + 学习热力图 + 关键指标 + AI 复盘点评。
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, Infinity as InfinityIcon, Flame, AlarmClock, AlertTriangle, Repeat, Target, CalendarRange, ArrowRight } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import Heatmap from '@/components/review/Heatmap';
import WeaknessRadar from '@/components/review/WeaknessRadar';
import ReviewNarrative from '@/components/review/ReviewNarrative';
import { getReviewAnalytics } from '@/app/actions/review-analytics';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: '学习复盘 · AuMath' };

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number | string; accent: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className={`flex items-center gap-1.5 text-xs ${accent}`}>{icon} {label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</div>
    </div>
  );
}

export default async function ReviewPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/review');

  const a = await getReviewAnalytics();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <ChevronLeft size={16} /> 返回首页
          </Link>
          <Link href="/" className="ml-auto flex items-center gap-1.5">
            <InfinityIcon className="h-5 w-5 stroke-[1.5] text-indigo-600 dark:text-indigo-400" />
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-sm font-extrabold tracking-tight text-transparent dark:from-indigo-400 dark:to-purple-400">AuMath</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">
              <Target size={20} className="text-red-500" /> 学习复盘
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">从你的错题与复习记录里，看清薄弱在哪、坚持得怎样。</p>
          </div>
          {a && a.stats.dueNow > 0 && (
            <Link href="/mybank/review" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-500 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-600">
              去复习 {a.stats.dueNow} 题 <ArrowRight size={15} />
            </Link>
          )}
        </div>

        {!a || !a.hasData ? (
          <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700">
            <Target size={28} className="mx-auto text-zinc-300 dark:text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">还没有错题/复习数据。做题、记错题、复习几次后，这里会长出你的弱点雷达与学习热力图。</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* 关键指标 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat icon={<Flame size={13} />} label="连续打卡" value={`${a.stats.streak} 天`} accent="text-orange-500" />
              <Stat icon={<AlarmClock size={13} />} label="待复习" value={a.stats.dueNow} accent="text-red-500" />
              <Stat icon={<AlertTriangle size={13} />} label="累计错题" value={a.stats.totalErrors} accent="text-amber-500" />
              <Stat icon={<Repeat size={13} />} label="近7天复习" value={a.stats.last7} accent="text-emerald-500" />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {/* 弱点：雷达 + 排行 */}
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                  <Target size={15} className="text-red-500" /> 弱点分布
                </h2>
                {a.radar.length >= 3 && <WeaknessRadar axes={a.radar} />}
                <ul className="mt-3 space-y-1.5">
                  {a.weakTopics.map((w) => {
                    const max = a.weakTopics[0]?.errorCount || 1;
                    return (
                      <li key={w.id}>
                        <Link href={`/explore?focus=${encodeURIComponent(w.name)}`} className="group flex items-center gap-2">
                          <span className="w-24 shrink-0 truncate text-sm text-zinc-700 group-hover:text-indigo-600 dark:text-zinc-200 dark:group-hover:text-indigo-400">{w.name}</span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <span className="block h-full rounded-full bg-red-400" style={{ width: `${(w.errorCount / max) * 100}%` }} />
                          </span>
                          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-zinc-400">
                            错{w.errorCount}{w.dueCount ? ` · 待${w.dueCount}` : ''}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* 热力图 + AI 复盘 */}
              <div className="space-y-5">
                <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                    <CalendarRange size={15} className="text-emerald-500" /> 学习热力图（近 16 周）
                  </h2>
                  <Heatmap grid={a.heatmap} />
                </section>

                <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 dark:border-indigo-500/30 dark:bg-indigo-500/[0.07]">
                  <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200">AI 复盘点评</h2>
                  <ReviewNarrative />
                </section>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
