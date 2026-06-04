# figure-detect —— DocLayout-YOLO 版面检测服务

试卷录入自动几何图提取的「检测端」。给一张试卷页面图 → 返回页面上各配图（几何图/函数图象/三视图/统计图…）的边界框。栅格化与像素级裁剪都在 Next.js 客户端完成（`lib/paper/figure-extract.ts`），本服务只做检测。

> 为什么独立部署：Gemini 视觉 bbox 偏松、会把题面文字一起圈进裁剪；DocLayout-YOLO 是专训版面分割模型，图/文切得很紧。本服务把它部署到 Vercel 够得到的地方，复刻旧本地 cv-service 的画质。

## 接口

```
GET  /healthz            → "ok"
POST /detect-figures     （Header: X-CV-Token: <token>，若设了 token）
  body: { "image_base64": "<页面图 base64，可带 data URL 前缀>" }
  →   { "success": true,
        "figures": [{ "x1":int,"y1":int,"x2":int,"y2":int,"confidence":float }],
        "page_width": int, "page_height": int }
```
坐标为**像素**，相对返回的 `page_width/page_height`（已按 2000px 最长边缩放后的尺寸）。Next 侧 `app/actions/detect-figures.ts` 据此换算成归一化 `[ymin,xmin,ymax,xmax]` 0–1000。

## 本地跑

```bash
cd services/figure-detect
python -m venv .venv && source .venv/bin/activate
pip install --index-url https://download.pytorch.org/whl/cpu torch==2.3.1 torchvision==0.18.1
pip install -r requirements.txt
uvicorn server:app --port 8000          # 首次会从 HF 下模型权重（~200MB）
# 冒烟：
curl -s -X POST localhost:8000/detect-figures \
  -H 'content-type: application/json' \
  -d "{\"image_base64\":\"$(base64 -i 某页含图卷子.png)\"}" | python -m json.tool
```

## 部署到 Fly

```bash
cd services/figure-detect
fly launch --no-deploy                       # 首次：生成 app，把实际 app 名同步回 fly.toml
fly secrets set CV_SERVICE_TOKEN=$(openssl rand -hex 24)
fly deploy                                   # 镜像含 torch+权重，首次构建较慢（~1-2GB）
```

部署后在 **Vercel 项目**设两个环境变量（再 redeploy）：

```
FIGURE_DETECT_URL = https://aumath-figure-detect.fly.dev
CV_SERVICE_TOKEN  = <上面 fly secrets 设的同一个值>
```

设好后，`/admin/paper-upload` 的几何图检测自动从 Gemini 切到本服务；不设则回退 Gemini（不阻塞）。
