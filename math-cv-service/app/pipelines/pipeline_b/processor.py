"""Pipeline B 编排器（逆向工程：OCR → inpaint → VTracer → overpic）。

内存纪律：处理完对 cv2/numpy 大对象 `del` + utils.images.collect()。
重依赖在方法内懒加载，保持模块导入轻量、便于 A/B 解耦。
"""

from __future__ import annotations

from app.pipelines.base import Pipeline, PipelineResult
from app.utils.images import collect, decode_bgr, encode_base64, encode_png_bgr, phash_signed


class PipelineBProcessor(Pipeline):
    name = "B"

    def __init__(self, return_clean_image: bool = True) -> None:
        # clean_image 仅调试用，体积不大；可关。
        self.return_clean_image = return_clean_image

    def process(self, image: bytes, mime_type: str = "image/png") -> PipelineResult:
        from app.pipelines.pipeline_b.inpaint import erase_text
        from app.pipelines.pipeline_b.ocr import detect_labels
        from app.pipelines.pipeline_b.overpic import build
        from app.pipelines.pipeline_b.vectorize import to_svg

        img = decode_bgr(image)
        clean = None
        try:
            phash = phash_signed(img)  # 在缩放后的源图上算，去重稳定
            labels, boxes = detect_labels(img)
            clean = erase_text(img, boxes)
            svg = to_svg(clean)
            overpic_latex, pdf_base64 = build(svg, labels)
            clean_b64 = encode_base64(encode_png_bgr(clean)) if self.return_clean_image else None
            return PipelineResult(
                pipeline="B",
                used_engine="reverse-engineering",
                svg=svg,
                labels=labels,
                overpic_latex=overpic_latex,
                pdf_base64=pdf_base64,
                clean_image_base64=clean_b64,
                phash=phash,
            )
        finally:
            del img
            if clean is not None:
                del clean
            collect()
