// 资源大厅·竞赛视图。复用题库引擎：每张竞赛卷链到 /?paper=<id>，
// 首页 browse 视图（getQuestionsByPaperId）逐题渲染——零新渲染代码。
import Link from 'next/link';
import { Trophy, FileText } from 'lucide-react';
import type { PaperRow } from '@/types/database';

const REGION_LABEL: Record<string, string> = { international: '国外竞赛', domestic: '国内竞赛' };
const REGION_ORDER = ['international', 'domestic', 'other'];

export default function CompetitionView({ papers }: { papers: PaperRow[] }) {
  // 按 region 分组（缺省归 other）
  const groups = new Map<string, PaperRow[]>();
  for (const p of papers) {
    const key = p.region ?? 'other';
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }
  const orderedKeys = [...groups.keys()].sort(
    (a, b) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex items-center gap-2">
        <Trophy size={18} className="text-amber-500" />
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">竞赛</h1>
        <span className="text-xs text-zinc-400">国内外数学竞赛真题（自动爬取更新）</span>
      </div>

      {papers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-400 dark:border-zinc-700">
          竞赛题库正在录入中，敬请期待。
        </div>
      ) : (
        <div className="space-y-7">
          {orderedKeys.map((region) => (
            <section key={region}>
              <h2 className="mb-2.5 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {REGION_LABEL[region] ?? '其他'}
              </h2>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {groups.get(region)!.map((p) => (
                  <Link
                    key={p.id}
                    href={`/?paper=${p.id}`}
                    className="group flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/5"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                      <FileText size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-zinc-900 group-hover:text-indigo-700 dark:text-zinc-100 dark:group-hover:text-indigo-300">
                        {p.contest || p.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-400">
                        {p.year ? `${p.year} · ` : ''}{p.total_questions ?? 0} 题
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
