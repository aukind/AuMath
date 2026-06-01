"""VTracer 栅格 → SVG 矢量化。

线稿用 'binary' 更快更干净；曲线用 'spline'；'stacked' 避免空洞路径。
"""

from __future__ import annotations

import cv2
import numpy as np
import vtracer

# 线稿专用参数（实测对立体几何/圆锥曲线都好）：
#   - polygon：保直棱不被样条拟合成扭曲曲线（spline 是之前立体几何崩坏的元凶）；
#     高分辨率下多边形段极细，圆/抛物线看着依旧平滑。
#   - filter_speckle=0：细线段不当噪点删掉（之前 4 会吃掉细棱）。
VTRACER_PARAMS = {
    "colormode": "binary",
    "hierarchical": "stacked",
    "mode": "polygon",
    "filter_speckle": 0,
    "corner_threshold": 60,
}

# VTracer 按像素描区域，裁剪图太小时细线像素不足 → 先放大再描，质量大幅提升。
_TRACE_MIN_EDGE = 1000


def to_svg(clean_bgr: np.ndarray) -> str:
    img = clean_bgr
    h, w = img.shape[:2]
    longest = max(h, w)
    if longest < _TRACE_MIN_EDGE:
        scale = _TRACE_MIN_EDGE / longest
        img = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_CUBIC)

    ok, png = cv2.imencode(".png", img)
    if not ok:
        raise RuntimeError("cv2.imencode 失败，无法矢量化")
    svg = vtracer.convert_raw_image_to_svg(png.tobytes(), img_format="png", **VTRACER_PARAMS)
    del png
    if img is not clean_bgr:
        del img
    return svg
