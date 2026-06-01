"""字母/数字 OCR + 边界框（easyocr）。

⚠️ 已知弱点：通用 OCR 对几何图里散落的单个斜体字母召回差，需人工二次微调兜底。
Reader 单例懒加载，避免每请求重建模型（内存/耗时）。希腊字母 'en' 不识别，留作 Phase。
"""

from __future__ import annotations

import numpy as np

from app.pipelines.base import GeoLabel

# 只认标注字符，抑制把线条误判成文字
_ALLOWLIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'"
_MIN_CONF = 0.25  # 单字母置信度普遍偏低，取低阈值多召回，由人工删误检
_MAX_LABEL_LEN = 3

_reader = None


def get_reader():
    """easyocr.Reader 单例（CPU）。首次调用会下载/加载模型。"""
    global _reader
    if _reader is None:
        import easyocr

        _reader = easyocr.Reader(["en"], gpu=False)
    return _reader


def detect_labels(img_bgr: np.ndarray) -> tuple[list[GeoLabel], list[np.ndarray]]:
    """返回 (标签[overpic 百分比坐标], 多边形框列表[供 inpaint 建掩膜])。"""
    h, w = img_bgr.shape[:2]
    results = get_reader().readtext(
        img_bgr,
        detail=1,
        allowlist=_ALLOWLIST,
        text_threshold=0.4,
        low_text=0.3,
        mag_ratio=2.0,  # 放大利于小字符检测
    )

    labels: list[GeoLabel] = []
    boxes: list[np.ndarray] = []
    for box, text, conf in results:
        text = text.strip()
        if not text or conf < _MIN_CONF or len(text) > _MAX_LABEL_LEN:
            continue
        pts = np.array(box, dtype=np.float32)
        cx = float(pts[:, 0].mean())
        cy = float(pts[:, 1].mean())
        labels.append(
            GeoLabel(
                text=text,
                x_percent=round(100.0 * cx / w, 2),
                y_percent=round(100.0 * (1.0 - cy / h), 2),  # ★ overpic 左下原点，y 向上
                confidence=round(float(conf), 3),
            )
        )
        boxes.append(pts)

    return labels, boxes
