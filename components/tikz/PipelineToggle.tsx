'use client';

import type { PipelineId } from '@/types/tikz';

const OPTIONS: { id: PipelineId; label: string; hint: string }[] = [
  { id: 'B', label: 'Pipeline B · 逆向工程', hint: 'OCR+矢量化，无损兜底（推荐）' },
  { id: 'A', label: 'Pipeline A · AI 生成', hint: 'DeTikZify（Phase 2，当前 Mock）' },
];

export default function PipelineToggle({
  value,
  onChange,
  disabled,
}: {
  value: PipelineId;
  onChange: (v: PipelineId) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg border p-1">
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            title={opt.hint}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
