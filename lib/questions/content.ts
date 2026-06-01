// 题目内容清洗 —— 治本：录题入库时剥掉混进题干的选项枚举；展示侧复用同一逻辑做兜底。
//
// 背景：AI 录题（process-paper.ts）虽已要求「选项只进 options 字段、不要复述进 content」，
// 但模型偶尔不遵守，把 "(A)…(B)…" 或 "A. …\nB. …"（分隔符甚至是被错误转义的字面量 \n）
// 也写进 content，导致题干与选项卡片重复。这里用确定性正则在入库时砍掉，模型再不听话也不影响。

// 括号式选项尾巴：(A)…(B)…到结尾。括号包裹单个字母是明确的选项信号，行内即可安全剥离。
export const PAREN_OPTION_TAIL_RE = /\s*\(\s*[Aa]\s*\)[\s\S]*?\(\s*[Bb]\s*\)[\s\S]*$/;

// 行首式选项尾巴：A. … B. … 到结尾，且 A、B 标记各自必须位于「行首」
// （前面是真实换行或被错误转义的字面量反斜杠-n "\\n"）。标记仅认 . ． )，
// **刻意不认顿号「、」**，以免误伤句中的 "A、B、C" 点列、"$A$、$B$" 等表述。
export const LINE_OPTION_TAIL_RE =
  /(?:\\n|[\n\r])\s*[Aa]\s*[.．)][\s\S]*?(?:\\n|[\n\r])\s*[Bb]\s*[.．)][\s\S]*$/;

/**
 * 当题目已有独立选项（≥2）时，剥掉 content 末尾重复的选项枚举。
 * 仅剥两种明确信号：括号式 (A)…(B)… / 行首式 \nA. … \nB. …。
 * 句中的顿号点列（如 "A、B、C"）不会被误伤。无选项或匹配不到则原样返回。纯字符串函数，前后端通用。
 */
export function stripInlineOptionTail(content: string, hasOptions: boolean): string {
  if (!content || !hasOptions) return content;
  return content.replace(PAREN_OPTION_TAIL_RE, '').replace(LINE_OPTION_TAIL_RE, '').trimEnd();
}

/** 高考选择题题干末尾的作答括号：全角括号 + 两个全角空格（U+3000），贴合试卷排版。 */
export const ANSWER_BLANK = '（　　）';

/** 题干末尾是否已带空作答括号（半/全角均认），用于避免重复追加。 */
export function hasAnswerBlank(stem: string): boolean {
  return /[(（]\s*[)）]\s*$/.test(stem.trimEnd());
}

/** 给选择题题干补上末尾作答括号；已有空括号或空串则原样返回。纯字符串函数，前后端通用。 */
export function withAnswerBlank(stem: string): string {
  const s = stem.trimEnd();
  if (!s || hasAnswerBlank(s)) return stem;
  return `${s}${ANSWER_BLANK}`;
}
