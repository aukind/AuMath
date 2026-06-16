'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Folder, FolderPlus, Pencil, Trash2, Check, X, Loader2, Inbox, LayoutGrid,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSoftNav, isPlainLeftClick } from '@/components/ui/useSoftNav';
import {
  createFavoriteFolder, renameFavoriteFolder, deleteFavoriteFolder,
} from '@/app/actions/favorites';
import type { FavoriteFolderOverview, FavoriteFolderFilter } from '@/types/database';

const BASE = '/?view=mybank&workspace=favorites';
function hrefFor(filter: FavoriteFolderFilter) {
  return filter === 'all' ? BASE : `${BASE}&folder=${filter}`;
}

/**
 * 「我的收藏」顶部的收藏夹过滤栏：全部 / 未分类 / 各收藏夹 chip（软导航过滤），
 * 含内联新建、重命名、删除。删除某夹时其题目落回「未分类」（DB 层 ON DELETE SET NULL）。
 */
export default function FavoriteFolderBar({
  overview, activeFolder,
}: {
  overview: FavoriteFolderOverview;
  activeFolder: FavoriteFolderFilter;
}) {
  const { folders, uncategorizedCount, totalCount } = overview;
  const { navigate, isPending, pendingHref } = useSoftNav();
  const router = useRouter();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitCreate() {
    const name = newName.trim();
    if (!name) { setCreating(false); setNewName(''); return; }
    setBusy(true);
    const res = await createFavoriteFolder(name);
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    setCreating(false); setNewName('');
    toast.success(`已新建「${name}」`);
    router.refresh();
  }

  async function submitRename(id: string) {
    const name = editName.trim();
    if (!name) { setEditingId(null); return; }
    setBusy(true);
    const res = await renameFavoriteFolder(id, name);
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    setEditingId(null);
    router.refresh();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`删除收藏夹「${name}」？夹内题目会移回「未分类」，不会丢失。`)) return;
    setBusy(true);
    const res = await deleteFavoriteFolder(id);
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(`已删除「${name}」`);
    if (activeFolder === id) navigate(BASE);  // 正在看的夹被删 → 回到「全部」
    else router.refresh();
  }

  function chipClass(active: boolean) {
    return [
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
      active
        ? 'border-indigo-600 bg-indigo-600 text-white'
        : 'border-zinc-200 bg-white text-zinc-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-700 dark:hover:text-indigo-400',
    ].join(' ');
  }

  // 普通函数返回元素（非嵌套组件，避免每次渲染新建组件类型导致 remount / lint 告警）
  function renderChip(filter: FavoriteFolderFilter, children: React.ReactNode) {
    const href = hrefFor(filter);
    const active = isPending ? pendingHref === href : activeFolder === filter;
    return (
      <Link
        href={href}
        onClick={(e) => { if (!isPlainLeftClick(e)) return; e.preventDefault(); navigate(href); }}
        className={chipClass(active)}
      >
        {children}
      </Link>
    );
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {renderChip('all', <><LayoutGrid size={13} /> 全部 <Count n={totalCount} /></>)}
      {renderChip('uncategorized', <><Inbox size={13} /> 未分类 <Count n={uncategorizedCount} /></>)}

      {folders.map((f) => {
        if (editingId === f.id) {
          return (
            <span key={f.id} className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-white px-2.5 py-1 dark:border-indigo-700 dark:bg-zinc-900">
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename(f.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                maxLength={30}
                className="w-24 bg-transparent text-xs text-zinc-800 outline-none dark:text-zinc-100"
              />
              {busy
                ? <Loader2 size={13} className="animate-spin text-indigo-500" />
                : <button onClick={() => submitRename(f.id)} aria-label="确认" className="text-emerald-600"><Check size={13} /></button>}
              <button onClick={() => setEditingId(null)} aria-label="取消" className="text-zinc-400"><X size={13} /></button>
            </span>
          );
        }
        const href = hrefFor(f.id);
        const active = isPending ? pendingHref === href : activeFolder === f.id;
        return (
          <span key={f.id} className="group inline-flex items-center">
            <Link
              href={href}
              onClick={(e) => { if (!isPlainLeftClick(e)) return; e.preventDefault(); navigate(href); }}
              className={chipClass(active)}
            >
              <Folder size={13} /> {f.name} <Count n={f.count} active={active} />
            </Link>
            {/* hover 展开编辑/删除（桌面），避免 chip 行太挤 */}
            <span className="ml-0.5 hidden items-center gap-0.5 group-hover:inline-flex">
              <button
                onClick={() => { setEditingId(f.id); setEditName(f.name); }}
                aria-label="重命名收藏夹"
                className="rounded p-1 text-zinc-400 transition-colors hover:text-indigo-600"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => handleDelete(f.id, f.name)}
                aria-label="删除收藏夹"
                className="rounded p-1 text-zinc-400 transition-colors hover:text-red-600"
              >
                <Trash2 size={12} />
              </button>
            </span>
          </span>
        );
      })}

      {creating ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-white px-2.5 py-1 dark:border-indigo-700 dark:bg-zinc-900">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate();
              if (e.key === 'Escape') { setCreating(false); setNewName(''); }
            }}
            placeholder="收藏夹名称"
            maxLength={30}
            className="w-28 bg-transparent text-xs text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
          />
          {busy
            ? <Loader2 size={13} className="animate-spin text-indigo-500" />
            : <button onClick={submitCreate} aria-label="确认新建" className="text-emerald-600"><Check size={13} /></button>}
          <button onClick={() => { setCreating(false); setNewName(''); }} aria-label="取消" className="text-zinc-400"><X size={13} /></button>
        </span>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-indigo-400"
        >
          <FolderPlus size={13} /> 新建收藏夹
        </button>
      )}
    </div>
  );
}

function Count({ n, active }: { n: number; active?: boolean }) {
  if (!n) return null;
  return (
    <span className={['tabular-nums text-[0.65rem]', active ? 'text-white/80' : 'text-zinc-400'].join(' ')}>
      {n}
    </span>
  );
}
