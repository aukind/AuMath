"""Pipeline A · Mock（MVP）。

真实后端 = DeTikZify（Phase 2，见 requirements-pipeline-a.txt）。
此处返回固定 TikZ 占位，保证前端 A 路线链路可跑通；接口与未来 DeTikZify
实现同形（同一 Pipeline 协议），届时仅替换本文件、不动 B、不动前端契约。
"""

from __future__ import annotations

from app.pipelines.base import Pipeline, PipelineResult

_MOCK_TIKZ = r"""\begin{tikzpicture}
  % [MOCK] Pipeline A 占位输出 —— 真实后端将由 DeTikZify 生成
  \draw (0,0) circle (2);
  \draw (-2,0) -- (2,0);
  \fill (-2,0) circle (1.5pt) node[below left] {$A$};
  \fill (2,0) circle (1.5pt) node[below right] {$B$};
  \fill (0,0) circle (1.5pt) node[below] {$O$};
\end{tikzpicture}"""


class MockPipelineA(Pipeline):
    name = "A"

    def process(self, image: bytes, mime_type: str = "image/png") -> PipelineResult:
        return PipelineResult(pipeline="A", used_engine="mock", tikz=_MOCK_TIKZ)
