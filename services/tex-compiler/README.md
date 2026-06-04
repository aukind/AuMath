# tex-compiler — 自托管 TeX Live 编译服务

`/studio`（LaTeX 文档工作室）的编译后端。接收整篇 LaTeX(+附件)，用 `latexmk` 多遍编译，返回 PDF。
契约对齐 `texlive.net/cgi-bin/latexcgi`，所以 Next 侧只要把 `LATEX_COMPILE_URL` 指过来即 drop-in 替换。

## 它解决了什么（对齐本地 TeXStudio）
- **Fontconfig error: No writable cache directories** —— 镜像构建期 `fc-cache -f` 烤好缓存，运行时缓存目录落 `/tmp`。
- **! Emergency stop / End of file on the terminal** —— scheme-full 全宏包 + 支持上传缺失的 `.sty`/`.cls`/图片，不再缺文件急停；`-interaction=nonstopmode` 不再向终端要输入。
- **多遍编译** —— `latexmk` 自动收敛 `\ref`/`\cite`/目录；XeLaTeX + ctex + Fandol/Noto CJK 出中文。

## 接口
`POST /cgi-bin/latexcgi`（multipart/form-data）
- `filename[]` + `filecontents[]`：文本文件，主文件名固定 `document.tex`
- `file`：二进制文件部件（图片/PDF），保留原文件名
- `engine`：`pdflatex | xelatex | lualatex`
- `Authorization: Bearer <LATEX_COMPILE_TOKEN>`（设了 token 才校验）

成功 → `application/pdf`；失败 → `.log`（text/plain）。`GET /healthz` → `ok`。

## 本地运行
```bash
docker build -t tex-compiler .
docker run --rm -p 8080:8080 -e LATEX_COMPILE_TOKEN=dev tex-compiler

curl -F 'filename[]=document.tex' \
     -F 'filecontents[]=\documentclass{ctexart}\begin{document}你好 $x^2$\end{document}' \
     -F engine=xelatex -H 'Authorization: Bearer dev' \
     http://localhost:8080/cgi-bin/latexcgi -o out.pdf
```

## 部署到 Fly.io
```bash
fly launch --no-deploy                       # 首次：生成/确认 app 名，并同步改 fly.toml 的 app=
fly secrets set LATEX_COMPILE_TOKEN=<随机串>
fly deploy
```
然后在 Vercel 项目环境变量里设：
- `LATEX_COMPILE_URL = https://<app>.fly.dev`
- `LATEX_COMPILE_TOKEN = <同一随机串>`

## 备注
- 基镜像 `texlive/texlive:latest`（scheme-full，数 GB），首次构建/部署较慢。
- `min_machines_running=1` 常驻保活，避免冷启动 + 重建缓存的首编卡顿（有少量常开成本）。
- 安全收口：`-no-shell-escape`、`openin/out_any=p`、非 root 运行、任务超时、并发上限、Bearer token。
- 不配 `LATEX_COMPILE_URL` 时 Next 侧自动回退公共 `texlive.net`（仅文本文档，附件可能被忽略），便于排障对照。
