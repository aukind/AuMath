# math-cv-service

aumath.com 的本地/自托管 CV 微服务：把裁剪后的几何图转成 **TikZ / overpic+SVG**。
作者端录题工具 —— 不部署到 Vercel serverless。

## 架构（A/B 彻底解耦）

- **Pipeline B（逆向工程，MVP 主体）**：OCR 抠字母坐标 → OpenCV inpaint 抹字 → VTracer 矢量化 → overpic 组装。纯 CPU，内存 1–2GB。
- **Pipeline A（生成式）**：MVP 为 Mock；真实后端 = DeTikZify（Phase 2，`requirements-pipeline-a.txt`）。

## 安装

```bash
cd math-cv-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

系统依赖：`cairosvg` 需 Cairo —— `brew install cairo`。

> 内存提示（M3 Pro 18GB）：easyocr 首次会下载模型；Pipeline A 的 torch 依赖单独装、按需加载，别和 B 同时常驻。

## 运行

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health      # {"status":"ok",...}
```

OpenAPI 文档：http://localhost:8000/docs

## 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/health` | 健康检查 |
| POST | `/rasterize` | PDF(base64) → 各页 PNG |
| POST | `/pipeline-b/process` | 图(base64) → `{svg, labels[], overpic_latex, pdf_base64}` |
| POST | `/pipeline-a/process` | 图(base64) → `{tikz}`（MVP: Mock） |

鉴权：设了 `.env` 的 `CV_SERVICE_TOKEN` 后，请求需带 `X-CV-Token` 头（留空则放行）。

## 测试

```bash
pip install pytest httpx
pytest
```

## 目录

```
app/
  main.py            FastAPI 入口（CORS + 路由）
  config.py          .env 配置
  api/               路由：health / rasterize / pipeline-a / pipeline-b
  pipelines/
    base.py          Pipeline 协议 + PipelineResult（框架无关）
    pipeline_a_mock.py
    pipeline_b/      processor + ocr/inpaint/vectorize/overpic（Step 3 实现）
  models/schemas.py  Pydantic（与前端 types/tikz.ts 对齐）
  utils/             images（编解码+内存释放）/ security（token）
tests/
```
