'use client';

// 根布局级兜底：layout.tsx 本身崩溃时启用，需自带 <html>/<body>。
// 此时全局样式可能未加载，只用内联样式保证可读。
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#fafafa' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.125rem', marginBottom: '0.5rem', color: '#18181b' }}>AuMath 暂时无法访问</h1>
          <p style={{ fontSize: '0.875rem', color: '#71717a', marginBottom: '1.25rem' }}>
            服务出现异常，请重试或稍后再来。{error.digest ? `（${error.digest}）` : ''}
          </p>
          <button
            onClick={reset}
            style={{ padding: '0.6rem 1.4rem', borderRadius: '0.75rem', border: 'none', background: '#18181b', color: '#fff', fontSize: '0.875rem', cursor: 'pointer' }}
          >
            重新加载
          </button>
        </div>
      </body>
    </html>
  );
}
