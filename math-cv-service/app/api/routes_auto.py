"""整页全自动：检测几何图 → 归属题号 → Pipeline B 还原 → 烘焙内联 SVG。

- POST /auto-figures      ：单张页图（base64）
- POST /auto-figures-doc  ：传签名 URL（后端自取 PDF/图，PDF 逐页栅格化），整卷处理只回小体积图列表
前端在录题抽取后调 /auto-figures-doc，按 question_number 把 inline_svg 合进对应题。
"""

from __future__ import annotations

import time
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import get_settings
from app.models.schemas import AutoDocRequest, AutoFigure, AutoFiguresResponse, GeoLabel, ProcessRequest
from app.pipelines.pipeline_b.overpic import bake_labels_into_svg
from app.pipelines.pipeline_b.processor import PipelineBProcessor
from app.utils.images import collect, decode_bgr, decode_data_image, encode_base64, encode_png_bgr
from app.utils.security import require_token

router = APIRouter(tags=["auto"], dependencies=[Depends(require_token)])

_processor = PipelineBProcessor(return_clean_image=False)
_MAX_FIGURES = 12  # 单页几何图上限，防异常页拖垮


def _extend_caption_boxes(
    boxes: list[tuple[int, int, int, int, float]],
    page_h: int,
    page_w: int,
) -> list[tuple[int, int, int, int]]:
    """为每张图算「裁剪框」：成组小图（如三视图 图①-⑤）向下扩，把下方「图①」编号裁进来；孤图不扩。

    成组判定：存在另一 figure 框是它的同行邻居（纵向重叠 + 横向间隔小）或同列邻居（横向重叠 + 纵向间隔小）。
    成组才扩——避免把单个立体几何图正下方的题干文字也裁进去。扩展量被「正下方且 x 重叠的图」的顶边夹住。
    返回与 boxes 等长的 (x1,y1,x2,y2) 裁剪框（不含 conf）。
    """
    out: list[tuple[int, int, int, int]] = []
    for i, (x1, y1, x2, y2, _c) in enumerate(boxes):
        fw, fh = x2 - x1, y2 - y1
        grouped = False
        for j, (bx1, by1, bx2, by2, _) in enumerate(boxes):
            if j == i:
                continue
            ow, oh = bx2 - bx1, by2 - by1
            v_overlap = min(y2, by2) - max(y1, by1)      # 纵向重叠
            h_overlap = min(x2, bx2) - max(x1, bx1)      # 横向重叠
            h_gap = max(bx1 - x2, x1 - bx2)              # 横向间隔（负=重叠）
            v_gap = max(by1 - y2, y1 - by2)              # 纵向间隔
            same_row = v_overlap > 0.4 * min(fh, oh) and h_gap < 1.2 * max(fw, ow)
            same_col = h_overlap > 0.4 * min(fw, ow) and v_gap < 1.2 * max(fh, oh)
            if same_row or same_col:
                grouped = True
                break
        if not grouped:
            out.append((x1, y1, x2, y2))
            continue
        margin = min(max(int(0.6 * fh), 20), 50)
        limit = page_h
        for j, (bx1, by1, bx2, by2, _) in enumerate(boxes):
            if j == i:
                continue
            # 正下方且 x 重叠的图 → 别扩进它
            if by1 >= y2 and min(x2, bx2) - max(x1, bx1) > 0:
                limit = min(limit, by1 - 3)
        new_y2 = min(y2 + margin, limit, page_h)
        out.append((x1, y1, x2, max(new_y2, y2)))
    return out


def _process_page(
    img_bgr,
    page_no: int | None = None,
    vectorize: bool = True,
    mode: str = "image",
    assign_anchors: bool = True,
) -> list[AutoFigure]:
    """单页：检测 →（可选）归属 → 裁剪原图（+按 mode 矢量化）。检测依赖缺失时抛 ImportError。

    mode='cloud-vector'：每张图送云端 8B 拿编译好的 SVG（最优质量，慢/可能限流）；
    云端失败的图保留 crop_base64 兜底，绝不丢图。

    assign_anchors=False：跳过 easyocr 题号锚点（整卷管线用 —— 前端按 Gemini 文字自行归属，
    不读后端 question_number；OCR 在 CPU 上每页数秒，砍掉可大幅提速）。qnums 全置 None。
    """
    from app.detection.layout import detect_figure_boxes

    settings = get_settings()
    h, w = img_bgr.shape[:2]
    boxes = detect_figure_boxes(img_bgr)[:_MAX_FIGURES]
    # 裁剪框：成组小图向下扩把「图①」编号带进来；孤图= 原框。box 字段仍存原 figure 框。
    crop_boxes = (
        _extend_caption_boxes(boxes, h, w)
        if settings.caption_in_crop
        else [(b[0], b[1], b[2], b[3]) for b in boxes]
    )
    if assign_anchors and boxes:
        from app.detection.associate import assign_figures, detect_question_anchors

        anchors = detect_question_anchors(img_bgr)
        qnums = assign_figures(boxes, anchors, w)  # 一次性按阅读顺序归属
    else:
        qnums = [None] * len(boxes)

    cloud = None
    out: list[AutoFigure] = []
    for i, box in enumerate(boxes):
        x1, y1, x2, y2, conf = box
        cx1, cy1, cx2, cy2 = crop_boxes[i]  # 裁剪用（可能向下扩含编号）
        crop_png = encode_png_bgr(img_bgr[cy1:cy2, cx1:cx2])
        fig = AutoFigure(
            question_number=qnums[i],
            crop_base64=encode_base64(crop_png),  # 始终带原图裁剪做兜底
            confidence=round(conf, 3),
            box=[x1, y1, x2, y2],  # 阅读顺序/归属用原 figure 框（不含扩展）
            page=page_no,
        )
        if mode == "cloud-vector":
            try:
                if cloud is None:
                    from app.pipelines.pipeline_a_hfspace import HfSpacePipelineA

                    cloud = HfSpacePipelineA()
                res = cloud.process(crop_png)
                fig.svg = res.svg or ""
                fig.inline_svg = res.svg or ""
                fig.tikz = res.tikz or ""
            except Exception:  # noqa: BLE001 — 单图云端失败不影响其它，留 crop 兜底
                pass
        elif vectorize:
            result = _processor.process(crop_png)
            fig.svg = result.svg or ""
            fig.inline_svg = bake_labels_into_svg(result.svg or "", result.labels)
            fig.labels = [GeoLabel(text=l.text, x_percent=l.x_percent, y_percent=l.y_percent, confidence=l.confidence) for l in result.labels]
        out.append(fig)
        del crop_png
    return out


@router.post("/auto-figures", response_model=AutoFiguresResponse)
async def auto_figures(req: ProcessRequest) -> AutoFiguresResponse:
    image = decode_data_image(req.image_base64)
    img = None
    try:
        img = decode_bgr(image)
        h, w = img.shape[:2]
        try:
            figures = _process_page(img)
        except ImportError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "未安装版面检测依赖：pip install -r requirements-detection.txt") from exc
        return AutoFiguresResponse(success=True, figures=figures, page_width=w, page_height=h)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        return AutoFiguresResponse(success=False, error=str(exc))
    finally:
        del image
        if img is not None:
            del img
        collect()


def _rasterize_pdf_bytes(data: bytes) -> list:
    """PDF 字节 → 各页 BGR ndarray（PyMuPDF）。"""
    import cv2
    import fitz
    import numpy as np

    settings = get_settings()
    pages = []
    doc = fitz.open(stream=data, filetype="pdf")
    try:
        for i in range(min(doc.page_count, settings.rasterize_max_pages)):
            pix = doc.load_page(i).get_pixmap(dpi=settings.rasterize_dpi)
            png = pix.tobytes("png")
            pages.append(cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR))
            del pix, png
    finally:
        doc.close()
    return pages


# 整卷处理进度：job_id → {"done": 已处理页, "total": 总页, "ts": 更新时刻}。
# 前端轮询 /auto-figures-progress/{job_id} 拿百分比。内存级、单机够用；防泄漏按 TTL 清理。
_PROGRESS: dict[str, dict] = {}
_PROGRESS_TTL = 600.0  # 10 分钟


def _set_progress(job_id: str | None, done: int, total: int) -> None:
    if not job_id:
        return
    now = time.time()
    # 顺手清理过期条目，避免长期累积
    for k in [k for k, v in _PROGRESS.items() if now - v.get("ts", now) > _PROGRESS_TTL]:
        _PROGRESS.pop(k, None)
    _PROGRESS[job_id] = {"done": done, "total": total, "ts": now}


@router.get("/auto-figures-progress/{job_id}")
async def auto_figures_progress(job_id: str) -> dict:
    """整卷检测进度：{done, total}。未知 job_id 返回 {0,0}（前端据此保留上次百分比）。"""
    p = _PROGRESS.get(job_id)
    return {"done": p["done"], "total": p["total"]} if p else {"done": 0, "total": 0}


@router.post("/auto-figures-doc", response_model=AutoFiguresResponse)
def auto_figures_doc(req: AutoDocRequest) -> AutoFiguresResponse:
    # 同步 def（非 async）：FastAPI 自动放进 threadpool 跑，事件循环空出来 →
    # 检测期间 /auto-figures-progress 可正常响应（进度条实时动）；多文件请求各占一线程可并行。
    if not req.url.lower().startswith(("http://", "https://")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "仅支持 http(s) URL")
    try:
        # Supabase 直连可达，绕过 ClashX 代理（走代理反而易 SSL 抖断）；HF 那边仍用代理
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req.url, timeout=90) as resp:  # noqa: S310 (仅 http(s) 签名URL)
            data = resp.read()
    except Exception as exc:  # noqa: BLE001
        return AutoFiguresResponse(success=False, error=f"拉取文件失败: {exc}")

    pages = None
    t0 = time.perf_counter()
    try:
        if req.file_type == "pdf":
            pages = _rasterize_pdf_bytes(data)
        else:
            pages = [decode_bgr(data)]
        t_raster = time.perf_counter() - t0
        _set_progress(req.job_id, 0, len(pages))

        figures: list[AutoFigure] = []
        t_detect = 0.0
        try:
            for page_no, page in enumerate(pages, 1):
                tp = time.perf_counter()
                # 整卷管线：跳过 easyocr 题号锚点（前端按 Gemini 文字自行归属）→ 大幅提速
                figures.extend(_process_page(page, page_no, vectorize=req.vectorize, mode=req.mode, assign_anchors=False))
                t_detect += time.perf_counter() - tp
                _set_progress(req.job_id, page_no, len(pages))
        except ImportError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "未安装版面检测依赖：pip install -r requirements-detection.txt") from exc

        print(
            f"[perf] pages={len(pages)} rasterize={t_raster:.1f}s detect={t_detect:.1f}s "
            f"figs={len(figures)} total={time.perf_counter() - t0:.1f}s",
            flush=True,
        )
        return AutoFiguresResponse(success=True, figures=figures)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        return AutoFiguresResponse(success=False, error=str(exc))
    finally:
        _PROGRESS.pop(req.job_id, None) if req.job_id else None
        if pages is not None:
            del pages
        del data
        collect()
