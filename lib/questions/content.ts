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

/**
 * 把 metadata.options 归一化成字符串数组。两种入库形态都兼容：
 *  ① 数组 ["A. …","B. …"]：原样返回（已带标号）。
 *  ② 对象 {"A":"…","B":"…"}：拼成 "A. …" 的 markdown（标号常规字重，贴合高考印刷卷题面零加粗）。
 * 题卡（QuestionCard）与讲义 PDF（LectureDocument）共用，确保选项渲染逻辑完全一致。纯函数，前后端通用。
 */
export function normalizeOptions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).map(
      ([k, v]) => `${k}. ${v}`,
    );
  }
  return [];
}

/**
 * 从答案推断是否「多选题」：答案去掉分隔符后若是 2–4 个 A–H 选项字母（如 "AD"、"BCD"、"B、D"），
 * 即判定为多选。单字母（"A"）或带公式/数字的填空答案（"$-1$"）一律判为非多选。
 * 配对录入（带答案卷）与展示侧兜底共用——既不必依赖模型显式标记，也能给历史数据补提示。纯函数，前后端通用。
 */
export function isMultiAnswer(answer: string): boolean {
  const letters = (answer ?? '').toUpperCase().replace(/[\s,，、;；]/g, '');
  return /^[A-H]{2,4}$/.test(letters);
}

/** 高考选择题题干末尾的作答括号：全角括号 + 两个全角空格（U+3000），贴合试卷排版。 */
export const ANSWER_BLANK = '（　　）';

/**
 * 选项是否「只有字母标号、没有实际内容」——图形选项题（选项即配图中的子图，如散点图 A/B/C/D）
 * 抽进 options 数组后常是 ["A.","B.","C.","D."] 空壳。剥掉前导标号与公式分隔符后若为空即判空，
 * 供展示侧隐藏空白选项网格（选项已在配图里）。
 */
export function isBlankOption(opt: string): boolean {
  const body = opt
    .replace(/\*\*/g, '')                                    // 去 markdown 加粗
    .replace(/^\s*[(（]?\s*[A-Za-z]\s*[)）.．、:：]?\s*/, '')  // 去前导字母标号：A. / (A) / A、 …
    .replace(/\$/g, '')                                      // 去公式分隔符，仅用于判空（不改渲染内容）
    .trim();
  return body === '';
}

// 题干末尾「已有空作答括号」的两种形态：
//  ① 公式内半角空括号，紧跟行内公式闭合符：…A\cap B=()$  （Gemini 常把原卷的「(  )」抄成这样）
//  ② 公式外空括号（半角 () 或全角 （）），可含空格：…正确的有（ ） / …则 ( )
const ANSWER_BLANK_IN_MATH_RE = /[(（]\s*[)）](\s*\$)\s*$/;
const ANSWER_BLANK_TAIL_RE = /[(（][\s　]*[)）][\s　]*$/;

/** 题干末尾是否已带空作答括号（公式内 ()$ 与公式外 （ ） 均认）。 */
export function hasAnswerBlank(stem: string): boolean {
  const s = stem.trimEnd();
  return ANSWER_BLANK_IN_MATH_RE.test(s) || ANSWER_BLANK_TAIL_RE.test(s);
}

/**
 * 给选择题题干补上高考式作答括号「（　　）」：先剥掉题干已有的空括号（含公式内 ()$ 这种半角小括号），
 * 再统一补标准全角括号——既避免与原卷括号重复，又把半角升级为全角。空串原样返回。纯字符串函数，前后端通用。
 */
export function withAnswerBlank(stem: string): string {
  let s = stem.trimEnd();
  if (!s) return stem;
  s = s.replace(ANSWER_BLANK_IN_MATH_RE, '$1');  // 公式内空括号：剥括号、保留闭合 $
  s = s.replace(ANSWER_BLANK_TAIL_RE, '').trimEnd(); // 公式外空括号：整体剥掉
  return `${s}${ANSWER_BLANK}`;
}
