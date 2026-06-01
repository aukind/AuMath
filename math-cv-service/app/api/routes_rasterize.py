"""POST /rasterize —— PDF → 页面 PNG（PyMuPDF）。

前端上传 PDF 时调用，返回各页位图供用户选页 + 框选几何区域。
非大模型/非核心 CV 算法，骨架阶段即可用真实实现。
"""

from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import get_settings
from app.models.schemas import RasterizePage, RasterizeRequest, RasterizeResponse
from app.utils.images import collect, encode_base64
from app.utils.security import require_token

router = APIRouter(tags=["rasterize"], dependencies=[Depends(require_token)])


@router.post("/rasterize", response_model=RasterizeResponse)
async def rasterize(req: RasterizeRequest) -> RasterizeResponse:
    import fitz  # PyMuPDF，懒加载

    settings = get_settings()
    dpi = req.dpi or settings.rasterize_dpi
    max_pages = req.max_pages or settings.rasterize_max_pages

    try:
        pdf_bytes = base64.b64decode(req.pdf_base64.split(",")[-1], validate=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"无法解码 PDF base64: {exc}") from exc

    pages: list[RasterizePage] = []
    doc = None
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        for index in range(min(doc.page_count, max_pages)):
            page = doc.load_page(index)
            pix = page.get_pixmap(dpi=dpi)
            png = pix.tobytes("png")
            pages.append(
                RasterizePage(
                    page=index + 1,
                    image_base64=encode_base64(png),
                    width=pix.width,
                    height=pix.height,
                )
            )
            del pix, png  # 及时释放每页位图
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        return RasterizeResponse(success=False, error=str(exc))
    finally:
        if doc is not None:
            doc.close()
        collect()

    return RasterizeResponse(success=True, pages=pages)
