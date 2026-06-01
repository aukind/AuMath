"""图像编解码与内存友好工具（18GB 统一内存约束）。

约定：大数组用完即 `del` + `gc.collect()`；图像先按上限边长缩放再处理。
"""

from __future__ import annotations

import base64
import binascii
import gc
import io

from fastapi import HTTPException, status

from app.config import get_settings

# Pipeline B 处理前的最大边长（像素）。VTracer/inpaint 对超大图无意义且耗内存。
MAX_EDGE_PX = 2000


def decode_data_image(image_base64: str) -> bytes:
    """解码前端传来的 base64（容忍 data URL 前缀），并做体积校验。"""
    raw = image_base64
    if raw.startswith("data:"):
        # data:image/png;base64,XXXX
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


def encode_base64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def collect() -> None:
    """显式触发垃圾回收，处理完一张图后调用。"""
    gc.collect()


def png_bytes_dimensions(data: bytes) -> tuple[int, int]:
    """读 PNG/图片尺寸而不长期持有解码后的位图。"""
    from PIL import Image  # 懒加载，避免无谓常驻

    with Image.open(io.BytesIO(data)) as im:
        return im.width, im.height


def decode_bgr(data: bytes):
    """图片字节 → OpenCV BGR ndarray，并按 MAX_EDGE_PX 缩放（内存友好）。"""
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


def encode_png_bgr(img) -> bytes:
    """BGR ndarray → PNG 字节。"""
    import cv2

    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise RuntimeError("cv2.imencode 失败")
    return buf.tobytes()


def phash_signed(img_bgr) -> str:
    """DCT 感知哈希(64bit) → 有符号 BIGINT 的十进制字符串。

    以字符串传输，避免 JS Number 无法精确表示 64-bit 整数（>2^53 丢精度）。
    Postgres 端按 BIGINT 存，XOR + bit_count 求汉明距离做近重复去重。
    """
    import cv2
    import numpy as np

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    small = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA).astype(np.float32)
    dct = cv2.dct(small)
    block = dct[:8, :8]
    med = np.median(block[1:])  # 排除 DC 分量后取中位数
    bits = (block > med).flatten()

    value = 0
    for bit in bits:
        value = (value << 1) | int(bool(bit))
    # 无符号 64-bit → 有符号（适配 Postgres BIGINT 范围）
    if value >= 2**63:
        value -= 2**64
    return str(value)
