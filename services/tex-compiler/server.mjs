// 自托管 latexcgi 兼容编译服务：接收整篇 LaTeX(+附件)，用 latexmk 多遍编译，回 PDF 或 .log。
// 契约对齐 texlive.net/cgi-bin/latexcgi，故 Next 侧把 LATEX_COMPILE_URL 指向本服务即 drop-in。
import express from 'express';
import multer from 'multer';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.LATEX_COMPILE_TOKEN || '';
const JOB_TIMEOUT_MS = Number(process.env.LATEX_JOB_TIMEOUT_MS || 90_000);
const MAX_CONCURRENT = Number(process.env.LATEX_MAX_CONCURRENT || 2);
// latexmkrc 路径：镜像内固定 /etc/latexmkrc；本地/其它环境可用 LATEXMKRC 覆盖以便测试。
const LATEXMKRC = process.env.LATEXMKRC || '/etc/latexmkrc';

// latexmk 引擎开关：-pdf=pdflatex / -pdfxe=xelatex / -pdflua=lualatex。
// 具体引擎参数（nonstopmode/halt-on-error/no-shell-escape）统一在 /etc/latexmkrc 注入。
const ENGINE_FLAG = { pdflatex: '-pdf', xelatex: '-pdfxe', lualatex: '-pdflua' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fieldSize: 12 * 1024 * 1024, fileSize: 25 * 1024 * 1024, files: 60, fields: 500 },
});

const app = express();
let active = 0;

app.get('/healthz', (_req, res) => res.type('text/plain').send('ok'));

app.post('/cgi-bin/latexcgi', (req, res) => {
  upload.any()(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).type('text/plain').send(`upload error: ${uploadErr.message}`);
    if (TOKEN && req.get('authorization') !== `Bearer ${TOKEN}`)
      return res.status(401).type('text/plain').send('unauthorized');
    if (active >= MAX_CONCURRENT)
      return res.status(503).type('text/plain').send('busy, please retry');

    active++;
    const t0 = Date.now();
    let dir;
    try {
      const engine = String(req.body.engine || 'pdflatex');
      const flag = ENGINE_FLAG[engine] || ENGINE_FLAG.pdflatex;
      // multer(append-field) 会把 filename[] 解析成 req.body.filename 数组；两种键都兜一下。
      const names = asArray(req.body.filename ?? req.body['filename[]']);
      const contents = asArray(req.body.filecontents ?? req.body['filecontents[]']);

      dir = await mkdtemp(join(tmpdir(), 'texjob-'));
      await mkdir(join(dir, 'out'), { recursive: true });

      // 文本文件（主文档 + .sty/.cls/.bib…）写入编译目录。
      let hasMain = false;
      for (let i = 0; i < names.length; i++) {
        const name = safeName(names[i]);
        if (!name) continue;
        await writeFile(join(dir, name), String(contents[i] ?? ''), 'utf8');
        if (name === 'document.tex') hasMain = true;
      }
      // 二进制文件（图片/PDF）写入同一目录，保留原文件名。
      for (const f of req.files || []) {
        const name = safeName(f.originalname);
        if (name) await writeFile(join(dir, name), f.buffer);
      }
      if (!hasMain) return res.status(400).type('text/plain').send('missing document.tex');

      const { ok } = await runLatexmk(dir, flag);
      const pdfPath = join(dir, 'out', 'document.pdf');
      if (ok && existsSync(pdfPath)) {
        const pdf = await readFile(pdfPath);
        logLine(engine, req, t0, 'pdf', pdf.length);
        res.setHeader('Content-Type', 'application/pdf');
        return res.send(pdf);
      }
      // 失败 ⇒ 回 .log 正文（text/plain），Next 侧据此抽取报错。
      const logText = (await readFileSafe(join(dir, 'out', 'document.log'))) || 'compile failed (no log produced)';
      logLine(engine, req, t0, 'log', logText.length);
      return res.status(200).type('text/plain').send(logText);
    } catch (e) {
      return res.status(500).type('text/plain').send(`server error: ${e?.message || e}`);
    } finally {
      active--;
      if (dir) rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

function runLatexmk(dir, flag) {
  return new Promise((resolve) => {
    const child = spawn('latexmk', ['-r', LATEXMKRC, flag, '-outdir=out', 'document.tex'], {
      cwd: dir,
      env: {
        ...process.env,
        HOME: '/tmp',
        XDG_CACHE_HOME: '/tmp/.cache',
        TEXMFVAR: '/tmp/texmf-var',
        // 限制 TeX 的文件读写只在工作目录内，挡掉 \openin/\openout 越权访问。
        openin_any: 'p',
        openout_any: 'p',
      },
    });
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    const timer = setTimeout(() => child.kill('SIGKILL'), JOB_TIMEOUT_MS);
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0 }); });
    child.on('error', () => { clearTimeout(timer); resolve({ ok: false }); });
  });
}

function asArray(v) { return v === undefined ? [] : Array.isArray(v) ? v : [v]; }

// 文件名消毒：只取 basename + 安全字符，挡 ../ 与绝对路径逃逸。
function safeName(name) {
  const b = basename(String(name || '')).replace(/[^\w.\-]/g, '_');
  return b && b !== '.' && b !== '..' ? b : '';
}

async function readFileSafe(p) {
  try { return await readFile(p, 'utf8'); } catch { return ''; }
}

function logLine(engine, req, t0, kind, bytes) {
  const files = (req.files?.length || 0) + asArray(req.body.filename ?? req.body['filename[]']).length;
  console.log(`[compile] engine=${engine} files=${files} -> ${kind} ${bytes}B in ${Date.now() - t0}ms`);
}

app.listen(PORT, () => console.log(`tex-compiler listening on :${PORT}`));
