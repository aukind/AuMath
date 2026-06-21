'use client';

// 白板编辑器（@xyflow/react）。无限画布上摆放「文本卡 / 笔记卡」并连线；整图防抖自动保存。
// 经 CanvasBoard 以 dynamic(ssr:false) 加载，避免 ReactFlow 在服务端渲染。
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
  ChevronLeft, Type, NotebookPen, Trash2, Globe, Lock, Check, Loader2, ExternalLink, X,
} from 'lucide-react';
import { saveCanvas, deleteCanvas } from '@/app/actions/canvas';
import type { CanvasDoc, CanvasData, CanvasNodeData } from '@/types/canvas';

type NoteRef = { id: string; title: string };

// ── 自定义节点：文本卡 ──────────────────────────────────────────────
function TextCardNode({ id, data, selected }: NodeProps) {
  const d = data as CanvasNodeData;
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.text ?? '');

  const commit = () => { updateNodeData(id, { text: draft }); setEditing(false); };

  return (
    <div className={`min-h-[56px] w-52 rounded-xl border bg-white px-3 py-2 text-sm shadow-sm dark:bg-zinc-900 ${
      selected ? 'border-rose-400 ring-2 ring-rose-300/50' : 'border-zinc-200 dark:border-zinc-700'
    }`}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-rose-400" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-rose-400" />
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          rows={3}
          className="w-full resize-none bg-transparent text-zinc-800 outline-none dark:text-zinc-100"
          placeholder="输入文本…（支持换行）"
        />
      ) : (
        <div
          onDoubleClick={() => { setDraft(d.text ?? ''); setEditing(true); }}
          className="whitespace-pre-wrap break-words text-zinc-800 dark:text-zinc-100"
        >
          {d.text?.trim() || <span className="text-zinc-400">双击编辑</span>}
        </div>
      )}
    </div>
  );
}

// ── 自定义节点：笔记卡 ──────────────────────────────────────────────
function NoteCardNode({ data, selected }: NodeProps) {
  const d = data as CanvasNodeData;
  return (
    <div className={`w-52 rounded-xl border bg-cyan-50/70 px-3 py-2 text-sm shadow-sm dark:bg-cyan-500/10 ${
      selected ? 'border-cyan-400 ring-2 ring-cyan-300/50' : 'border-cyan-200 dark:border-cyan-500/30'
    }`}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-cyan-400" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-cyan-400" />
      <div className="mb-1 flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300">
        <NotebookPen size={13} className="shrink-0" />
        <span className="flex-1 truncate font-medium">{d.title || '笔记'}</span>
      </div>
      {d.noteId && (
        <Link
          href={`/notes/${d.noteId}`}
          className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:underline dark:text-cyan-400"
          onClick={(e) => e.stopPropagation()}
        >
          打开 <ExternalLink size={11} />
        </Link>
      )}
    </div>
  );
}

// 整图去掉运行时瞬态字段，只存业务必要部分。
function serialize(nodes: Node[], edges: Edge[]): CanvasData {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: (n.type === 'note' ? 'note' : 'text'),
      position: n.position,
      data: n.data as CanvasNodeData,
      width: typeof n.width === 'number' ? n.width : undefined,
      height: typeof n.height === 'number' ? n.height : undefined,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: typeof e.label === 'string' ? e.label : undefined })),
  };
}

function genId() {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function Flow({ doc, notes }: { doc: CanvasDoc; notes: NoteRef[] }) {
  const router = useRouter();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(doc.data.nodes as unknown as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(doc.data.edges as unknown as Edge[]);
  const [title, setTitle] = useState(doc.title);
  const [isPublic, setIsPublic] = useState(doc.isPublic);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteQuery, setNoteQuery] = useState('');
  const { screenToFlowPosition } = useReactFlow();

  const nodeTypes = useMemo(() => ({ text: TextCardNode, note: NoteCardNode }), []);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);

  // 视口中心附近级联落新卡，避免叠在一起（确定性偏移，不用 Math.random 以满足 purity 规则）。
  const placeCount = useRef(0);
  const dropPoint = () => {
    const p = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const k = placeCount.current++;
    return { x: p.x + (k % 6) * 30, y: p.y + (k % 6) * 30 };
  };

  const addText = () => {
    setNodes((ns) => ns.concat({ id: genId(), type: 'text', position: dropPoint(), data: { text: '' } } as Node));
  };
  const addNote = (n: NoteRef) => {
    setNodes((ns) => ns.concat({ id: genId(), type: 'note', position: dropPoint(), data: { noteId: n.id, title: n.title } } as Node));
    setPickerOpen(false);
    setNoteQuery('');
  };

  // ── 防抖自动保存：所有 setState 置于定时器回调内（满足 set-state-in-effect） ──
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; } // 跳过初次挂载
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
    if (res.ok) router.push('/canvas');
    else alert(res.error);
  };

  const filteredNotes = noteQuery.trim()
    ? notes.filter((n) => n.title.toLowerCase().includes(noteQuery.trim().toLowerCase()))
    : notes;

  return (
    <div className="relative h-dvh w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        className="bg-zinc-50 dark:bg-zinc-950"
      >
        <Background gap={18} className="!bg-zinc-50 dark:!bg-zinc-950" color="#d4d4d8" />
        <Controls className="!shadow-sm" />
        <MiniMap pannable zoomable className="!hidden sm:!block" />
      </ReactFlow>

      {/* 顶栏工具条 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-2 p-3">
        <Link href="/canvas" className="pointer-events-auto inline-flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white/80 px-2.5 py-1.5 text-sm text-zinc-600 shadow-sm backdrop-blur hover:text-zinc-900 dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:text-zinc-300">
          <ChevronLeft size={15} /> 白板
        </Link>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="pointer-events-auto w-44 rounded-xl border border-zinc-200/70 bg-white/80 px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm outline-none backdrop-blur focus:border-rose-400 dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:text-zinc-100 sm:w-64"
          placeholder="白板标题"
        />
        <div className="pointer-events-auto ml-auto flex items-center gap-2">
          <button onClick={addText} className="inline-flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white/80 px-2.5 py-1.5 text-sm text-zinc-700 shadow-sm backdrop-blur hover:bg-zinc-100 dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800">
            <Type size={15} /> <span className="hidden sm:inline">文本卡</span>
          </button>
          <button onClick={() => setPickerOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white/80 px-2.5 py-1.5 text-sm text-cyan-700 shadow-sm backdrop-blur hover:bg-cyan-50 dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:text-cyan-300 dark:hover:bg-cyan-500/10">
            <NotebookPen size={15} /> <span className="hidden sm:inline">笔记卡</span>
          </button>
          <button onClick={() => setIsPublic((p) => !p)} title={isPublic ? '公开（他人可只读）' : '私有'} className="inline-flex items-center gap-1 rounded-xl border border-zinc-200/70 bg-white/80 px-2 py-1.5 text-sm text-zinc-600 shadow-sm backdrop-blur dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:text-zinc-300">
            {isPublic ? <Globe size={15} className="text-emerald-500" /> : <Lock size={15} />}
          </button>
          <button onClick={onDelete} className="inline-flex items-center rounded-xl border border-zinc-200/70 bg-white/80 px-2 py-1.5 text-sm text-red-600 shadow-sm backdrop-blur hover:bg-red-50 dark:border-zinc-700/70 dark:bg-zinc-900/80 dark:hover:bg-red-500/10">
            <Trash2 size={15} />
          </button>
          <span className="flex w-14 items-center gap-1 text-xs text-zinc-400">
            {status === 'saving' ? <><Loader2 size={12} className="animate-spin" /> 保存中</> : status === 'saved' ? <><Check size={12} className="text-emerald-500" /> 已保存</> : null}
          </span>
        </div>
      </div>

      {/* 笔记卡选择器 */}
      {pickerOpen && (
        <div className="pointer-events-auto absolute right-3 top-16 z-20 w-64 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-xs font-medium text-zinc-500">选择笔记加入白板</span>
            <button onClick={() => setPickerOpen(false)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"><X size={14} /></button>
          </div>
          <input
            autoFocus value={noteQuery} onChange={(e) => setNoteQuery(e.target.value)}
            placeholder="搜索我的笔记…"
            className="mb-1.5 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-cyan-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <div className="max-h-56 overflow-y-auto">
            {filteredNotes.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-zinc-400">没有笔记。先去「我的笔记」新建。</p>
            ) : filteredNotes.map((n) => (
              <button key={n.id} onClick={() => addNote(n)} className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-cyan-50 dark:text-zinc-200 dark:hover:bg-cyan-500/10">
                {n.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CanvasEditor({ doc, notes }: { doc: CanvasDoc; notes: NoteRef[] }) {
  return (
    <ReactFlowProvider>
      <Flow doc={doc} notes={notes} />
    </ReactFlowProvider>
  );
}
