'use client';

import { Button, Card, CardHeader, Field, Input, Skeleton, Spinner, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ImageUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError, apiPatch } from '@/lib/api-client';
import { uploadFile, useSchool } from '@/lib/hooks';

const SWATCHES = ['#2F6FEB', '#0E7490', '#16A34A', '#7C3AED', '#C2410C', '#BE123C', '#1F2937', '#B45309'];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Logo + one accent colour; the whole app derives its shades from it (docs/07 §1.2). */
export default function BrandingPage() {
  const school = useSchool();
  const qc = useQueryClient();
  const [color, setColor] = useState('#2F6FEB');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (school.data) setColor(school.data.accentColor);
  }, [school.data]);

  // Live preview: the page itself takes the colour while you choose.
  useEffect(() => {
    if (!HEX.test(color)) return;
    const root = document.documentElement;
    const previous = root.style.getPropertyValue('--accent');
    root.style.setProperty('--accent', color);
    return () => root.style.setProperty('--accent', previous);
  }, [color]);

  if (!school.data) return <Skeleton className="h-96" />;
  const changed = color.toUpperCase() !== school.data.accentColor.toUpperCase();

  async function save() {
    setSaving(true);
    try {
      await apiPatch('/school/branding', { accentColor: color });
      await qc.invalidateQueries({ queryKey: ['school'] });
      toast.success('Colour saved. Everyone sees it from their next page load.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save the colour.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadFile(file, 'school_logo');
      await apiPatch('/school/branding', { logoFileId: uploaded.id });
      await qc.invalidateQueries({ queryKey: ['school'] });
      toast.success('Logo updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t upload the logo.');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Logo" description="Shown on the sign-in page, receipts and report cards. PNG or JPG, square works best, up to 2 MB." />
        <div className="flex items-center gap-5 p-5">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-xl border border-border bg-subtle">
            {school.data.logoUrl ? <img src={school.data.logoUrl} alt="School logo" className="size-full object-contain" /> : <span className="text-h1 font-semibold text-fg-tertiary">{school.data.name[0]}</span>}
          </div>
          <Button variant="secondary" onClick={() => input.current?.click()} disabled={uploading}>
            {uploading ? <Spinner /> : <ImageUp />} {school.data.logoUrl ? 'Replace logo' : 'Upload logo'}
          </Button>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void uploadLogo(e.target.files?.[0])} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Accent colour" description="Used sparingly — buttons, links and the selected menu item. Shades are generated automatically and kept readable." />
        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setColor(s)}
                aria-label={`Use ${s}`}
                className={cn('size-8 rounded-full border-2 transition-transform hover:scale-110', color.toUpperCase() === s ? 'border-fg' : 'border-transparent')}
                style={{ background: s }}
              />
            ))}
            <input type="color" aria-label="Custom colour" value={HEX.test(color) ? color : '#2F6FEB'} onChange={(e) => setColor(e.target.value.toUpperCase())} className="size-8 cursor-pointer rounded-full border border-border bg-transparent" />
          </div>
          <Field label="Hex value" htmlFor="br-hex" error={HEX.test(color) ? undefined : 'Use a colour like #2F6FEB'} className="w-40">
            <Input id="br-hex" value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" />
          </Field>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-app p-4">
            <span className="text-small text-fg-secondary">Preview:</span>
            <Button size="sm">Primary action</Button>
            <span className="rounded-md bg-accent-tint px-3 py-1.5 text-small font-medium">Selected item</span>
            <a className="text-small text-accent-strong underline">A link</a>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          {changed && <Button variant="ghost" onClick={() => setColor(school.data!.accentColor)}>Reset</Button>}
          <Button disabled={!changed || !HEX.test(color)} loading={saving} onClick={() => void save()}>Save colour</Button>
        </div>
      </Card>
    </div>
  );
}
