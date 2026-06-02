"""对比 DocLayout-YOLO 不同推理后端的速度（CoreML 原生导出失败 → 走 ONNX/ONNXRuntime）。

跑法：cd math-cv-service && .venv/bin/python scripts/bench_backend.py
输出：
  A. 端到端（ultralytics predict）：torch-cpu vs onnxruntime-cpu —— 含相同前后处理，框数应一致
  B. 推理核心（onnxruntime session.run）：CPU EP vs CoreML EP(ANE) —— 看 ANE 对纯推理的加速
"""
from __future__ import annotations

import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.config import get_settings

N = 8       # 计时轮数
IMGSZ = 1024


def make_page(h=1400, w=990) -> np.ndarray:
    """合成一张接近真实卷面尺寸的 BGR 图（白底 + 几个黑框，给检测点东西）。计时对内容不敏感。"""
    img = np.full((h, w, 3), 255, np.uint8)
    rng = np.random.default_rng(0)
    for _ in range(6):
        x1, y1 = rng.integers(0, w - 200), rng.integers(0, h - 200)
        x2, y2 = x1 + rng.integers(80, 200), y1 + rng.integers(80, 200)
        img[y1:y2, x1:x2] = 0
    return img


def timed(fn, n=N):
    fn()  # warmup
    t = time.perf_counter()
    for _ in range(n):
        r = fn()
    return (time.perf_counter() - t) / n * 1000, r  # ms/次


def main() -> int:
    s = get_settings()
    from doclayout_yolo import YOLOv10
    from huggingface_hub import hf_hub_download
    import onnxruntime as ort

    weight = hf_hub_download(repo_id=s.doclayout_model, filename=s.doclayout_weight_file)
    page = make_page()
    print(f"[bench] page={page.shape} imgsz={IMGSZ} 轮数={N}")
    print(f"[bench] onnxruntime providers: {ort.get_available_providers()}\n")

    # 确保有 onnx
    onnx_path = weight.replace(".pt", ".onnx")
    if not os.path.exists(onnx_path):
        print("[bench] 导出 ONNX …")
        onnx_path = YOLOv10(weight).export(format="onnx", imgsz=IMGSZ, opset=12)
    print(f"[bench] onnx: {onnx_path}\n")

    # ---- A. 端到端（ultralytics predict）----
    m_pt = YOLOv10(weight)
    ms_pt, r_pt = timed(lambda: m_pt.predict(page, imgsz=IMGSZ, conf=s.detect_conf, device="cpu", verbose=False))
    figs_pt = len(r_pt[0].boxes)

    m_onnx = YOLOv10(onnx_path)
    ms_onnx, r_onnx = timed(lambda: m_onnx.predict(page, imgsz=IMGSZ, conf=s.detect_conf, verbose=False))
    figs_onnx = len(r_onnx[0].boxes)

    print("=== A. 端到端（含前后处理）===")
    print(f"  torch-cpu      : {ms_pt:7.1f} ms/页  (框 {figs_pt})")
    print(f"  onnxruntime    : {ms_onnx:7.1f} ms/页  (框 {figs_onnx})")
    print(f"  → onnx/torch 提速 {ms_pt / ms_onnx:.2f}x\n")

    # ---- B. 推理核心 session.run：CPU EP vs CoreML EP ----
    inp = np.ascontiguousarray(
        np.transpose(
            np.array([np.full((IMGSZ, IMGSZ, 3), 114, np.uint8)], np.float32)[0] / 255.0, (2, 0, 1)
        )[None]
    )
    sess_inp_name = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"]).get_inputs()[0].name

    def run_with(provider):
        try:
            sess = ort.InferenceSession(onnx_path, providers=[provider, "CPUExecutionProvider"])
        except Exception as e:  # noqa: BLE001
            return None, str(e)[:80]
        used = sess.get_providers()[0]
        ms, _ = timed(lambda: sess.run(None, {sess_inp_name: inp}))
        return ms, used

    print("=== B. 推理核心（onnxruntime session.run，纯推理）===")
    ms_cpu, used_cpu = run_with("CPUExecutionProvider")
    print(f"  CPU EP         : {ms_cpu:7.1f} ms/页  ({used_cpu})")
    if "CoreMLExecutionProvider" in ort.get_available_providers():
        ms_ane, used_ane = run_with("CoreMLExecutionProvider")
        if ms_ane:
            print(f"  CoreML EP(ANE) : {ms_ane:7.1f} ms/页  (实际用 {used_ane})")
            print(f"  → ANE/CPU 提速 {ms_cpu / ms_ane:.2f}x")
        else:
            print(f"  CoreML EP      : 不可用 ({used_ane})")
    else:
        print("  CoreML EP      : onnxruntime 未提供该 EP")
    return 0


if __name__ == "__main__":
    sys.exit(main())
