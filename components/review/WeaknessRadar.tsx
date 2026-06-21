// 弱点雷达图（服务端 SVG，确定性）。axis.value ∈ [0,1]，越大越弱（错题越多）。
import type { RadarAxis } from '@/app/actions/review-analytics';

const SIZE = 260;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 92;

function point(angle: number, radius: number): [number, number] {
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];
}

export default function WeaknessRadar({ axes }: { axes: RadarAxis[] }) {
  const n = axes.length;
  // 从正上方开始，顺时针均分。
  const angleOf = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

  const rings = [0.25, 0.5, 0.75, 1];
  const gridPolys = rings.map((r) =>
    axes.map((_, i) => point(angleOf(i), R * r).join(',')).join(' '));
  const dataPoly = axes.map((a, i) => point(angleOf(i), R * Math.max(0.04, a.value)).join(',')).join(' ');

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto h-auto w-full max-w-[300px]">
      {/* 同心网格 */}
      {gridPolys.map((pts, i) => (
        <polygon key={i} points={pts} className="fill-none stroke-zinc-200 dark:stroke-zinc-700" strokeWidth={1} />
      ))}
      {/* 轴线 */}
      {axes.map((_, i) => {
        const [x, y] = point(angleOf(i), R);
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} className="stroke-zinc-200 dark:stroke-zinc-700" strokeWidth={1} />;
      })}
      {/* 数据多边形（红=弱点） */}
      <polygon points={dataPoly} className="fill-red-500/25 stroke-red-500" strokeWidth={2} />
      {axes.map((a, i) => {
        const [x, y] = point(angleOf(i), R * Math.max(0.04, a.value));
        return <circle key={i} cx={x} cy={y} r={2.5} className="fill-red-500" />;
      })}
      {/* 轴标签 */}
      {axes.map((a, i) => {
        const [x, y] = point(angleOf(i), R + 14);
        const anchor = Math.abs(x - CX) < 8 ? 'middle' : x > CX ? 'start' : 'end';
        return (
          <text key={i} x={x} y={y} textAnchor={anchor} dominantBaseline="middle"
            className="fill-zinc-500 text-[10px] dark:fill-zinc-400">
            {a.name.length > 6 ? a.name.slice(0, 6) + '…' : a.name}
          </text>
        );
      })}
    </svg>
  );
}
