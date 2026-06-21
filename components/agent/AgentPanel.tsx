'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  tools?: { name: string; status?: string }[];
}

type Session = { isAdmin: boolean } | null;

const TOOL_LABEL: Record<string, string> = {
  search_questions: '搜索题目',
  semantic_search_questions: '语义检索',
  get_question: '读取题目',
  list_favorite_folders: '读取收藏夹',
  create_question: '录入题目',
  suggest_knowledge_points: '识别知识点',
  toggle_favorite: '收藏/取消',
  create_favorite_folder: '新建收藏夹',
  move_favorites_to_folder: '移动收藏',
  backfill_knowledge_points: '批量打标',
  backfill_embeddings: '批量向量',
  delete_question: '删除题目',
};

export default function AgentPanel() {
  const [session, setSession] = useState<Session>(undefined as unknown as Session);
  const [open, setOpen] = useState(false);
  const [autopilot, setAutopilot] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 会话探测：未登录则整个面板不渲染
  useEffect(() => {
    fetch('/api/agent')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSession(d ? { isAdmin: !!d.isAdmin } : null))
      .catch(() => setSession(null));
  }, []);

  // 全局快捷键 ⌘/Ctrl+Shift+A
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    const history = [...messages, { role: 'user' as const, content: text }];
    setMessages([...history, { role: 'assistant', content: '', tools: [] }]);
    setInput('');
    setBusy(true);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          autopilot,
        }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => '请求失败'));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: { type: string; delta?: string; name?: string; status?: string; error?: string };
          try { ev = JSON.parse(line); } catch { continue; }
          setMessages((prev) => {
            const next = [...prev];
            const last = { ...next[next.length - 1] };
            const tools = [...(last.tools ?? [])];
            if (ev.type === 'text') last.content += ev.delta ?? '';
            else if (ev.type === 'tool_start') tools.push({ name: ev.name! });
            else if (ev.type === 'tool_end') {
              const i = tools.map((t) => t.name).lastIndexOf(ev.name!);
              if (i >= 0) tools[i] = { ...tools[i], status: ev.status };
            } else if (ev.type === 'error') last.content += `\n\n⚠️ ${ev.error}`;
            last.tools = tools;
            next[next.length - 1] = last;
            return next;
          });
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], content: `⚠️ ${e instanceof Error ? e.message : '出错了'}` };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, autopilot]);

  if (session === null || session === undefined) {
    // undefined=探测中, null=未登录：都不渲染入口
    return null;
  }

  return (
    <>
      {/* 浮动入口 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="AI 助手 (⌘/Ctrl+Shift+A)"
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg transition hover:scale-105 dark:bg-white dark:text-neutral-900"
        >
          <span className="text-lg">✦</span>
        </button>
      )}

      {/* 侧边抽屉 */}
      {open && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-neutral-200 bg-white/95 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-950/95">
          <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">AuMath 助手</span>
              {session.isAdmin && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  管理员·全权
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {session.isAdmin && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-500" title="开启后不可逆操作（如删除）不再二次确认，仍记审计">
                  <input type="checkbox" checked={autopilot} onChange={(e) => setAutopilot(e.target.checked)} className="accent-amber-500" />
                  自动驾驶
                </label>
              )}
              <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">✕</button>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="mt-8 text-center text-sm text-neutral-400">
                问我「找几道圆锥曲线离心率的题」<br />或「录一道关于导数单调性的填空题」。
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                {m.tools && m.tools.length > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {m.tools.map((t, j) => (
                      <span key={j} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        {t.status === undefined ? '⏳' : t.status === 'ok' ? '✓' : t.status === 'needs_confirmation' ? '⚠️' : '✕'}
                        {TOOL_LABEL[t.name] ?? t.name}
                      </span>
                    ))}
                  </div>
                )}
                <div
                  className={
                    'inline-block max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ' +
                    (m.role === 'user'
                      ? 'bg-neutral-900 text-left text-white dark:bg-white dark:text-neutral-900'
                      : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100')
                  }
                >
                  {m.content || (busy && i === messages.length - 1 ? '…' : '')}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="让 Claude 帮你干活…"
                className="max-h-32 flex-1 resize-none rounded-xl border border-neutral-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400 dark:border-neutral-700"
              />
              <button
                onClick={send}
                disabled={busy || !input.trim()}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
              >
                {busy ? '…' : '发送'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
