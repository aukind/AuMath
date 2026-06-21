'use client';

// 笔记详情壳：阅读态显示服务端渲染的正文（children）+ 出链/反链面板；
// 编辑态切换为标题/正文输入，保存后 router.refresh() 让 RSC 重渲正文。
import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Trash2, Save, X, Globe, Lock, Link2, CornerUpLeft, ArrowUpRight, Sparkles, Plus } from 'lucide-react';
import { updateNote, deleteNote, linkMention } from '@/app/actions/notes';
import type { NoteDetail, NoteOutLink, UnlinkedMention } from '@/types/notes';

const TYPE_LABEL: Record<NoteOutLink['targetType'], string> = {
  topic: '知识点', theorem: '定理', question: '题目', note: '笔记',
};

/** 出链落地 URL：已解析的尽量精确，悬挂的回退到搜索/聚焦。 */
function outHref(l: NoteOutLink): string {
  const enc = encodeURIComponent(l.label);
  switch (l.targetType) {
    case 'note':     return l.targetId ? `/notes/${l.targetId}` : `/notes?ref=${enc}`;
    case 'theorem':  return `/explore?focus=${enc}&type=theorem`;
    case 'question': return `/search?q=${enc}`;
    case 'topic':
    default:         return `/explore?focus=${enc}`;
  }
}

export default function NoteDetailClient({
  note,
  startEditing = false,
  mentions = [],
  children,
}: {
  note: NoteDetail;
  startEditing?: boolean;
  mentions?: UnlinkedMention[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(startEditing);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.bodyMd);
  const [isPublic, setIsPublic] = useState(note.isPublic);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDel, setConfirmDel] = useState(false);

  const save = () => {
    const t = title.trim();
    if (!t) { setError('标题不能为空'); return; }
    setError(null);
    startTransition(async () => {
      const res = await updateNote({ id: note.id, title: t, bodyMd: body, isPublic });
      if (res.ok) {
        setEditing(false);
        router.refresh(); // 重渲 RSC 正文 + 重建出链/反链面板
      } else {
        setError(res.error);
      }
    });
  };

  const cancel = () => {
    setTitle(note.title);
    setBody(note.bodyMd);
    setIsPublic(note.isPublic);
    setError(null);
    setEditing(false);
  };

  const remove = () => {
    startTransition(async () => {
      const res = await deleteNote(note.id);
      if (res.ok) router.push('/notes');
      else setError(res.error);
    });
  };

  const link = (m: UnlinkedMention) => {
    startTransition(async () => {
      const res = await linkMention(note.id, m.type, m.name);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  };

  return (
    <div>
      {/* 标题行 + 操作 */}
      <div className="mb-4 flex items-start gap-3">
        {editing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-lg font-bold text-zinc-900 outline-none focus:border-cyan-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        ) : (
          <h1 className="flex flex-1 items-center gap-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {note.title}
            {note.isPublic
              ? <Globe size={16} className="text-emerald-500" aria-label="公开" />
              : <Lock size={16} className="text-zinc-400" aria-label="私有" />}
          </h1>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <>
              <button onClick={cancel} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
                <X size={15} /> 取消
              </button>
              <button onClick={save} disabled={pending} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60">
                <Save size={15} /> {pending ? '保存中…' : '保存'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                <Pencil size={14} /> 编辑
              </button>
              <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-zinc-700 dark:hover:bg-red-500/10">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* 正文 */}
      {editing ? (
        <div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={'支持 Markdown 与 $LaTeX$。\n双链：[[知识点]] · [[thm:韦达定理]] · [[note:另一篇笔记]]\n嵌入：![[另一篇笔记]] 整段插入；![[笔记#^锚点]] 只嵌某段（段末写 ^锚点 起锚）'}
            rows={18}
            className="w-full resize-y rounded-xl border border-zinc-300 bg-white px-4 py-3 font-mono text-sm leading-relaxed text-zinc-900 outline-none focus:border-cyan-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-cyan-600" />
            公开此笔记（他人可只读）
          </label>
        </div>
      ) : (
        <article className="rounded-xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          {children}
        </article>
      )}

      {/* 未链接提及：正文里出现却没建双链的知识点/定理，一键补链 */}
      {!editing && mentions.length > 0 && (
        <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/[0.07]">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <Sparkles size={15} /> 未链接提及 · {mentions.length}
            <span className="font-normal text-xs text-amber-600/70 dark:text-amber-400/70">正文提到了它们，点一下即可建双链</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {mentions.map((m) => (
              <button
                key={`${m.type}-${m.name}`}
                onClick={() => link(m)}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-sm text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/40 dark:bg-zinc-900 dark:text-amber-200 dark:hover:bg-amber-500/10"
              >
                <Plus size={12} /> {m.name}
                <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">{m.type === 'topic' ? '知识点' : '定理'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 出链 / 反链面板（仅阅读态） */}
      {!editing && (note.outLinks.length > 0 || note.backlinks.length > 0) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {note.outLinks.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                <ArrowUpRight size={15} className="text-cyan-600 dark:text-cyan-400" /> 出链 · {note.outLinks.length}
              </h3>
              <ul className="space-y-1.5">
                {note.outLinks.map((l, i) => (
                  <li key={i}>
                    <Link href={outHref(l)} className="flex items-center gap-1.5 text-sm text-cyan-700 hover:underline dark:text-cyan-300">
                      <Link2 size={13} className="shrink-0" />
                      <span className="truncate">{l.label}</span>
                      <span className="shrink-0 rounded bg-zinc-100 px-1 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{TYPE_LABEL[l.targetType]}</span>
                      {!l.targetId && <span className="shrink-0 text-[11px] text-amber-500">未建立</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {note.backlinks.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                <CornerUpLeft size={15} className="text-indigo-600 dark:text-indigo-400" /> 反向链接 · {note.backlinks.length}
              </h3>
              <ul className="space-y-1.5">
                {note.backlinks.map((b) => (
                  <li key={b.noteId}>
                    <Link href={`/notes/${b.noteId}`} className="flex items-center gap-1.5 truncate text-sm text-indigo-700 hover:underline dark:text-indigo-300">
                      <Link2 size={13} className="shrink-0" /> <span className="truncate">{b.noteTitle}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* 删除确认 */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDel(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">删除笔记？</h2>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">「{note.title}」及其出链将被删除，此操作不可撤销。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDel(false)} className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">取消</button>
              <button onClick={remove} disabled={pending} className="rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
                {pending ? '删除中…' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
