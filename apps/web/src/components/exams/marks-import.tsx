'use client';

import type { MarksImportResult, MarksSheet } from '@schoolos/contracts';
import { Badge, Button, DialogBody, DialogContent, DialogFooter, cn, toast } from '@schoolos/ui';
import { Download, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiError, apiPost } from '@/lib/api-client';
import { uploadFile } from '@/lib/hooks';

const CHANGE = { new: ['New', 'info'], changed: ['Changed', 'warning'], same: ['Same', 'neutral'], blank: ['Left as is', 'neutral'] } as const;

/** "Download sheet" + "Upload filled sheet" for the marks entry page. */
export function MarksImportButtons({ sheet, onOpen }: { sheet: MarksSheet; onOpen: (fileId: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const q = `examSubjectId=${sheet.examSubject.id}&sectionId=${sheet.section.id}`;
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onOpen((await uploadFile(file, 'marks_import')).id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The upload didn’t work.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <div className="flex gap-2">
      <Button variant="secondary" asChild><a href={`/api/v1/exams/marks/template?${q}`} download><Download /> Download sheet</a></Button>
      {sheet.editable && (
        <>
          <Button variant="secondary" onClick={() => input.current?.click()} loading={busy}><Upload /> Upload filled sheet</Button>
          <input ref={input} type="file" hidden accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => void pick(e.target.files?.[0])} />
        </>
      )}
    </div>
  );
}

/** Check the uploaded sheet, show every row, save only when nothing is wrong. Body of a dialog. */
export function MarksImportDialog({ sheet, fileId, onDone }: { sheet: MarksSheet; fileId: string; onDone: (saved: boolean) => void }) {
  const [result, setResult] = useState<MarksImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const body = { examSubjectId: sheet.examSubject.id, sectionId: sheet.section.id, fileId, version: sheet.version };
  async function run(apply: boolean) {
    setBusy(true);
    try {
      const res = (await apiPost<{ data: MarksImportResult }>('/exams/marks/import', { ...body, apply })).data;
      setResult(res);
      if (res.applied) {
        toast.success(`${res.changes} mark${res.changes === 1 ? '' : 's'} saved`);
        onDone(true);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t read that sheet.');
      if (!apply) onDone(false);
    } finally {
      setBusy(false);
      setChecked(true);
    }
  }
  // Check once when the dialog opens — nothing is saved until Save.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <DialogContent title="Check the uploaded marks" description={`${sheet.examSubject.subject.name} · ${sheet.section.label} · out of ${sheet.examSubject.maxMarks}`} className="max-w-[720px]">
      <DialogBody className="flex flex-col gap-3">
        {!result ? (
          <p className="text-body text-fg-secondary">Reading the sheet…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {result.errors ? <Badge tone="danger">{result.errors} row{result.errors === 1 ? '' : 's'} to fix</Badge> : <Badge tone="success">No problems</Badge>}
              <Badge tone="info">{result.changes} to save</Badge>
              {result.missing.length > 0 && <Badge>{result.missing.length} not in the sheet — left as they are</Badge>}
            </div>
            <ul className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
              {result.rows.map((r) => (
                <li key={r.row} className={cn('flex items-center gap-3 border-b border-border px-3 py-2 text-small last:border-b-0', r.error && 'bg-danger-bg')}>
                  <span className="tabular w-10 text-fg-tertiary">#{r.row}</span>
                  <span className="min-w-0 flex-1 truncate">{r.name ?? r.admissionNo}</span>
                  {r.error ? (
                    <span className="text-danger">{r.error}</span>
                  ) : (
                    <>
                      <span className="tabular font-medium">{r.absent ? 'Absent' : r.exempt ? 'Exempt' : (r.marks ?? '—')}</span>
                      <Badge tone={CHANGE[r.change][1]}>{CHANGE[r.change][0]}</Badge>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {result.errors > 0 && <p className="text-small text-fg-secondary">Fix these rows in your sheet and upload it again. Nothing has been saved.</p>}
          </>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onDone(false)}>Cancel</Button>
        <Button onClick={() => void run(true)} loading={busy && checked} disabled={!result || result.errors > 0 || !result.changes}>Save {result?.changes ? `${result.changes} mark${result.changes === 1 ? '' : 's'}` : ''}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
