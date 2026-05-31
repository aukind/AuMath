// 题目内容清洗 —— 治本：录题入库时剥掉混进题干的选项枚举；展示侧复用同一逻辑做兜底。
//
// 背景：AI 录题（process-paper.ts）虽已要求「选项只进 options 字段、不要复述进 content」，
// 但模型偶尔不遵守，把 "(A)…(B)…" 或 "A. …\nB. …"（分隔符甚至是被错误转义的字面量 \n）
// 也写进 content，导致题干与选项卡片重复。这里用确定性正则在入库时砍掉，模型再不听话也不影响。

/**
 * content 末尾的选项枚举尾巴：以 A 标记开头、其后出现 B 标记，直到结尾。
 * 标记形如 (A) / A. / A、 / A．（含小写）；分隔符含真实换行、空白或字面量反斜杠-n（"\\n"）。
 */
export const OPTION_TAIL_RE =
  /(?:\\n|\s)*\(?[Aa]\s*[.)、．][\s\S]*?\(?[Bb]\s*[.)、．][\s\S]*$/;

/**
 * 当题目已有独立选项（≥2）时，剥掉 content 末尾重复的选项枚举。
 * 无选项或匹配不到则原样返回。纯字符串函数，前后端通用。
 */
export function stripInlineOptionTail(content: string, hasOptions: boolean): string {
  if (!content || !hasOptions) return content;
  return content.replace(OPTION_TAIL_RE, '').trimEnd();
}
