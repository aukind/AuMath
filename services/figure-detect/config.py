"""检测服务配置：从环境变量 / .env 读取，单例。

这是从 math-cv-service/app/config.py 精简出来的「只检测」版——去掉 Pipeline A/B、
OCR、栅格化等无关项，只留 DocLayout-YOLO 版面检测所需。
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # 鉴权：留空 = 关闭校验（本地开发）。线上务必经 `fly secrets set CV_SERVICE_TOKEN=...` 设置。
    cv_service_token: str = ""

    # 单张页面图字节上限（与 Next serverActions.bodySizeLimit 量级对齐）。
    max_image_bytes: int = 25 * 1024 * 1024

    # 版面检测（DocLayout-YOLO，自动找几何图区域）。
    doclayout_model: str = "juliozhao/DocLayout-YOLO-DocStructBench"
    doclayout_weight_file: str = "doclayout_yolo_docstructbench_imgsz1024.pt"
    # 后端固定 torch：Linux/Fly 无 Mac ANE，CoreML 路径用不上。
    detect_device: str = "cpu"
    detect_conf: float = 0.2
    detect_imgsz: int = 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
