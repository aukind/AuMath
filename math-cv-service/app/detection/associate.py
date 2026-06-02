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


def _cluster_columns(xs: list[float], page_w: int, min_gap_frac: float = 0.10) -> list[float]:
    """把一堆 x 坐标 1D 聚类成若干列，返回各列代表 x（升序）。相邻间隔 > page_w*gap 即分列。"""
    if not xs:
        return []
    xs_sorted = sorted(xs)
    gap = page_w * min_gap_frac
    cols: list[list[float]] = [[xs_sorted[0]]]
    for x in xs_sorted[1:]:
        if x - cols[-1][-1] > gap:
            cols.append([x])
        else:
            cols[-1].append(x)
    return [sum(c) / len(c) for c in cols]


def _col_index(x: float, col_centers: list[float]) -> int:
    if not col_centers:
        return 0
    return min(range(len(col_centers)), key=lambda i: abs(col_centers[i] - x))


def assign_figures(
    fig_boxes: list[tuple[int, int, int, int, float]],
    anchors: list[tuple[int, float, float]],
    page_w: int,
) -> list[int | None]:
    """整页一次性归属：列感知阅读顺序 + 最近题号（人读卷的方式）。

    返回与 fig_boxes 等长的题号列表。把题号锚点与图按 (列序号, y_top) 线性化成阅读顺序
    （整列读完再读下一列），图归到它前面最近出现的题号 → 正确处理跨栏延续
    （如折线图在中栏顶，但阅读顺序上紧跟左栏第9之后 → 归第9）。认不准为 None。
    """
    n = len(fig_boxes)
    if n == 0:
        return []
    if not anchors:
        return [None] * n

    col_centers = _cluster_columns([a[1] for a in anchors], page_w)

    # 合并锚点与图为阅读顺序流；同一 (列,y) 时锚点(kind=0)排在图(kind=1)前
    items: list[tuple[int, float, int, str, int]] = []
    for qnum, ax, ay in anchors:
        items.append((_col_index(ax, col_centers), ay, 0, "a", qnum))
    for i, (x1, y1, _x2, _y2, _c) in enumerate(fig_boxes):
        items.append((_col_index(x1, col_centers), float(y1), 1, "f", i))  # 图按左边定列
    items.sort(key=lambda it: (it[0], it[1], it[2]))

    result: list[int | None] = [None] * n
    current: int | None = None
    for _ci, _y, _kind, tag, val in items:
        if tag == "a":
            current = val
        else:
            result[val] = current
    return result
