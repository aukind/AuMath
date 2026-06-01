"""OpenCV 文本掩膜 + 图像修复抹字。

字母区域置 255、其余 0，略作膨胀覆盖抗锯齿边缘，再用 Navier-Stokes 修复。
caveat：字母压在线上时该截线会被平滑掉一点 → 半径取小（默认 3）。
"""

from __future__ import annotations

import cv2
import numpy as np

from app.utils.images import collect

INPAINT_RADIUS = 3
_DILATE_KERNEL = np.ones((3, 3), np.uint8)


def erase_text(img_bgr: np.ndarray, boxes: list[np.ndarray]) -> np.ndarray:
    h, w = img_bgr.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    for box in boxes:
        cv2.fillPoly(mask, [box.astype(np.int32)], 255)
    if boxes:
        mask = cv2.dilate(mask, _DILATE_KERNEL, iterations=1)
        clean = cv2.inpaint(img_bgr, mask, INPAINT_RADIUS, cv2.INPAINT_NS)
    else:
        clean = img_bgr.copy()  # 无字母 → 原图即干净底图
    del mask
    collect()
    return clean
