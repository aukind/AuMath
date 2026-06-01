'use client';

// 双屏 + 二次微调：左原图 / 右 SVG+KaTeX 实时叠层（随编辑器即时回显）。
// B：Monaco 编辑 labels JSON → overpic 代码派生 + 预览实时更新 + 导出。
// A：Monaco 编辑 TikZ（tikzjax 预览 Phase 2）。

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Download, FileDown, Loader2, Save } from 'lucide-react';

import { findSimilarFigures, saveFromResult } from '@/app/actions/geometry-library';
import OverlaySvgPreview from '@/components/tikz/OverlaySvgPreview';
import TikzCodeEditor from '@/components/tikz/TikzCodeEditor';
import { bakeLabelsIntoSvg, buildOverpicLatex, isLowConfidence } from '@/lib/tikz/overpic';
import type { GeoLabel, ProcessResult } from '@/types/tikz';

function downloadBlob(filename: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('已复制');
  } catch {
    toast.error('复制失败');
  }
}

function parseLabels(text: string): GeoLabel[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('应为数组');
  return data.map((d, i) => {
    if (typeof d?.text !== 'string') throw new Error(`第 ${i} 项缺少 text`);
    const x = Number(d.x_percent);
    const y = Number(d.y_percent);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`第 ${i} 项坐标非法`);
    const conf = d.confidence == null ? undefined : Number(d.confidence);
    return { text: d.text, x_percent: x, y_percent: y, confidence: conf };
  });
}

export default function DualPanePreview({
  originalSrc,
  result,
}: {
  originalSrc: string;
  result: ProcessResult;
}) {
  const isB = result.pipeline === 'B';

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted';

  // ── Pipeline B 可编辑状态 ──
  const [labels, setLabels] = useState<GeoLabel[]>(result.labels);
  const [labelsText, setLabelsText] = useState(() => JSON.stringify(result.labels, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const overpicCode = useMemo(() => buildOverpicLatex(labels), [labels]);
  const inlineSvg = useMemo(
    () => (result.svg ? bakeLabelsIntoSvg(result.svg, labels) : ''),
    [result.svg, labels],
  );

  // ── Pipeline A 可编辑状态 ──
  const [tikz, setTikz] = useState(result.tikz ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const similar = await findSimilarFigures(result.phash);
      const res = await saveFromResult(result, labels, isB ? inlineSvg : null);
      if (!res.success) {
        toast.error(`保存失败：${res.error}`);
        return;
      }
      toast.success(similar.length > 0 ? `已保存（发现 ${similar.length} 个近重复）` : '已保存到图库');
    } finally {
      setSaving(false);
    }
  };

  const onLabelsChange = (text: string) => {
    setLabelsText(text);
    try {
      setLabels(parseLabels(text));
      setParseError(null);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : '解析失败');
    }
  };

  return (
    <div className="space-y-4">
      {/* 双屏 */}
      <div className="grid gap-4 md:grid-cols-2">
        <figure className="space-y-2">
          <figcaption className="text-xs font-medium text-muted-foreground">原图（裁剪区域）</figcaption>
          <div className="rounded-lg border bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={originalSrc} alt="原图" className="mx-auto max-h-[55vh] w-auto max-w-full" />
          </div>
        </figure>

        <figure className="space-y-2">
          <figcaption className="text-xs font-medium text-muted-foreground">
            重建预览{result.used_engine ? ` · ${result.used_engine}` : ''}
          </figcaption>
          <div className="rounded-lg border p-2">
            {isB && result.svg ? (
              <OverlaySvgPreview svg={result.svg} labels={labels} />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                Pipeline A 的 TikZ 实时预览（tikzjax）将在 Phase 2 接入；当前可编辑代码。
              </div>
            )}
          </div>
        </figure>
      </div>

      {/* 编辑器 */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            {isB ? '标签 JSON（改坐标/文字，预览即时更新）' : 'TikZ 代码'}
          </span>
          {isB && parseError && <span className="text-xs text-destructive">JSON 错误：{parseError}</span>}
          {isB && !parseError && <span className="text-xs text-green-600">✓ {labels.length} 个标签</span>}
          {isB &&
            !parseError &&
            (() => {
              const low = labels.filter(isLowConfidence).length;
              return low > 0 ? (
                <span className="text-xs text-amber-600">⚠ {low} 个低置信度需复核（预览中高亮）</span>
              ) : null;
            })()}
        </div>

        {isB ? (
          <TikzCodeEditor value={labelsText} onChange={onLabelsChange} language="json" />
        ) : (
          <TikzCodeEditor value={tikz} onChange={setTikz} language="latex" />
        )}
      </div>

      {/* 派生 overpic 代码（B） */}
      {isB && (
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground">overpic 代码（导出用，自动随标签更新）</span>
          <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
            <code>{overpicCode}</code>
          </pre>
        </div>
      )}

      {/* 导出 */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 保存到图库
        </button>
        {isB ? (
          <>
            <button type="button" onClick={() => copy(overpicCode)} className={btn}>
              <Copy className="h-4 w-4" /> 复制 overpic
            </button>
            <button
              type="button"
              onClick={() => downloadBlob('geometry.tex', overpicCode, 'text/plain')}
              className={btn}
            >
              <Download className="h-4 w-4" /> 下载 .tex
            </button>
            {result.pdf_base64 && (
              <button
                type="button"
                onClick={() => downloadBlob('clean_geometry.pdf', base64ToBytes(result.pdf_base64!).buffer as ArrayBuffer, 'application/pdf')}
                className={btn}
              >
                <FileDown className="h-4 w-4" /> 下载 clean.pdf
              </button>
            )}
            {result.svg && (
              <button
                type="button"
                onClick={() => downloadBlob('geometry.svg', result.svg!, 'image/svg+xml')}
                className={btn}
              >
                <FileDown className="h-4 w-4" /> 下载 .svg
              </button>
            )}
            {inlineSvg && (
              <button
                type="button"
                onClick={() => copy(inlineSvg)}
                title="标签已烘焙进 SVG，可直接粘进题目内容由 MathRenderer 渲染"
                className={btn}
              >
                <Copy className="h-4 w-4" /> 复制内联 SVG（入题库）
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" onClick={() => copy(tikz)} className={btn}>
              <Copy className="h-4 w-4" /> 复制 TikZ
            </button>
            <button
              type="button"
              onClick={() => downloadBlob('figure.tex', tikz, 'text/plain')}
              className={btn}
            >
              <Download className="h-4 w-4" /> 下载 .tex
            </button>
          </>
        )}
      </div>
    </div>
  );
}
