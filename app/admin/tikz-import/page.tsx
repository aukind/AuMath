import TikzImportWorkflow from '@/components/tikz/TikzImportWorkflow';

export const metadata = { title: 'TikZ 图形导入 · AuMath' };

export default function TikzImportPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8 space-y-1">
          <h1 className="text-2xl font-bold">PDF/图片 → LaTeX·TikZ 导入</h1>
          <p className="text-sm text-muted-foreground">
            框选试卷几何图，经本地 CV 微服务还原为矢量代码（overpic+SVG / TikZ）。
            需先在本地启动 <code className="rounded bg-muted px-1">math-cv-service</code>（uvicorn :8000）。
          </p>
        </header>
        <TikzImportWorkflow />
      </div>
    </main>
  );
}
