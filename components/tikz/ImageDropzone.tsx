'use client';

import { useCallback } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { FileUp, ImageIcon } from 'lucide-react';

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
};

export default function ImageDropzone({
  onFile,
  disabled,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length) return;
      if (accepted[0]) onFile(accepted[0]);
    },
    [onFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxFiles: 1,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-16 text-center transition ${
        isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="flex items-center gap-2 text-muted-foreground">
        <FileUp className="h-6 w-6" />
        <ImageIcon className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium">拖拽 PDF / 图片到此，或点击选择</p>
      <p className="text-xs text-muted-foreground">PDF 自动按页栅格化 · 支持 PNG / JPG / WebP</p>
    </div>
  );
}
