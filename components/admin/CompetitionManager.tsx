'use client';

// 竞赛管理（管理员）：列表 + 新建/编辑表单 + 删除 + 一键初始化常见竞赛。
// 写操作走 Server Action，成功后 router.refresh() 重取服务端列表。
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Star, Sparkles, X } from 'lucide-react';
import { upsertCompetition, deleteCompetition, seedCompetitions } from '@/app/actions/competitions';
import type { Competition, CompetitionLevel, CompetitionInput } from '@/app/actions/competitions';
import { levelMeta, formatCnDate } from '@/lib/competitions/meta';

const LEVELS: CompetitionLevel[] = ['gaokao', 'province', 'national', 'international', 'mock', 'other'];

const EMPTY: CompetitionInput = {
  name: '', short_name: '', level: 'national', exam_date: '',
  registration_deadline: '', location: '', url: '', description: '', is_featured: false,
};

export default function CompetitionManager({ initial }: { initial: Competition[] }) {
  const router = useRouter();
  const [form, setForm] = useState<CompetitionInput>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof CompetitionInput>(k: K, v: CompetitionInput[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  function startEdit(c: Competition) {
    setEditingId(c.id);
    setForm({
      id: c.id, name: c.name, short_name: c.short_name ?? '', level: c.level,
      exam_date: c.exam_date, registration_deadline: c.registration_deadline ?? '',
      location: c.location ?? '', url: c.url ?? '', description: c.description ?? '',
      is_featured: c.is_featured,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() { setEditingId(null); setForm(EMPTY); }

  function save() {
    startTransition(async () => {
      const r = await upsertCompetition({ ...form, id: editingId ?? undefined });
      if (r.ok) { toast.success(editingId ? '已更新' : '已添加'); resetForm(); router.refresh(); }
      else toast.error(r.error);
    });
  }

  function remove(id: string, name: string) {
    if (!confirm(`确认删除「${name}」？`)) return;
    startTransition(async () => {
      const r = await deleteCompetition(id);
      if (r.ok) { toast.success('已删除'); if (editingId === id) resetForm(); router.refresh(); }
      else toast.error(r.error);
    });
  }

  function seed() {
    startTransition(async () => {
      const r = await seedCompetitions();
      if (r.ok) { toast.success(r.inserted ? `已初始化 ${r.inserted} 项常见竞赛` : '常见竞赛已存在'); router.refresh(); }
      else toast.error(r.error);
    });
  }

  const inputCls = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';
  const labelCls = 'mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400';

  return (
    <div className="space-y-8">
      {/* 表单 */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {editingId ? <Pencil size={15} /> : <Plus size={15} />} {editingId ? '编辑竞赛' : '新建竞赛'}
          </h2>
          {editingId && (
            <button onClick={resetForm} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
              <X size={12} /> 取消编辑
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>名称 *</label>
            <input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="全国高中数学联合竞赛" />
          </div>
          <div>
            <label className={labelCls}>简称</label>
            <input className={inputCls} value={form.short_name ?? ''} onChange={e => set('short_name', e.target.value)} placeholder="高联" />
          </div>
          <div>
            <label className={labelCls}>层级</label>
            <select className={inputCls} value={form.level} onChange={e => set('level', e.target.value as CompetitionLevel)}>
              {LEVELS.map(l => <option key={l} value={l}>{levelMeta(l).label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>考试日期 *</label>
            <input type="date" className={inputCls} value={form.exam_date} onChange={e => set('exam_date', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>报名截止</label>
            <input type="date" className={inputCls} value={form.registration_deadline ?? ''} onChange={e => set('registration_deadline', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>地区 / 线上</label>
            <input className={inputCls} value={form.location ?? ''} onChange={e => set('location', e.target.value)} placeholder="各省赛区" />
          </div>
          <div>
            <label className={labelCls}>官网 / 报名链接</label>
            <input className={inputCls} value={form.url ?? ''} onChange={e => set('url', e.target.value)} placeholder="https://…" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>简介</label>
            <input className={inputCls} value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="中国数学会主办，一试 + 加试" />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <input type="checkbox" checked={!!form.is_featured} onChange={e => set('is_featured', e.target.checked)} className="h-4 w-4 accent-indigo-500" />
            首屏大倒计时优先展示
          </label>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={save}
            disabled={pending || !form.name.trim() || !form.exam_date}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {editingId ? '保存修改' : '添加竞赛'}
          </button>
          {initial.length === 0 && (
            <button
              onClick={seed}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
            >
              <Sparkles size={14} /> 初始化常见竞赛
            </button>
          )}
        </div>
      </section>

      {/* 列表 */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          全部竞赛（{initial.length}）
        </h2>
        {initial.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-400 dark:border-zinc-700">
            暂无竞赛，点上方「初始化常见竞赛」快速开始。
          </p>
        ) : (
          <ul className="space-y-2">
            {initial.map(c => (
              <li key={c.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${levelMeta(c.level).cls}`}>
                  {levelMeta(c.level).label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-medium text-zinc-800 dark:text-zinc-100">
                    {c.is_featured && <Star size={12} className="shrink-0 fill-amber-400 text-amber-400" />}
                    {c.short_name || c.name}
                  </p>
                  <p className="text-xs text-zinc-400">{formatCnDate(c.exam_date)}</p>
                </div>
                <button onClick={() => startEdit(c)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-blue-600 dark:hover:bg-zinc-800" aria-label="编辑">
                  <Pencil size={14} />
                </button>
                <button onClick={() => remove(c.id, c.short_name || c.name)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30" aria-label="删除">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
