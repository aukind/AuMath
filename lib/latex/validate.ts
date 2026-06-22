/**
 * 录入期 LaTeX 渲染校验闸门。
 *
 * 规范化（normalizeLatex）只保证「形式整齐」，并不保证「KaTeX 能渲染」。
 * 批量录入 600 套 / ~1.2 万题时，少配对括号、漏操作数（`x_`）、`_{ {{{}}}}` 残骸
 * 这类「看着像公式但渲染即报错」的坏题会静默入库，线上 throwOnError:false
 * 把它降级成红字才被发现——返工成本极高。
 *
 * 这里用 KaTeX 在服务端**真渲染**每段 `$...$` / `$$...$$`，把渲染失败的公式
 * 在发布前就计数标出。纯 CPU、零 API 成本、确定性。
 */

import katex from 'katex';
import { extractRegions } from '@/lib/normalizeLatex';

export interface LatexError {
  /** 出错的公式体（不含 $ 定界符） */
  body: string;
  /** KaTeX 报错信息 */
  message: string;
}

/**
 * 用 KaTeX 逐段渲染一个混合「文本 + 公式」字符串里的所有数学区域，
 * 返回无法渲染的公式与报错。返回空数组 = 全部可渲染。
 *
 * 复用 normalizeLatex 的 extractRegions（同一个扫描器，避免两套实现发散）。
 */
export function findLatexErrors(input: string): LatexError[] {
  if (!input) return [];
  const errors: LatexError[] = [];
  for (const region of extractRegions(input)) {
    if (region.kind === 'text') continue;
    const body = region.body.trim();
    if (!body) continue;
    try {
      katex.renderToString(body, {
        throwOnError: true,
        // strict:'ignore' 只在「真错误」（解析失败/未知命令）时抛，
        // 不为排版警告（如 Unicode 字符）误报。
        strict: 'ignore',
        displayMode: region.kind === 'display',
      });
    } catch (e) {
      errors.push({ body, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return errors;
}

export interface QuestionLatexReport {
  /** 渲染失败的公式总数（题面 + 选项 + 答案 + 解析合计） */
  errorCount: number;
  /** 每条失败公式的可读描述，供校对时定位 */
  details: string[];
}

/** 校验一道题所有字段里的公式。errorCount=0 表示全部可渲染。 */
export function validateQuestionLatex(q: {
  content?: string;
  options?: string[];
  answer?: string;
  analysis?: string;
}): QuestionLatexReport {
  const fields: string[] = [
    q.content ?? '',
    ...(q.options ?? []),
    q.answer ?? '',
    q.analysis ?? '',
  ];
  const details: string[] = [];
  for (const field of fields) {
    for (const err of findLatexErrors(field)) {
      // 截断超长公式体，避免 details 失控
      const preview = err.body.length > 60 ? `${err.body.slice(0, 60)}…` : err.body;
      details.push(`$${preview}$ → ${err.message}`);
    }
  }
  return { errorCount: details.length, details };
}
