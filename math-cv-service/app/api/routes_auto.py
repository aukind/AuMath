"""整页全自动：检测几何图 → 归属题号 → Pipeline B 还原 → 烘焙内联 SVG。

- POST /auto-figures      ：单张页图（base64）
- POST /auto-figures-doc  ：传签名 URL（后端自取 PDF/图，PDF 逐页栅格化），整卷处理只回小体积图列表
前端在录题抽取后调 /auto-figures-doc，按 question_number 把 inline_svg 合进对应题。
"""

from __future__ import annotations

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


def _process_page(img_bgr, page_no: int | None = None, vectorize: bool = True) -> list[AutoFigure]:
    """单页：检测 → 归属 → 裁剪原图（+可选矢量化）。检测依赖缺失时抛 ImportError。"""
    from app.detection.associate import assign_question, detect_question_anchors
    from app.detection.layout import detect_figure_boxes

    h, w = img_bgr.shape[:2]
    boxes = detect_figure_boxes(img_bgr)[:_MAX_FIGURES]
    anchors = detect_question_anchors(img_bgr) if boxes else []

    out: list[AutoFigure] = []
    for box in boxes:
        x1, y1, x2, y2, conf = box
        crop_png = encode_png_bgr(img_bgr[y1:y2, x1:x2])
        fig = AutoFigure(
            question_number=assign_question(box, anchors, w),
            crop_base64=encode_base64(crop_png),  # 无损原图裁剪（默认路线）
            confidence=round(conf, 3),
            box=[x1, y1, x2, y2],
            page=page_no,
        )
        if vectorize:
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


@router.post("/auto-figures-doc", response_model=AutoFiguresResponse)
async def auto_figures_doc(req: AutoDocRequest) -> AutoFiguresResponse:
    if not req.url.lower().startswith(("http://", "https://")):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "仅支持 http(s) URL")
    try:
        with urllib.request.urlopen(req.url, timeout=90) as resp:  # noqa: S310 (仅 http(s) 签名URL)
            data = resp.read()
    except Exception as exc:  # noqa: BLE001
        return AutoFiguresResponse(success=False, error=f"拉取文件失败: {exc}")

    pages = None
    try:
        if req.file_type == "pdf":
            pages = _rasterize_pdf_bytes(data)
        else:
            pages = [decode_bgr(data)]

        figures: list[AutoFigure] = []
        try:
            for page_no, page in enumerate(pages, 1):
                figures.extend(_process_page(page, page_no, vectorize=req.vectorize))
        except ImportError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "未安装版面检测依赖：pip install -r requirements-detection.txt") from exc

        return AutoFiguresResponse(success=True, figures=figures)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        return AutoFiguresResponse(success=False, error=str(exc))
    finally:
        if pages is not None:
            del pages
        del data
        collect()
