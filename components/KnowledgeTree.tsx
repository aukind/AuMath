'use client';

// 动态知识点树：直接从 topics（导入题目时自动打标长出来的章节→细分点）渲染，带题数徽章、
// 可展开、空节点（无题）自动隐藏。点任意知识点 → /?topic=id 筛题（章节会聚合其全部子知识点）。
// 取代旧的写死 6 个 CORE_TOPICS 的 TopicCategories。Admin 保留拖题到知识点打标。
import { useState } from 'react';
import Link from 'next/link';
import { useDroppable } from '@dnd-kit/core';
import { BookOpen, FolderTree, ChevronRight, Loader2, Hash } from 'lucide-react';
import { useSoftNav, isPlainLeftClick } from '@/components/ui/useSoftNav';
import type { TopicWithChildren } from '@/types/database';

interface Props {
  topics: TopicWithChildren[];
  selectedId?: string;
  isAdmin?: boolean;
}

const hasQ = (t: TopicWithChildren) => (t.questionCount ?? 0) > 0;

/** 含 selectedId 的所有祖先节点 id（用于进场自动展开到选中项）。 */
function ancestorsOf(roots: TopicWithChildren[], targetId: string): Set<string> {
  const path: string[] = [];
  const out = new Set<string>();
  const dfs = (nodes: TopicWithChildren[]): boolean => {
    for (const n of nodes) {
      path.push(n.id);
      if (n.id === targetId || dfs(n.children)) { path.slice(0, -1).forEach((id) => out.add(id)); path.pop(); return true; }
      path.pop();
    }
    return false;
  };
  dfs(roots);
  return out;
}

export default function KnowledgeTree({ topics, selectedId, isAdmin = false }: Props) {
  const populatedRoots = topics.filter(hasQ);
  const [expanded, setExpanded] = useState<Set<string>>(() => (selectedId ? ancestorsOf(topics, selectedId) : new Set()));

  if (populatedRoots.length === 0) {
    return (
      <div className="px-2 py-6 text-center">
        <FolderTree size={22} className="mx-auto text-zinc-300 dark:text-zinc-600" />
        <p className="mt-2 text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
          还没有已打标的题目。<br />导入试卷 / 录题并标注知识点后，<br />这里会按知识点自动归类。
        </p>
      </div>
    );
  }

  const toggle = (id: string) =>
    setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <nav className="space-y-0.5">
      {populatedRoots.map((root) => (
        <TreeNode key={root.id} node={root} depth={0} selectedId={selectedId} expanded={expanded} onToggle={toggle} isAdmin={isAdmin} />
      ))}
    </nav>
  );
}

interface NodeProps {
  node: TopicWithChildren;
  depth: number;
  selectedId?: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  isAdmin: boolean;
}

function TreeNode({ node, depth, selectedId, expanded, onToggle, isAdmin }: NodeProps) {
  const { navigate, isPending, pendingHref } = useSoftNav();
  const populatedChildren = node.children.filter(hasQ);
  const hasChildren = populatedChildren.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = node.id === selectedId;
  const href = isSelected ? '/' : `/?topic=${node.id}`;
  const loading = isPending && pendingHref === href;
  const active = isSelected || loading;

  const onNav = (e: React.MouseEvent) => { if (!isPlainLeftClick(e)) return; e.preventDefault(); navigate(href); };

  const rowInner = (
    <>
      {hasChildren ? (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(node.id); }}
          className="-ml-1 shrink-0 rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          aria-label={isOpen ? '收起' : '展开'}
        >
          <ChevronRight size={13} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        </button>
      ) : (
        <span className="shrink-0">{loading ? <Loader2 size={13} className="animate-spin" /> : depth === 0 ? <BookOpen size={13} className="opacity-50" /> : <Hash size={11} className="opacity-40" />}</span>
      )}
      <span className="flex-1 truncate">{node.name}</span>
      <span className="shrink-0 rounded-full bg-zinc-100 px-1.5 text-[10px] tabular-nums text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">{node.questionCount}</span>
    </>
  );

  const rowClass = [
    'flex items-center gap-1.5 rounded-lg py-1.5 pr-1.5 text-sm transition-colors',
    depth === 0 ? 'font-semibold' : 'font-normal',
    active
      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
      : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
  ].join(' ');
  const pad = { paddingLeft: `${0.5 + depth * 0.9}rem` };

  return (
    <>
      {isAdmin
        ? <DroppableRow topicId={node.id} name={node.name} href={href} className={rowClass} style={pad} onClick={onNav}>{rowInner}</DroppableRow>
        : <Link href={href} onClick={onNav} aria-current={active ? 'page' : undefined} className={rowClass} style={pad}>{rowInner}</Link>}
      {hasChildren && isOpen && populatedChildren.map((c) => (
        <TreeNode key={c.id} node={c} depth={depth + 1} selectedId={selectedId} expanded={expanded} onToggle={onToggle} isAdmin={isAdmin} />
      ))}
    </>
  );
}

// Admin：每个知识点行可作为拖放目标（把题目卡拖上来即打该知识点标签）。
function DroppableRow({
  topicId, name, href, className, style, onClick, children,
}: {
  topicId: string; name: string; href: string; className: string; style: React.CSSProperties;
  onClick: (e: React.MouseEvent) => void; children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: topicId, data: { name } });
  return (
    <Link
      ref={setNodeRef}
      href={href}
      onClick={onClick}
      className={`${className} ${isOver ? 'ring-2 ring-blue-400 ring-inset dark:ring-blue-600' : ''}`}
      style={style}
    >
      {children}
      {isOver && <span className="ml-1 shrink-0 text-[10px] font-bold text-blue-600 dark:text-blue-400">放入</span>}
    </Link>
  );
}
