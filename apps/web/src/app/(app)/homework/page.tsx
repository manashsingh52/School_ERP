'use client';

import type { HomeworkItem, HomeworkStatus, HomeworkTargets, PageResponse } from '@schoolos/contracts';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  EmptyState,
  ErrorState,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Tabs,
  toast,
} from '@schoolos/ui';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, ClipboardCheck, MoreHorizontal, NotebookPen, Paperclip, Pencil, Plus, Search, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Gate } from '@/components/gate';
import { AttachmentLinks, dueBadge } from '@/components/homework/homework-bits';
import { HOMEWORK_DRAFT_KEY, HomeworkForm, type HomeworkDraft } from '@/components/homework/homework-form';
import { SubmissionsDialog } from '@/components/homework/submissions-panel';
import { ApiError, apiDelete, apiFetch, apiPost } from '@/lib/api-client';
import { useData, useTabParam } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { useMe } from '@/lib/me';

type Tab = Exclude<HomeworkStatus, 'ARCHIVED'>;
const PAGE = 20;

function HomeworkCard({ hw, onOpen, onEdit, onSubmissions }: { hw: HomeworkItem; onOpen: () => void; onEdit: () => void; onSubmissions: () => void }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['homework'] });
  async function publishNow() {
    try {
      await apiPost(`/homework/${hw.id}/publish`, {});
      toast.success('Published · parents will be told');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t publish it.');
    }
  }
  async function remove() {
    const published = hw.status === 'PUBLISHED';
    if (!window.confirm(published ? 'Delete this homework? Parents will no longer see it.' : 'Delete this homework?')) return;
    try {
      await apiDelete(`/homework/${hw.id}`);
      toast.success('Homework deleted');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t delete it.');
    }
  }

  return (
    <Card className="flex gap-4 p-4 transition-colors hover:border-border-strong">
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{hw.subject.name}</Badge>
          <span className="text-small text-fg-secondary">{hw.sections.map((s) => s.label).join(', ')}</span>
          {dueBadge(hw.dueDate)}
          {hw.status === 'SCHEDULED' && hw.publishAt && (
            <Badge tone="neutral"><CalendarClock className="size-3" /> {new Date(hw.publishAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Badge>
          )}
        </div>
        <div className="mt-1.5 text-body font-semibold">{hw.title}</div>
        {hw.description && <p className="mt-0.5 line-clamp-2 text-small text-fg-secondary">{hw.description}</p>}
        <div className="mt-2 flex items-center gap-3 text-caption text-fg-tertiary">
          <span>{hw.teacher.name}</span>
          <span>{hw.publishedAt ? formatDate(hw.publishedAt) : formatDate(hw.createdAt)}</span>
          {hw.attachments.length > 0 && (
            <span className="inline-flex items-center gap-1"><Paperclip className="size-3" /> {hw.attachments.length}</span>
          )}
        </div>
      </button>
      {hw.canEdit && (
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${hw.title}`}><MoreHorizontal /></Button>
          </MenuTrigger>
          <MenuContent align="end">
            {hw.status === 'PUBLISHED' && <MenuItem onSelect={onSubmissions}><ClipboardCheck /> Who handed it in</MenuItem>}
            <MenuItem onSelect={onEdit}><Pencil /> Edit</MenuItem>
            {hw.status !== 'PUBLISHED' && <MenuItem onSelect={() => void publishNow()}><Send /> Publish now</MenuItem>}
            <MenuItem destructive onSelect={() => void remove()}><Trash2 /> Delete</MenuItem>
          </MenuContent>
        </Menu>
      )}
    </Card>
  );
}

function HomeworkPageContent() {
  const { can } = useMe();
  const canManage = can('homework.manage');
  const [tab, setTab] = useTabParam<Tab>(['PUBLISHED', 'SCHEDULED', 'DRAFT']);
  const [sectionId, setSectionId] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<HomeworkDraft | undefined>();
  // Arriving from "Use as homework" (Assistant): open the form with the draft, once.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(HOMEWORK_DRAFT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(HOMEWORK_DRAFT_KEY);
      setDraft(JSON.parse(raw) as HomeworkDraft);
      setCreating(true);
    } catch {
      // storage unavailable — nothing to pre-fill
    }
  }, []);
  const [editing, setEditing] = useState<HomeworkItem | null>(null);
  const [viewing, setViewing] = useState<HomeworkItem | null>(null);
  const [reviewing, setReviewing] = useState<HomeworkItem | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const targets = useData<HomeworkTargets>(['homework', 'targets'], canManage ? '/homework/targets' : null, { staleTime: 60_000 });
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE), status: tab });
  if (sectionId) params.set('sectionId', sectionId);
  if (q) params.set('q', q);
  const query = useQuery({
    queryKey: ['homework', 'list', params.toString()],
    queryFn: () => apiFetch<PageResponse<HomeworkItem>>(`/homework?${params}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Homework"
        description="Set work for your classes. Parents are told as soon as it's published."
        actions={canManage && <Button onClick={() => setCreating(true)}><Plus /> Set homework</Button>}
      />
      <Tabs<Tab>
        value={tab}
        onChange={(v) => { setTab(v); setPage(1); }}
        items={[
          { value: 'PUBLISHED', label: 'Published' },
          ...(canManage ? [{ value: 'SCHEDULED' as const, label: 'Scheduled' }, { value: 'DRAFT' as const, label: 'Drafts' }] : []),
        ]}
      />
      <div className="flex flex-wrap gap-3">
        <div className="w-full max-w-xs">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search homework" leading={<Search />} aria-label="Search homework" />
        </div>
        {!!targets.data?.sections.length && (
          <Select value={sectionId} onChange={(e) => { setSectionId(e.target.value); setPage(1); }} className="w-40" aria-label="Section">
            <option value="">All sections</option>
            {targets.data.sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        )}
      </div>

      {query.isError ? (
        <Card><ErrorState message={query.error instanceof ApiError ? query.error.message : undefined} onRetry={() => void query.refetch()} /></Card>
      ) : !query.data ? (
        <div className="flex flex-col gap-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : !query.data.data.length ? (
        <Card>
          <EmptyState
            icon={<NotebookPen />}
            title={q ? `Nothing matches “${q}”` : tab === 'PUBLISHED' ? 'No homework yet' : tab === 'DRAFT' ? 'No drafts' : 'Nothing scheduled'}
            description={canManage && tab === 'PUBLISHED' && !q ? 'Set homework for a class — parents see it straight away.' : undefined}
            action={canManage && tab === 'PUBLISHED' && !q ? <Button onClick={() => setCreating(true)}><Plus /> Set homework</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {query.data.data.map((hw) => (
            <HomeworkCard key={hw.id} hw={hw} onOpen={() => setViewing(hw)} onEdit={() => setEditing(hw)} onSubmissions={() => setReviewing(hw)} />
          ))}
          {query.data.page.total > PAGE && <Pagination page={page} pageSize={PAGE} total={query.data.page.total} onPageChange={setPage} />}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="Set homework" className="max-w-[640px]">
          {creating && <HomeworkForm draft={draft} onDone={() => { setCreating(false); setDraft(undefined); }} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title="Edit homework" className="max-w-[640px]">
          {editing && <HomeworkForm existing={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        {viewing && (
          <DialogContent title={viewing.title} description={`${viewing.subject.name} · ${viewing.sections.map((s) => s.label).join(', ')} · ${viewing.teacher.name}`} className="max-w-[640px]">
            <DialogBody className="flex flex-col gap-4">
              {dueBadge(viewing.dueDate) && <div>{dueBadge(viewing.dueDate)}</div>}
              {viewing.description ? <p className="text-body whitespace-pre-wrap">{viewing.description}</p> : <p className="text-body text-fg-tertiary">No instructions.</p>}
              <AttachmentLinks hw={viewing} />
            </DialogBody>
            {viewing.canEdit && (
              <DialogFooter>
                {viewing.status === 'PUBLISHED' && <Button variant="secondary" onClick={() => { setReviewing(viewing); setViewing(null); }}><ClipboardCheck /> Who handed it in</Button>}
                <Button variant="secondary" onClick={() => { setEditing(viewing); setViewing(null); }}><Pencil /> Edit</Button>
              </DialogFooter>
            )}
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        {reviewing && <SubmissionsDialog hw={reviewing} onDone={() => setReviewing(null)} />}
      </Dialog>
    </div>
  );
}

export default function HomeworkPage() {
  return (
    <Gate any={['homework.view', 'homework.manage']} scopes={['ALL', 'ASSIGNED']}>
      <HomeworkPageContent />
    </Gate>
  );
}
