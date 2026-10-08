'use client';

import type { FilePurpose } from '@schoolos/contracts';
import { Avatar, Spinner, toast } from '@schoolos/ui';
import { Camera } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { uploadFile } from '@/lib/hooks';

/** Avatar that doubles as a photo uploader when `onUploaded` is given. */
export function PhotoUpload({
  name,
  src,
  size = 56,
  purpose,
  onUploaded,
}: {
  name: string;
  src: string | null | undefined;
  size?: number;
  purpose: FilePurpose;
  onUploaded?: (fileId: string) => Promise<unknown>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!onUploaded) return <Avatar name={name} src={src} size={size} />;

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await uploadFile(file, purpose);
      await onUploaded!(uploaded.id);
      toast.success('Photo updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "We couldn't upload the photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      className="group relative shrink-0 rounded-full focus-visible:outline-2"
      aria-label={`Change photo of ${name}`}
      disabled={busy}
    >
      <Avatar name={name} src={src} size={size} />
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {busy ? <Spinner className="size-5" /> : <Camera className="size-5" />}
      </span>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
    </button>
  );
}
