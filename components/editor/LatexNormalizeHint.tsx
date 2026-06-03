'use client';

/**
 * 录题实时规范化提示（Rust→WASM 驱动）。
 *
 * 监听字段内容，防抖后用 WASM 算出规范形；若与当前输入不同，浮出一个非阻塞小条：
 * 「检测到可规范化的写法 · 一键规范化」。点击即把字段替换为规范形。
 *
 * WASM 未构建 / 未加载时本组件渲染 null，完全不影响录题。
 */

import { useEffect, useRef, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { normalizeLatexBrowser } from '@/lib/wasm/normalizeLatexWasmBrowser';

interface Props {
  /** 当前字段值 */
  value: string;
  /** 点击「一键规范化」时回填规范形 */
  onApply: (normalized: string) => void;
  /** 防抖毫秒，默认 400 */
  debounceMs?: number;
}

export default function LatexNormalizeHint({ value, onApply, debounceMs = 400 }: Props) {
  const [canonical, setCanonical] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    // 所有 setState 都放进防抖回调，避免在 effect 体内同步 setState。
    timer.current = setTimeout(async () => {
      if (!value.trim()) {
        setCanonical(null);
        return;
      }
      const out = await normalizeLatexBrowser(value);
      // 仅当 WASM 可用且结果与原值不同才提示
      setCanonical(out !== null && out !== value ? out : null);
    }, value.trim() ? debounceMs : 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, debounceMs]);

  if (canonical === null) return null;

  return (
    <button
      type="button"
      onClick={() => onApply(canonical)}
      title={`规范化为：\n${canonical}`}
      className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 text-[0.6875rem] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
    >
      <Wand2 className="h-3 w-3" />
      检测到可规范化的写法 · 一键规范化
    </button>
  );
}
