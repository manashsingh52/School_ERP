'use client';

import type { ImportEntity, ImportJobItem } from '@schoolos/contracts';
import { Button, Card, PageHeader, Spinner, Stepper, cn, toast } from '@schoolos/ui';
import { Download, FileSpreadsheet, GraduationCap, Upload, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState, type DragEvent } from 'react';
import { ApiError, apiPost } from '@/lib/api-client';
import { uploadFile } from '@/lib/hooks';

export default function NewImportPage() {
  return (
    <Suspense>
      <NewImport />
    </Suspense>
  );
}

const ENTITIES: { value: ImportEntity; label: string; description: string; icon: typeof Users }[] = [
  { value: 'STUDENTS', label: 'Students', description: 'With class, section and parents', icon: Users },
  { value: 'TEACHERS', label: 'Teachers', description: 'With mobile numbers for sign-in', icon: GraduationCap },
];

function NewImport() {
  const router = useRouter();
  const params = useSearchParams();
  const [entity, setEntity] = useState<ImportEntity>(params.get('entity') === 'TEACHERS' ? 'TEACHERS' : 'STUDENTS');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function start(file: File | undefined) {
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      toast.error('Use an Excel (.xlsx) or CSV file. In Excel: File → Save As → Excel Workbook.');
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadFile(file, 'import');
      const job = await apiPost<{ data: ImportJobItem }>('/imports', { entity, fileId: uploaded.id });
      router.push(`/imports/${job.data.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "We couldn't read this file.");
      setBusy(false);
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void start(e.dataTransfer.files[0]);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Import from Excel" description="Bring in a whole list at once. Nothing is saved until you've reviewed every row." />
      <Stepper steps={['Upload', 'Match columns', 'Review', 'Import']} current={0} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="What are you importing?">
        {ENTITIES.map((e) => {
          const Icon = e.icon;
          return (
            <button
              key={e.value}
              type="button"
              role="radio"
              aria-checked={entity === e.value}
              onClick={() => setEntity(e.value)}
              className={cn(
                'flex items-center gap-3 rounded-lg border p-4 text-left transition-colors',
                entity === e.value ? 'border-accent bg-accent-tint' : 'border-border bg-surface hover:border-border-strong',
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-surface text-fg-secondary shadow-e1"><Icon className="size-5" /></span>
              <span>
                <span className="block font-medium">{e.label}</span>
                <span className="block text-small text-fg-secondary">{e.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <Card
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn('flex flex-col items-center gap-4 border-2 border-dashed px-6 py-12 text-center transition-colors', dragging && 'border-accent bg-accent-tint')}
      >
        {busy ? (
          <>
            <Spinner className="size-6 text-accent" />
            <p className="text-body text-fg-secondary">Reading your file…</p>
          </>
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-full bg-subtle text-fg-tertiary"><FileSpreadsheet className="size-6" /></span>
            <div>
              <p className="font-medium">Drop your Excel or CSV file here</p>
              <p className="text-small text-fg-secondary">Up to 5,000 rows · .xlsx or .csv · your own column names are fine</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => input.current?.click()}><Upload /> Choose file</Button>
              <Button variant="secondary" asChild>
                <a href={`/api/v1/imports/templates/${entity}`} download><Download /> Download template</a>
              </Button>
            </div>
            <input ref={input} type="file" className="hidden" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void start(e.target.files?.[0])} />
          </>
        )}
      </Card>
    </div>
  );
}
