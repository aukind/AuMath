"""FastAPI 入口：CORS + 路由挂载 + 健康检查。

启动：uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import SERVICE_NAME, SERVICE_VERSION
from app.api import (
    routes_auto,
    routes_detect,
    routes_health,
    routes_pipeline_a,
    routes_pipeline_b,
    routes_rasterize,
)
from app.config import get_settings

settings = get_settings()

app = FastAPI(title=SERVICE_NAME, version=SERVICE_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=False,
)

app.include_router(routes_health.router)
app.include_router(routes_rasterize.router)
app.include_router(routes_detect.router)
app.include_router(routes_auto.router)
app.include_router(routes_pipeline_a.router)
app.include_router(routes_pipeline_b.router)
