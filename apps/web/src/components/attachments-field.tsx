'use client';

import type { FilePurpose } from '@schoolos/contracts';
import { Button, toast } from '@schoolos/ui';
import { Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { uploadFile } from '@/lib/hooks';

export type Attachment = { id: string; originalName: string };

/** Up to `max` verified uploads, shown as removable chips. */
export function AttachmentsField({
  value,
  onChange,
  purpose,
  accept,
  hint,
  max = 5,
  onBusyChange,
}: {
  value: Attachment[];
  onChange: (files: Attachment[]) => void;
  purpose: FilePurpose;
  accept: string;
  hint: string;
  max?: number;
  onBusyChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const latest = useRef(value);
  latest.current = value;

  async function add(list: FileList | null) {
    const picked = Array.from(list ?? []).slice(0, max - value.length);
    if (!picked.length) return;
    setUploading((n) => n + picked.length);
    onBusyChange?.(true);
    for (const file of picked) {
      try {
        const info = await uploadFile(file, purpose);
        latest.current = [...latest.current, { id: info.id, originalName: info.originalName }];
        onChange(latest.current);
      } catch (err) {
        toast.error(err instanceof ApiError ? `${file.name}: ${err.message}` : `${file.name} didn't upload.`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    onBusyChange?.(false);
  }

  return (
    <div>
      <div className="mb-1.5 text-body font-medium">Attachments</div>
      <div className="flex flex-wrap items-center gap-2">
        {value.map((f) => (
          <span key={f.id} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-subtle pr-1 pl-2.5 text-small">
            <Paperclip className="size-3.5 text-fg-tertiary" />
            <span className="max-w-48 truncate">{f.originalName}</span>
            <button type="button" onClick={() => onChange(value.filter((y) => y.id !== f.id))} className="rounded p-0.5 text-fg-tertiary hover:bg-hover hover:text-fg" aria-label={`Remove ${f.originalName}`}>
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        {value.length < max && (
          <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()} loading={uploading > 0}>
            <Paperclip /> Attach file
          </Button>
        )}
        <input ref={input} type="file" multiple hidden accept={accept} onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
      </div>
      <p className="mt-1 text-caption text-fg-tertiary">{hint}</p>
    </div>
  );
}
