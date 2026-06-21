'use client';

// 白板编辑器（@xyflow/react）。无限画布上摆放「文本卡 / 笔记卡 / 定理卡 / 题卡」并连线 + 卡片着色；
// 整图防抖自动保存。经 CanvasBoard 以 dynamic(ssr:false) 加载，避免 ReactFlow 在服务端渲染。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge, Handle, Position, useReactFlow,
  type Node, type Edge, type Connection, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ChevronLeft, Type, NotebookPen, Sigma, FileText, Trash2, Globe, Lock, Check, Loader2,
  ExternalLink, X, Palette, Search,
} from 'lucide-react';
import { saveCanvas, deleteCanvas } from '@/app/actions/canvas';
import { searchAll } from '@/app/actions/search';
import type { CanvasDoc, CanvasData, CanvasNodeData } from '@/types/canvas';

type Ref = { id: string; title: string };

// 卡片着色板：key → 卡面 className（含浅/深色）。default 走各类型自带配色。
const CARD_COLORS: Record<string, string> = {
  rose: 'border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10',
  amber: 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10',
  emerald: 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10',
  sky: 'border-sky-300 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-500/10',
  violet: 'border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10',
};
const SWATCHES: { key: string; dot: string }[] = [
  { key: 'rose', dot: '#fb7185' }, { key: 'amber', dot: '#fbbf24' }, { key: 'emerald', dot: '#34d399' },
  { key: 'sky', dot: '#38bdf8' }, { key: 'violet', dot: '#a78bfa' },
];

function cardClass(d: CanvasNodeData, fallback: string, selected: boolean, ring: string) {
  const base = d.color && CARD_COLORS[d.color] ? CARD_COLORS[d.color] : fallback;
  return `w-52 rounded-xl border px-3 py-2 text-sm shadow-sm ${base} ${selected ? `ring-2 ${ring}` : ''}`;
}
const handles = (color: string) => (
  <>
    <Handle type="target" position={Position.Left} className={`!h-2 !w-2 ${color}`} />
    <Handle type="source" position={Position.Right} className={`!h-2 !w-2 ${color}`} />
  </>
);

// ── 文本卡 ──────────────────────────────────────────────
function TextCardNode({ id, data, selected }: NodeProps) {
  const d = data as CanvasNodeData;
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.text ?? '');
  const commit = () => { updateNodeData(id, { text: draft }); setEditing(false); };
  return (
    <div className={cardClass(d, 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900', !!selected, 'ring-rose-300/50')}>
      {handles('!bg-rose-400')}
      {editing ? (
        <textarea
          autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} rows={3}
          className="w-full resize-none bg-transparent text-zinc-800 outline-none dark:text-zinc-100" placeholder="输入文本…"
        />
      ) : (
        <div onDoubleClick={() => { setDraft(d.text ?? ''); setEditing(true); }} className="min-h-[24px] whitespace-pre-wrap break-words text-zinc-800 dark:text-zinc-100">
          {d.text?.trim() || <span className="text-zinc-400">双击编辑</span>}
        </div>
      )}
    </div>
  );
}

// ── 笔记卡 ──────────────────────────────────────────────
function NoteCardNode({ data, selected }: NodeProps) {
  const d = data as CanvasNodeData;
  return (
    <div className={cardClass(d, 'border-cyan-200 bg-cyan-50/70 dark:border-cyan-500/30 dark:bg-cyan-500/10', !!selected, 'ring-cyan-300/50')}>
      {handles('!bg-cyan-400')}
      <div className="mb-1 flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300">
        <NotebookPen size={13} className="shrink-0" /><span className="flex-1 truncate font-medium">{d.title || '笔记'}</span>
      </div>
      {d.noteId && <Link href={`/notes/${d.noteId}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:underline dark:text-cyan-400">打开 <ExternalLink size={11} /></Link>}
    </div>
  );
}

// ── 定理卡 ──────────────────────────────────────────────
function TheoremCardNode({ data, selected }: NodeProps) {
  const d = data as CanvasNodeData;
  return (
    <div className={cardClass(d, 'border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10', !!selected, 'ring-amber-300/50')}>
      {handles('!bg-amber-400')}
      <div className="mb-1 flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
        <Sigma size={13} className="shrink-0" /><span className="flex-1 truncate font-medium">{d.title || '定理'}</span>
      </div>
      {d.title && <Link href={`/explore?focus=${encodeURIComponent(d.title)}&type=theorem`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-amber-600 hover:underline dark:text-amber-400">星图定位 <ExternalLink size={11} /></Link>}
    </div>
  );
}

// ── 题卡 ──────────────────────────────────────────────
function QuestionCardNode({ data, selected }: NodeProps) {
  const d = data as CanvasNodeData;
  return (
    <div className={cardClass(d, 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900', !!selected, 'ring-zinc-300/50')}>
      {handles('!bg-zinc-400')}
      <div className="mb-1 flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
        <FileText size={13} className="shrink-0" /><span className="flex-1 truncate font-medium">{d.title || '题目'}</span>
      </div>
      {d.questionId && <Link href={`/question/${d.questionId}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400">打开 <ExternalLink size={11} /></Link>}
    </div>
  );
}

function serialize(nodes: Node[], edges: Edge[]): CanvasData {
  const allowed = new Set(['text', 'note', 'theorem', 'question']);
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: (allowed.has(n.type ?? '') ? n.type : 'text') as CanvasData['nodes'][number]['type'],
      position: n.position,
      data: n.data as CanvasNodeData,
      width: typeof n.width === 'number' ? n.width : undefined,
      height: typeof n.height === 'number' ? n.height : undefined,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: typeof e.label === 'string' ? e.label : undefined })),
  };
}

function genId() { return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

/** 题目命中标签：出处+年份+题号，回退正文片段。 */
function qLabel(q: { source?: string | null; year?: number | null; content?: string | null; metadata?: { exam_number?: unknown } | null }): string {
  const examNo = String(q.metadata?.exam_number ?? '').trim();
  const head = String(q.source ?? (q.year ?? '')).trim();
  const tag = [head, examNo].filter(Boolean).join(' ');
  if (tag) return tag;
  return ((q.content ?? '').replace(/\$[^$]*\$/g, '').replace(/\s+/g, ' ').trim().slice(0, 30)) || '题目';
}

function Flow({ doc, notes, theorems }: { doc: CanvasDoc; notes: Ref[]; theorems: Ref[] }) {
  const router = useRouter();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(doc.data.nodes as unknown as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(doc.data.edges as unknown as Edge[]);
  const [title, setTitle] = useState(doc.title);
  const [isPublic, setIsPublic] = useState(doc.isPublic);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [picker, setPicker] = useState<null | 'note' | 'theorem' | 'question'>(null);
  const [pickQuery, setPickQuery] = useState('');
  const [qHits, setQHits] = useState<Ref[]>([]);
  const { screenToFlowPosition, updateNodeData } = useReactFlow();

  const nodeTypes = useMemo(() => ({ text: TextCardNode, note: NoteCardNode, theorem: TheoremCardNode, question: QuestionCardNode }), []);
  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);

  // 双击连线：编辑关系标签（如「推出 / 反例 / 同源」）。留空清除。
  const onEdgeDoubleClick = useCallback((_e: React.MouseEvent, edge: Edge) => {
    const cur = typeof edge.label === 'string' ? edge.label : '';
    const next = window.prompt('连线标签（留空清除）', cur);
    if (next === null) return;
    setEdges((es) => es.map((x) => (x.id === edge.id ? { ...x, label: next.trim() || undefined } : x)));
  }, [setEdges]);

  const placeCount = useRef(0);
  const dropPoint = () => {
    const p = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const k = placeCount.current++;
    return { x: p.x + (k % 6) * 30, y: p.y + (k % 6) * 30 };
  };
  const add = (type: string, data: CanvasNodeData) => {
    setNodes((ns) => ns.concat({ id: genId(), type, position: dropPoint(), data } as Node));
    setPicker(null); setPickQuery('');
  };

  // 题卡搜索（防抖；setState 入异步回调，满足 set-state-in-effect）。
  useEffect(() => {
    if (picker !== 'question') return;
    const q = pickQuery.trim();
    const t = setTimeout(async () => {
      if (!q) { setQHits([]); return; }
      try {
        const res = await searchAll(q);
        setQHits(res.questions.slice(0, 12).map((qq) => ({ id: qq.id, title: qLabel(qq as never) })));
      } catch { setQHits([]); }
    }, 240);
    return () => clearTimeout(t);
  }, [pickQuery, picker]);

  // 防抖自动保存。
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const t = setTimeout(async () => {
      setStatus('saving');
      const res = await saveCanvas({ id: doc.id, title, isPublic, data: serialize(nodes, edges) });
      setStatus(res.ok ? 'saved' : 'idle');
    }, 800);
    return () => clearTimeout(t);
  }, [nodes, edges, title, isPublic, doc.id]);

  const onDelete = async () => {
    if (!confirm(`删除白板「${title}」？此操作不可撤销。`)) return;
    const res = await deleteCanvas(doc.id);
    if (res.ok) router.push('/canvas'); else alert(res.error);
  };

  const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
  const paint = (color?: string) => selectedIds.forEach((id) => updateNodeData(id, { color }));

  const listRefs = picker === 'note' ? notes : picker === 'theorem' ? theorems : [];
  const filtered = pickQuery.trim() ? listRefs.filter((r) => r.title.toLowerCase().includes(pickQuery.trim().toLowerCase())) : listRefs;

  return (
    <div className="relative h-dvh w-full">
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
        onEdgeDoubleClick={onEdgeDoubleClick}
        nodeTypes={nodeTypes} fitView proOptions={{ hideAttribution: true }}
        className="bg-zinc-50 dark:bg-zinc-950"
      >
        <Background gap={18} color="#d4d4d8" />
        <Controls className="!shadow-sm" />
        <MiniMap pannable zoomable className="!hidden sm:!block" />
      </ReactFlow>

      {/* 顶栏工具条 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 p-3">
        <Link href="/canvas" className="pointer-events-auto inline-flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white/80 px-2.5 py-1.5 text-sm text-zinc-600 shadow-sm backdrop-blur hover:text-zinc-900 dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:text-zinc-300">
          <ChevronLeft size={15} /> 白板
        </Link>
        <input
          value={title} onChange={(e) => setTitle(e.target.value)} placeholder="白板标题"
          className="pointer-events-auto w-36 rounded-xl border border-zinc-200/70 bg-white/80 px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm outline-none backdrop-blur focus:border-rose-400 dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:text-zinc-100 sm:w-56"
        />
        <div className="pointer-events-auto ml-auto flex flex-wrap items-center gap-1.5">
          <button onClick={() => add('text', { text: '' })} className="inline-flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white/80 px-2.5 py-1.5 text-sm text-zinc-700 shadow-sm backdrop-blur hover:bg-zinc-100 dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800"><Type size={15} /> <span className="hidden md:inline">文本</span></button>
          <button onClick={() => { setPicker('note'); setPickQuery(''); }} className="inline-flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white/80 px-2.5 py-1.5 text-sm text-cyan-700 shadow-sm backdrop-blur hover:bg-cyan-50 dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:text-cyan-300 dark:hover:bg-cyan-500/10"><NotebookPen size={15} /> <span className="hidden md:inline">笔记</span></button>
          <button onClick={() => { setPicker('theorem'); setPickQuery(''); }} className="inline-flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white/80 px-2.5 py-1.5 text-sm text-amber-700 shadow-sm backdrop-blur hover:bg-amber-50 dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:text-amber-300 dark:hover:bg-amber-500/10"><Sigma size={15} /> <span className="hidden md:inline">定理</span></button>
          <button onClick={() => { setPicker('question'); setPickQuery(''); setQHits([]); }} className="inline-flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white/80 px-2.5 py-1.5 text-sm text-indigo-700 shadow-sm backdrop-blur hover:bg-indigo-50 dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:text-indigo-300 dark:hover:bg-indigo-500/10"><FileText size={15} /> <span className="hidden md:inline">题目</span></button>

          {/* 着色（选中节点后可用） */}
          <div className="flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white/80 px-2 py-1.5 shadow-sm backdrop-blur dark:border-zinc-700/70 dark:bg-zinc-900/80" title={selectedIds.length ? '给选中卡片着色' : '先选中卡片再着色'}>
            <Palette size={14} className={selectedIds.length ? 'text-zinc-500' : 'text-zinc-300'} />
            {SWATCHES.map((s) => (
              <button key={s.key} disabled={!selectedIds.length} onClick={() => paint(s.key)} className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10 disabled:opacity-40" style={{ backgroundColor: s.dot }} />
            ))}
            <button disabled={!selectedIds.length} onClick={() => paint(undefined)} title="清除颜色" className="h-3.5 w-3.5 rounded-full border border-zinc-300 bg-white disabled:opacity-40 dark:bg-zinc-700" />
          </div>

          <button onClick={() => setIsPublic((p) => !p)} title={isPublic ? '公开' : '私有'} className="inline-flex items-center rounded-xl border border-zinc-200/70 bg-white/80 px-2 py-1.5 text-sm text-zinc-600 shadow-sm backdrop-blur dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:text-zinc-300">{isPublic ? <Globe size={15} className="text-emerald-500" /> : <Lock size={15} />}</button>
          <button onClick={onDelete} className="inline-flex items-center rounded-xl border border-zinc-200/70 bg-white/80 px-2 py-1.5 text-sm text-red-600 shadow-sm backdrop-blur hover:bg-red-50 dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:hover:bg-red-500/10"><Trash2 size={15} /></button>
          <span className="flex w-14 items-center gap-1 text-xs text-zinc-400">{status === 'saving' ? <><Loader2 size={12} className="animate-spin" /> 保存中</> : status === 'saved' ? <><Check size={12} className="text-emerald-500" /> 已保存</> : null}</span>
        </div>
      </div>

      {/* 选择器（笔记/定理/题目） */}
      {picker && (
        <div className="pointer-events-auto absolute right-3 top-16 z-20 w-72 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-zinc-500">{picker === 'note' ? '加入笔记卡' : picker === 'theorem' ? '加入定理卡' : '加入题卡'}</span>
            <button onClick={() => setPicker(null)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"><X size={14} /></button>
          </div>
          <div className="relative mb-1.5">
            <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input autoFocus value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} placeholder={picker === 'question' ? '搜索题目…' : '筛选…'} className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-7 pr-2.5 text-sm outline-none focus:border-rose-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100" />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {picker === 'question' ? (
              qHits.length === 0
                ? <p className="px-2 py-3 text-center text-xs text-zinc-400">{pickQuery.trim() ? '无匹配题目' : '输入关键词搜索题目'}</p>
                : qHits.map((q) => <button key={q.id} onClick={() => add('question', { questionId: q.id, title: q.title })} className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-indigo-50 dark:text-zinc-200 dark:hover:bg-indigo-500/10">{q.title}</button>)
            ) : filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-zinc-400">无匹配</p>
            ) : filtered.map((r) => (
              <button key={r.id} onClick={() => add(picker, picker === 'note' ? { noteId: r.id, title: r.title } : { theoremId: r.id, title: r.title })} className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800">{r.title}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CanvasEditor({ doc, notes, theorems }: { doc: CanvasDoc; notes: Ref[]; theorems: Ref[] }) {
  return (
    <ReactFlowProvider>
      <Flow doc={doc} notes={notes} theorems={theorems} />
    </ReactFlowProvider>
  );
}
