"""把 DocLayout-YOLO(.pt) 导出为 CoreML(.mlpackage)，用于 ANE/GPU 推理。

跑法：cd math-cv-service && .venv/bin/python scripts/export_coreml.py
成功则打印产物路径；失败（YOLOv10 头算子不被 CoreML 支持等）则打印错误，方案①终止。
"""
from __future__ import annotations

import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.config import get_settings


def main() -> int:
    settings = get_settings()
    from doclayout_yolo import YOLOv10
    from huggingface_hub import hf_hub_download

    weight = hf_hub_download(repo_id=settings.doclayout_model, filename=settings.doclayout_weight_file)
    print(f"[export] 权重: {weight}")
    print(f"[export] imgsz={settings.detect_imgsz} 开始导出 CoreML …")

    t0 = time.perf_counter()
    try:
        model = YOLOv10(weight)
        out = model.export(format="coreml", imgsz=settings.detect_imgsz, nms=False, half=False)
    except Exception:
        print("[export] ❌ 导出失败（很可能 YOLOv10 头有 CoreML 不支持的算子）：")
        traceback.print_exc()
        return 1

    print(f"[export] ✅ 完成，用时 {time.perf_counter() - t0:.1f}s")
    print(f"[export] 产物: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
