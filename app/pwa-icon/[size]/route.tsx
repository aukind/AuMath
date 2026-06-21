import { ImageResponse } from 'next/og';

// PWA manifest 图标（Android/桌面安装用）。/pwa-icon/192 与 /pwa-icon/512 各出一张
// 满铺渐变图（满足 maskable 安全区，缩放不留白边）。沿用站点 ∞ 视觉。
export function generateStaticParams() {
  return [{ size: '192' }, { size: '512' }];
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const s = Number(size) === 512 ? 512 : 192;
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ color: 'white', fontSize: s * 0.6, fontWeight: 900, lineHeight: 1 }}>∞</div>
      </div>
    ),
    { width: s, height: s },
  );
}
