"""图像编解码工具（检测服务精简版，源自 math-cv-service/app/utils/images.py）。"""

from __future__ import annotations

import base64
import binascii
import gc

from fastapi import HTTPException, status

from config import get_settings

# 页面图检测前的最大边长（像素）。DocLayout-YOLO 内部 imgsz=1024，过大图无意义且耗内存。
MAX_EDGE_PX = 2000


def decode_data_image(image_base64: str) -> bytes:
    """解码前端传来的 base64（容忍 data URL 前缀），并做体积校验。"""
    raw = image_base64
    if raw.startswith("data:"):
        comma = raw.find(",")
        if comma != -1:
            raw = raw[comma + 1 :]
    try:
        data = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"无法解码 base64 图片: {exc}") from exc

    limit = get_settings().max_image_bytes
    if len(data) > limit:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"图片超过上限 {limit} 字节")
    return data


def collect() -> None:
    """显式触发垃圾回收，处理完一页后调用。"""
    gc.collect()


def decode_bgr(data: bytes):
    """图片字节 → OpenCV BGR ndarray，并按 MAX_EDGE_PX 缩放（内存友好）。

    注意：返回图可能已被缩放，故检测框坐标须配合返回图的 (h, w) 归一化——
    调用方用 page_width/page_height（即此处缩放后的尺寸）做归一化即可保持一致。
    """
    import cv2
    import numpy as np

    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "无法解码图片（非有效图像）")
    del arr

    h, w = img.shape[:2]
    longest = max(h, w)
    if longest > MAX_EDGE_PX:
        scale = MAX_EDGE_PX / longest
        img = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    return img
