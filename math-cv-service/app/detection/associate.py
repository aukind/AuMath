"""把检测到的几何图自动归属到题号。

难点：Gemini 抽出的题无坐标、DocLayout 的图无题号。这里在整页上 OCR 找题号锚点
（"21." 这类），按分栏 + 阅读顺序把每张图归到"其上方最近"的题号。
启发式、非 100% 准（双栏/题号误读会归错）→ 认不准返回 None，留给人工在编辑器放。
"""

from __future__ import annotations

import re

import numpy as np

# 行首题号：1~2 位数字 + 常见分隔符（含中文标点）
_QNUM = re.compile(r"^\s*(\d{1,2})\s*[.．、)）]")


def detect_question_anchors(img_bgr: np.ndarray) -> list[tuple[int, float, float]]:
    """返回 [(question_number, x_center, y_top), ...]。"""
    from app.pipelines.pipeline_b.ocr import get_reader

    results = get_reader().readtext(img_bgr, detail=1, paragraph=False)
    anchors: list[tuple[int, float, float]] = []
    for box, text, _conf in results:
        m = _QNUM.match(str(text).strip())
        if not m:
            continue
        num = int(m.group(1))
        if not (1 <= num <= 40):  # 高考题号合理范围，滤掉杂数字
            continue
        pts = np.asarray(box, dtype=np.float32)
        anchors.append((num, float(pts[:, 0].mean()), float(pts[:, 1].min())))
    return anchors


def assign_question(
    fig_box: tuple[int, int, int, int, float],
    anchors: list[tuple[int, float, float]],
    page_w: int,
) -> int | None:
    """图归属：同栏内、位于图上方、y 最大（最贴近）的题号。认不准返回 None。"""
    if not anchors:
        return None
    fx1, fy1, fx2, fy2, _ = fig_box
    fcx = (fx1 + fx2) / 2
    fmid_y = (fy1 + fy2) / 2
    half = page_w / 2
    fig_left = fcx < half

    same_col = [a for a in anchors if (a[1] < half) == fig_left]
    above = [a for a in (same_col or anchors) if a[2] <= fmid_y]
    if not above:
        return None
    return max(above, key=lambda a: a[2])[0]  # 最贴近图上方的题号
