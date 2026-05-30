// UGC 净化与 KaTeX 复杂度限流
//
// 论坛内容全部来自用户输入，是 XSS 的重灾区。这里提供两道纵深防御：
//   1. sanitizeText —— 剥离一切 HTML 标签，只保留纯文本（DOMPurify 优先，
//      SSR/无 window 时回退到正则）。
//   2. KaTeX 限流参数 —— 控制宏展开次数与单条公式长度，防止「超长无意义公式」
//      把浏览器主线程拖死（KaTeX 同步渲染，复杂度爆炸会直接卡死页面）。

import type { KatexOptions } from 'katex';
import DOMPurify from 'dompurify';

/** 单条公式允许的最大字符数；超过即视为恶意/无意义输入，截断后给出标记。 */
export const MAX_EQUATION_LENGTH = 1000;

/**
 * 剥离 HTML 标签，仅保留文本内容。
 *
 * 浏览器侧用 DOMPurify（成熟、覆盖各种绕过手法）；服务端渲染阶段没有
 * `window`，退化为正则去标签。注意：我们的内容渲染管线最终只产出
 * 「纯文本 + $公式$」的 Markdown，结构本身不含用户可控 HTML，此函数是
 * 针对「用户把 <script> 当普通文字打进来」的额外兜底。
 */
export function sanitizeText(input: string): string {
  // DOMPurify 需要 DOM；SSR（无 window）时退化为正则去标签，
  // 客户端 hydration 后真正的 DOMPurify 会再清洗一遍。
  if (typeof window === 'undefined') {
    return input.replace(/<\/?[^>]*>/g, '');
  }
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}

/**
 * 限制单条公式的复杂度。返回安全文本与是否被截断的标记，
 * 调用方可据此在 UI 上提示「公式过长已折叠」。
 */
export function clampEquation(equation: string): {
  safe: string;
  truncated: boolean;
} {
  const trimmed = equation.trim();
  if (trimmed.length <= MAX_EQUATION_LENGTH) {
    return { safe: trimmed, truncated: false };
  }
  return { safe: trimmed.slice(0, MAX_EQUATION_LENGTH), truncated: true };
}

/**
 * 论坛内容统一的 KaTeX 渲染参数：
 * - trust:false        禁用 \href 等可注入 javascript: 的可信宏
 * - throwOnError:false 单条公式出错不炸整页，原样降级为红色文本
 * - maxExpand          限制宏递归展开，挡住 \def 自引用导致的指数爆炸
 * - maxSize            限制盒子尺寸，挡住 \rule{0pt}{1e9pt} 这类巨型元素
 */
export const FORUM_KATEX_OPTIONS: KatexOptions = {
  throwOnError: false,
  trust: false,
  strict: 'ignore',
  maxExpand: 256,
  maxSize: 50,
  output: 'html',
  macros: {
    '\\R': '\\mathbb{R}',
    '\\N': '\\mathbb{N}',
    '\\Z': '\\mathbb{Z}',
    '\\Q': '\\mathbb{Q}',
  },
};
