'use client';

import { DOCUMENT_CATEGORIES, FILE_PURPOSES, type DocumentCategory, type DocumentItem, type DocumentOwnerType, type DownloadLink } from '@schoolos/contracts';
import { Badge, Button, Card, CardHeader, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, Field, Input, Select, Skeleton, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Eye, EyeOff, FileText, Pencil, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiError, apiDelete, apiFetch, apiPatch, apiPost } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { uploadFile, useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';

const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const ACCEPT = FILE_PURPOSES.document.mimeTypes.join(',');

/** Documents of one student, guardian, teacher — or the school. Parents only see what's shared with them. */
export function DocumentsPanel({ ownerType, ownerId, title = 'Documents', shareLabel = 'Parents can see this' }: { ownerType: DocumentOwnerType; ownerId?: string; title?: string; shareLabel?: string }) {
  const { can } = useMe();
  const qc = useQueryClient();
  const manage = can('document.manage');
  const key = ['documents', ownerType, ownerId ?? 'school'];
  const docs = useData<DocumentItem[]>(key, `/documents?ownerType=${ownerType}${ownerId ? `&ownerId=${ownerId}` : ''}`);
  const [editing, setEditing] = useState<DocumentItem | File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  async function download(d: DocumentItem) {
    try {
      window.open((await apiFetch<{ data: DownloadLink }>(`/documents/${d.id}/download`)).data.url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    }
  }
  async function remove(d: DocumentItem) {
    if (!window.confirm(`Delete “${d.title}”?`)) return;
    try {
      await apiDelete(`/documents/${d.id}`);
      toast.success('Document deleted');
      void refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    }
  }

  return (
    <Card>
      <CardHeader
        title={title}
        description="PDF, Word or photos up to 15 MB. Downloads use short-lived private links."
        action={manage && (
          <>
            <Button size="sm" onClick={() => input.current?.click()}><Upload /> Upload</Button>
            <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setEditing(f); }} />
          </>
        )}
      />
      {!docs.data ? (
        <Skeleton className="m-5 h-24" />
      ) : !docs.data.length ? (
        <EmptyState icon={<FileText />} title="No documents yet" description={manage ? 'Upload birth certificates, transfer certificates, ID proofs and more.' : undefined} />
      ) : (
        <ul className="mt-3 border-t border-border">
          {docs.data.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
              <FileText className="size-5 shrink-0 text-fg-tertiary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {d.title}
                  <Badge>{DOCUMENT_CATEGORIES[d.category] ?? d.category}</Badge>
                  {manage && (d.visibleToGuardian ? <Badge tone="info"><Eye className="size-3" /> Shared</Badge> : <Badge><EyeOff className="size-3" /> Staff only</Badge>)}
                </div>
                <div className="text-small text-fg-tertiary">{[d.file.name, size(d.file.sizeBytes), formatDate(d.createdAt), d.uploadedBy].filter(Boolean).join(' · ')}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void download(d)} aria-label={`Download ${d.title}`}><Download /></Button>
              {manage && <Button size="sm" variant="ghost" onClick={() => setEditing(d)} aria-label={`Edit ${d.title}`}><Pencil /></Button>}
              {manage && <Button size="sm" variant="ghost" className="text-danger" onClick={() => void remove(d)} aria-label={`Delete ${d.title}`}><Trash2 /></Button>}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <DocumentDialog target={editing} ownerType={ownerType} ownerId={ownerId} shareLabel={shareLabel} onDone={() => { setEditing(null); void refresh(); }} />}
      </Dialog>
    </Card>
  );
}

function DocumentDialog({ target, ownerType, ownerId, shareLabel, onDone }: { target: DocumentItem | File; ownerType: DocumentOwnerType; ownerId?: string; shareLabel: string; onDone: () => void }) {
  const isNew = target instanceof File;
  const [title, setTitle] = useState(isNew ? target.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') : target.title);
  const [category, setCategory] = useState<DocumentCategory>(isNew ? (ownerType === 'SCHOOL' ? 'policy' : 'other') : target.category);
  const [shared, setShared] = useState(isNew ? false : target.visibleToGuardian);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      if (isNew) {
        const file = await uploadFile(target, 'document');
        await apiPost('/documents', { ownerType, ownerId, category, title: title.trim(), fileId: file.id, visibleToGuardian: shared });
        toast.success('Document uploaded');
      } else {
        await apiPatch(`/documents/${target.id}`, { title: title.trim(), category, visibleToGuardian: shared });
        toast.success('Saved');
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <DialogContent title={isNew ? 'Upload a document' : 'Edit document'} description={isNew ? `${target.name} · ${size(target.size)}` : undefined}>
      <DialogBody className="flex flex-col gap-4">
        <Field label="Title" htmlFor="doc-title"><Input id="doc-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
        <Field label="Type" htmlFor="doc-cat">
          <Select id="doc-cat" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
            {Object.entries(DOCUMENT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        {ownerType !== 'TEACHER' && <Checkbox checked={shared} onChange={(e) => setShared(e.target.checked)} label={shareLabel} description="Off by default — staff only." />}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button onClick={() => void save()} loading={busy} disabled={!title.trim()}>{isNew ? 'Upload' : 'Save'}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
