'use server';

// L2「整篇文档 → 精美 PDF」编译：把用户写的完整 LaTeX 文档发到**可配置的**服务端
// TeX Live 编译服务，取回 PDF。供 /studio 的 LaTeX 工作室使用。
//
// 为什么是服务端：浏览器端 SwiftLaTeX 依赖的宏包服务器(texlive2.swiftlatex.com)已宕机，
// 整篇文档/任意 CTAN 在浏览器里编译不出来。服务端真实 TeX Live 才可靠（全宏包、TeX Live 2026）。
//
// 默认后端 texlive.net（TUG 社区的 latexcgi，POST、无大小限制、维护良好）；
// 生产可把 LATEX_COMPILE_URL 指向**自托管**的 latexcgi 兼容服务（用户 LaTeX 不出自己的基础设施）。
// 契约：POST multipart(filename[]/filecontents[]/engine/return=pdf) →
//   成功：301 跳到 .../<name>.pdf（fetch 自动跟随后 content-type=application/pdf）；
//   失败：返回编译 .log（text/plain）。

import { createClient } from '@/lib/supabase/server';

const COMPILE_BASE = process.env.LATEX_COMPILE_URL || 'https://texlive.net';
const ENDPOINT = `${COMPILE_BASE.replace(/\/$/, '')}/cgi-bin/latexcgi`;
// 与自托管编译服务共享的密钥；指向公共 texlive.net 时留空即可（不发鉴权头）。
const COMPILE_TOKEN = process.env.LATEX_COMPILE_TOKEN || '';

export type LatexEngine = 'pdflatex' | 'xelatex' | 'lualatex';

/** 随主文档一起上传的附件：文本文件（.sty/.cls/.bib…）给 text，二进制（图片/PDF）给 base64。 */
export type LatexAttachment = { name: string; text?: string; base64?: string };

export type CompileDocResult =
  | { success: true; pdfBase64: string; bytes: number }
  | { success: false; log: string; fullLog?: string };

/** 从完整 .log 里截取对用户有用的报错段（! 开头的错误 + 末尾摘要）。 */
function extractErrors(log: string): string {
  const lines = log.split('\n');
  const errIdx: number[] = [];
  lines.forEach((l, i) => {
    if (l.startsWith('!') || /^l\.\d+/.test(l) || /Error|Undefined|Emergency/.test(l)) errIdx.push(i);
  });
  if (errIdx.length === 0) return log.slice(-2500);
  const picked = new Set<number>();
  for (const i of errIdx) for (let j = i - 1; j <= i + 3; j++) if (j >= 0 && j < lines.length) picked.add(j);
  return [...picked].sort((a, b) => a - b).map((i) => lines[i]).join('\n').slice(0, 4000);
}

/** 把上传文件名收敛成安全 basename（挡 ../ 与路径逃逸），与编译服务端一致。 */
function sanitizeName(name: string): string {
  const base = (name || '').split(/[\\/]/).pop() || '';
  const safe = base.replace(/[^\w.\-]/g, '_');
  return safe && safe !== '.' && safe !== '..' ? safe : '';
}

/** 过滤对用户无意义的环境噪音行（如沙箱里偶发的 fontconfig 缓存告警）。 */
function stripNoise(log: string): string {
  return log
    .split('\n')
    .filter((l) => !/Fontconfig error: No writable cache directories/.test(l))
    .join('\n');
}

export async function compileLatexDocument(
  source: string,
  engine: LatexEngine = 'pdflatex',
  files: LatexAttachment[] = [],
): Promise<CompileDocResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, log: '请先登录后再使用 LaTeX 编译' };
  if (!source.trim()) return { success: false, log: '文档为空' };
  if (source.length > 500_000) return { success: false, log: '文档过长（上限 50 万字符）' };

  const form = new FormData();
  // 主文档恒为 document.tex；附件随同上传 → 服务端写进同一编译目录，解决「缺 .sty / 缺图」急停。
  form.append('filename[]', 'document.tex');
  form.append('filecontents[]', source);
  for (const f of files) {
    const name = sanitizeName(f.name);
    if (!name || name === 'document.tex') continue;
    if (typeof f.text === 'string') {
      // 文本文件（.sty/.cls/.bib…）：filename[]/filecontents[]，texlive.net 与自托管都认。
      form.append('filename[]', name);
      form.append('filecontents[]', f.text);
    } else if (typeof f.base64 === 'string') {
      // 二进制（图片/PDF）：作为文件部件上传（自托管服务支持；texlive.net 可能忽略）。
      form.append('file', new Blob([Buffer.from(f.base64, 'base64')]), name);
    }
  }
  form.append('engine', engine);
  form.append('return', 'pdf');

  const headers: Record<string, string> = {};
  if (COMPILE_TOKEN) headers.Authorization = `Bearer ${COMPILE_TOKEN}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: 'POST', body: form, headers, signal: controller.signal });
  } catch (e) {
    return {
      success: false,
      log: `编译服务不可达（${ENDPOINT}）：${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    clearTimeout(timer);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/pdf')) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { success: true, pdfBase64: buf.toString('base64'), bytes: buf.length };
  }
  // 非 PDF ⇒ 编译失败，正文是 .log：滤掉环境噪音后，精简视图 + 完整日志一并回传。
  const raw = stripNoise(await res.text().catch(() => '（无法读取编译日志）'));
  return { success: false, log: extractErrors(raw), fullLog: raw.slice(-20000) };
}
