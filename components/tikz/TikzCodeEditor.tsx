'use client';

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { Loader2 } from 'lucide-react';

const MonacoEditor = dynamic(() => import('@monaco-editor/react').then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-lg bg-[#1e1e1e]">
      <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
    </div>
  ),
});

export default function TikzCodeEditor({
  value,
  onChange,
  language = 'json',
  height = 240,
}: {
  value: string;
  onChange: (v: string) => void;
  language?: 'json' | 'latex' | 'plaintext';
  height?: number;
}) {
  const { resolvedTheme } = useTheme();
  return (
    <div className="overflow-hidden rounded-lg border" style={{ height }}>
      <MonacoEditor
        language={language}
        theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        options={{
          minimap: { enabled: false },
          wordWrap: 'on',
          fontSize: 13,
          lineHeight: 22,
          tabSize: 2,
          scrollBeyondLastLine: false,
          padding: { top: 12 },
          renderLineHighlight: 'gutter',
        }}
      />
    </div>
  );
}
