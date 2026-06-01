'use client';

import { useCallback, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { processPipeline, rasterizePdf } from '@/app/actions/cv-tikz';
import AutoDetectStrip from '@/components/tikz/AutoDetectStrip';
import DualPanePreview from '@/components/tikz/DualPanePreview';
import ImageDropzone from '@/components/tikz/ImageDropzone';
import PipelineToggle from '@/components/tikz/PipelineToggle';
import RegionCropper from '@/components/tikz/RegionCropper';
import type { PipelineId, ProcessResult, RasterizePage } from '@/types/tikz';

type Stage =
  | { kind: 'upload' }
  | { kind: 'rasterizing' }
  | { kind: 'pick-page'; pages: RasterizePage[] }
  | { kind: 'crop'; src: string }
  | { kind: 'processing'; src: string }
  | { kind: 'result'; src: string; result: ProcessResult };

/** File → base64（去掉 data: 前缀），分块避免大图爆栈。 */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export default function TikzImportWorkflow() {
  const [stage, setStage] = useState<Stage>({ kind: 'upload' });
  const [pipeline, setPipeline] = useState<PipelineId>('B');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStage({ kind: 'upload' });
    setError(null);
  };

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (file.type === 'application/pdf') {
      setStage({ kind: 'rasterizing' });
      const b64 = await fileToBase64(file);
      const res = await rasterizePdf(b64);
      if (!res.success) {
        setError(res.error);
        setStage({ kind: 'upload' });
        return;
      }
      setStage({ kind: 'pick-page', pages: res.pages });
    } else {
      const b64 = await fileToBase64(file);
      setStage({ kind: 'crop', src: `data:${file.type};base64,${b64}` });
    }
  }, []);

  const handleCropped = useCallback(
    async (base64Png: string) => {
      const src = `data:image/png;base64,${base64Png}`;
      setStage({ kind: 'processing', src });
      setError(null);
      const res = await processPipeline(base64Png, pipeline, 'image/png');
      if (!res.success) {
        setError(res.error);
        setStage({ kind: 'crop', src });
        return;
      }
      setStage({ kind: 'result', src, result: res.result });
    },
    [pipeline],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PipelineToggle
          value={pipeline}
          onChange={setPipeline}
          disabled={stage.kind === 'processing' || stage.kind === 'rasterizing'}
        />
        {stage.kind !== 'upload' && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            重新上传
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {stage.kind === 'upload' && <ImageDropzone onFile={handleFile} />}

      {stage.kind === 'rasterizing' && (
        <div className="flex items-center gap-2 px-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 正在栅格化 PDF…
        </div>
      )}

      {stage.kind === 'pick-page' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">选择含几何图的页面：</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {stage.pages.map((pg) => (
              <button
                key={pg.page}
                type="button"
                onClick={() => setStage({ kind: 'crop', src: `data:image/png;base64,${pg.image_base64}` })}
                className="group rounded-lg border p-1 text-left hover:border-primary"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:image/png;base64,${pg.image_base64}`} alt={`第 ${pg.page} 页`} className="h-40 w-full object-contain" />
                <div className="px-1 py-0.5 text-xs text-muted-foreground">第 {pg.page} 页</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {stage.kind === 'crop' && (
        <div className="space-y-4">
          <AutoDetectStrip key={stage.src} imageBase64={stage.src.split(',')[1]} onPick={handleCropped} />
          <div className="text-xs font-medium text-muted-foreground">或手动框选：</div>
          <RegionCropper src={stage.src} onCropped={handleCropped} />
        </div>
      )}

      {stage.kind === 'processing' && (
        <div className="space-y-3">
          <RegionCropper src={stage.src} onCropped={() => {}} busy />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在调用 {pipeline === 'B' ? 'Pipeline B' : 'Pipeline A'}…
          </div>
        </div>
      )}

      {stage.kind === 'result' && <DualPanePreview originalSrc={stage.src} result={stage.result} />}
    </div>
  );
}
