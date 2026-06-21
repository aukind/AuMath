import { ImageResponse } from 'next/og';

// iOS「添加到主屏幕」用的图标（apple-touch-icon）。Next 自动注入对应 <link>。
// 沿用站点 favicon 的渐变 ∞ 视觉，放大到 180×180。
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
        <div style={{ color: 'white', fontSize: 120, fontWeight: 900, lineHeight: 1 }}>∞</div>
      </div>
    ),
    { ...size },
  );
}
