'use client';

import { useState } from 'react';
import InteractiveMathSandbox from '@/components/InteractiveMathSandbox';

const DEMO_ASSET = 'https://cdn.rive.app/animations/vehicles.riv';
const DEMO_STATE_MACHINE = 'bumpy';

export default function InteractiveMathSandboxExample() {
  const [angle, setAngle] = useState<number>(0);
  const [ready, setReady] = useState<boolean>(false);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Interactive Math Sandbox · Rive Binding Demo
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          滑动下方滑块，React state <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">angle</code> 会被实时映射到
          Rive 状态机内名为 <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">Angle</code> 的 Input 上。
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          占位资产说明：当前 assetPath 指向 Rive 官方 CDN 的 <code>vehicles.riv</code>，其状态机为 <code>bumpy</code>，
          仅定义了 <code>Level</code> 数值输入。若需观察到 <code>Angle</code> 输入真正驱动动画，请替换为含有
          <code> Angle</code> 数值输入的自定义 .riv 文件 —— 沙盒组件会自动忽略不存在的输入名。
        </p>
      </header>

      <section className="space-y-4">
        <InteractiveMathSandbox
          assetPath={DEMO_ASSET}
          stateMachineName={DEMO_STATE_MACHINE}
          dynamicInputs={{ Angle: angle }}
          onReady={() => setReady(true)}
          className="aspect-square w-full max-w-[600px]"
        />

        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <label
            htmlFor="angle-slider"
            className="flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <span>Angle (°)</span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {angle.toString().padStart(3, '0')}
            </span>
          </label>
          <input
            id="angle-slider"
            type="range"
            min="0"
            max="360"
            step="1"
            value={angle}
            onChange={(event) => setAngle(Number(event.target.value))}
            className="w-full accent-indigo-500"
          />
          <p className="text-xs text-slate-500 dark:text-slate-500">
            Canvas 状态：{ready ? '已就绪（onReady 回调已触发）' : '加载中…'}
          </p>
        </div>
      </section>
    </main>
  );
}
