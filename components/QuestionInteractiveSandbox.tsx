'use client';

import { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import InteractiveMathSandbox, {
  type DynamicInputsMap,
} from '@/components/InteractiveMathSandbox';
import type { InteractiveSandboxConfig, SandboxControl } from '@/types/database';

interface Props {
  config: InteractiveSandboxConfig;
  /** When embedded in a card, allow callers to constrain the canvas size */
  className?: string;
}

function initialValues(controls: SandboxControl[]): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  for (const c of controls) {
    if (c.type === 'number') out[c.input_name] = c.default;
    else if (c.type === 'boolean') out[c.input_name] = c.default;
    // triggers have no initial value — they're fire-and-forget
  }
  return out;
}

export default function QuestionInteractiveSandbox({ config, className }: Props) {
  const [values, setValues] = useState<Record<string, number | boolean>>(() =>
    initialValues(config.controls),
  );
  // Pending triggers are queued for a single render cycle, then cleared.
  // This guarantees that two consecutive clicks on the same trigger button
  // produce two distinct dynamicInputs identities, so both .fire() calls reach Rive.
  const [pendingTriggers, setPendingTriggers] = useState<string[]>([]);

  const dynamicInputs = useMemo<DynamicInputsMap>(() => {
    const out: DynamicInputsMap = { ...values };
    for (const name of pendingTriggers) out[name] = 'trigger';
    return out;
  }, [values, pendingTriggers]);

  function setNumber(name: string, n: number) {
    setValues((prev) => ({ ...prev, [name]: n }));
  }

  function setBoolean(name: string, b: boolean) {
    setValues((prev) => ({ ...prev, [name]: b }));
  }

  function fireTrigger(name: string) {
    setPendingTriggers([name]);
    // Drain on the next macrotask so the trigger payload reaches the sandbox effect
    // and is then cleared, leaving room for the next click.
    setTimeout(() => setPendingTriggers([]), 32);
  }

  return (
    <div className="mx-5 my-3 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/60 to-white dark:from-indigo-950/30 dark:to-zinc-900 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/30">
        <Zap size={13} className="text-indigo-500 dark:text-indigo-400" />
        <span className="text-[0.6875rem] font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          交互沙盒 · 拖动控件观察图形变化
        </span>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,260px)]">
        <InteractiveMathSandbox
          assetPath={config.asset_path}
          stateMachineName={config.state_machine}
          dynamicInputs={dynamicInputs}
          className={['aspect-square w-full', className ?? ''].filter(Boolean).join(' ')}
        />

        <div className="flex flex-col gap-3">
          {config.controls.map((control) => (
            <ControlWidget
              key={control.input_name}
              control={control}
              value={values[control.input_name]}
              onNumber={(v) => setNumber(control.input_name, v)}
              onBoolean={(v) => setBoolean(control.input_name, v)}
              onFire={() => fireTrigger(control.input_name)}
            />
          ))}
          {config.controls.length === 0 && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">
              （该沙盒未配置任何控件）
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ControlWidget({
  control,
  value,
  onNumber,
  onBoolean,
  onFire,
}: {
  control: SandboxControl;
  value: number | boolean | undefined;
  onNumber: (v: number) => void;
  onBoolean: (v: boolean) => void;
  onFire: () => void;
}) {
  if (control.type === 'number') {
    const current = typeof value === 'number' ? value : control.default;
    return (
      <label className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
          <span>{control.label}</span>
          <span className="font-mono tabular-nums text-zinc-500 dark:text-zinc-500">
            {current}
          </span>
        </div>
        <input
          type="range"
          min={control.min}
          max={control.max}
          step={control.step ?? 1}
          value={current}
          onChange={(e) => onNumber(Number(e.target.value))}
          className="w-full accent-indigo-500"
        />
      </label>
    );
  }

  if (control.type === 'boolean') {
    const current = typeof value === 'boolean' ? value : control.default;
    return (
      <label className="flex items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
        <span>{control.label}</span>
        <input
          type="checkbox"
          checked={current}
          onChange={(e) => onBoolean(e.target.checked)}
          className="h-4 w-4 accent-indigo-500"
        />
      </label>
    );
  }

  // trigger
  return (
    <button
      type="button"
      onClick={onFire}
      className="flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 px-3 py-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 active:scale-95 transition-all"
    >
      <Zap size={12} />
      {control.label}
    </button>
  );
}
