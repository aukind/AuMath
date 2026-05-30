'use client';

import { useEffect, useRef } from 'react';
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';
import { Loader2 } from 'lucide-react';

export type RiveInputValue = number | boolean | 'trigger';

export type DynamicInputsMap = Record<string, RiveInputValue>;

export interface InteractiveMathSandboxProps {
  assetPath: string;
  stateMachineName: string;
  dynamicInputs: DynamicInputsMap;
  className?: string;
  onReady?: () => void;
}

export default function InteractiveMathSandbox({
  assetPath,
  stateMachineName,
  dynamicInputs,
  className,
  onReady,
}: InteractiveMathSandboxProps) {
  const { rive, RiveComponent } = useRive({
    src: assetPath,
    stateMachines: stateMachineName,
    autoplay: true,
    automaticallyHandleEvents: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
  });

  const previousValuesRef = useRef<Record<string, RiveInputValue>>({});
  const onReadyFiredRef = useRef(false);

  useEffect(() => {
    if (!rive) return;
    const inputs = rive.stateMachineInputs(stateMachineName);
    if (!inputs || inputs.length === 0) return;

    // Per-key diff: triggers fire whenever they appear in the payload
    // (action semantics — calling fire() IS the event), values only sync
    // when actually changed (defensive against unnecessary state machine churn).
    for (const [name, raw] of Object.entries(dynamicInputs)) {
      const target = inputs.find((input) => input.name === name);
      if (!target) continue;

      if (raw === 'trigger') {
        target.fire();
      } else if (previousValuesRef.current[name] !== raw) {
        target.value = raw;
      }
    }
    previousValuesRef.current = { ...dynamicInputs };
  }, [rive, stateMachineName, dynamicInputs]);

  useEffect(() => {
    if (!rive || onReadyFiredRef.current) return;
    onReadyFiredRef.current = true;
    onReady?.();
  }, [rive, onReady]);

  useEffect(() => {
    return () => {
      try {
        rive?.cleanup();
      } catch {
        // Instance may have already been torn down by useRive's own unmount handler.
      }
      previousValuesRef.current = {};
      onReadyFiredRef.current = false;
    };
  }, [rive]);

  const isReady = !!rive;

  const containerClasses = [
    'relative isolate overflow-hidden rounded-lg bg-slate-50 dark:bg-slate-900/40',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const canvasClasses = [
    'h-full w-full transition-opacity duration-300 ease-out',
    isReady ? 'opacity-100' : 'opacity-0',
  ].join(' ');

  const skeletonClasses = [
    'pointer-events-none absolute inset-0 flex items-center justify-center',
    'bg-slate-100 dark:bg-slate-800/60 animate-pulse',
    'transition-opacity duration-300 ease-out',
    isReady ? 'opacity-0' : 'opacity-100',
  ].join(' ');

  return (
    <div className={containerClasses}>
      <RiveComponent className={canvasClasses} />
      <div
        aria-hidden={isReady}
        role="status"
        aria-live="polite"
        className={skeletonClasses}
      >
        <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500" />
        <span className="sr-only">Loading interactive sandbox</span>
      </div>
    </div>
  );
}
