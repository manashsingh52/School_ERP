'use client';

import type { ExamDetail, MarksProgressRow } from '@schoolos/contracts';
import { Badge, Button, Card, EmptyState, Skeleton, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Lock, LockOpen, PencilLine } from 'lucide-react';
import Link from 'next/link';
import { ApiError, apiPost } from '@/lib/api-client';
import { useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';

/** Every marks sheet (subject × section) with how far entry has got. */
export function MarksProgress({ exam }: { exam: ExamDetail }) {
  const { can } = useMe();
  const qc = useQueryClient();
  const progress = useData<MarksProgressRow[]>(['exams', exam.id, 'progress'], `/exams/${exam.id}/progress`);

  async function lock(examSubjectId: string, locked: boolean) {
    try {
      await apiPost(`/exams/${exam.id}/subjects/${examSubjectId}/${locked ? 'lock' : 'unlock'}`);
      await qc.invalidateQueries({ queryKey: ['exams', exam.id] });
      toast.success(locked ? 'Marks locked' : 'Marks unlocked');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work.');
    }
  }

  if (!progress.data) return <Skeleton className="h-80" />;
  if (!progress.data.length) {
    return <Card><EmptyState icon={<PencilLine />} title="No marks sheets for you" description={exam.subjects.length ? 'You enter marks for subjects you teach in your sections.' : 'Add subjects to this exam first.'} /></Card>;
  }
  const done = progress.data.filter((r) => r.total && r.entered >= r.total).length;
  const open = exam.status === 'MARKS_ENTRY';

  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-fg-secondary">
        {done} of {progress.data.length} sheets complete{!open && exam.status !== 'RESULTS_PUBLISHED' ? ' · marks entry opens when the exam office starts it' : ''}
      </p>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-small">
          <thead>
            <tr className="border-b border-border text-left text-caption text-fg-tertiary">
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-2 py-2 font-medium">Section</th>
              <th className="px-2 py-2 font-medium">Teacher</th>
              <th className="w-48 px-2 py-2 font-medium">Entered</th>
              <th className="w-44 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {progress.data.map((r) => {
              const pct = r.total ? Math.round((r.entered / r.total) * 100) : 0;
              const complete = r.total > 0 && r.entered >= r.total;
              return (
                <tr key={`${r.examSubjectId}|${r.section.id}`} className="border-b border-border last:border-b-0 hover:bg-hover">
                  <td className="px-4 py-2.5 font-medium">{r.subject.name}</td>
                  <td className="px-2 py-2.5">{r.section.label}</td>
                  <td className="px-2 py-2.5 text-fg-secondary">{r.teacher ?? '—'}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                        <div className={cn('h-full rounded-full', complete ? 'bg-success' : 'bg-accent')} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="tabular w-14 text-right text-caption text-fg-secondary">{r.entered}/{r.total}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {r.locked && <Badge tone="neutral"><Lock className="size-3" /> Locked</Badge>}
                      {can('exam.manage') && !r.locked && complete && open && (
                        <Button variant="ghost" size="sm" onClick={() => void lock(r.examSubjectId, true)}><Lock /> Lock</Button>
                      )}
                      {can('marks.edit_locked') && r.locked && exam.status !== 'RESULTS_PUBLISHED' && (
                        <Button variant="ghost" size="sm" onClick={() => void lock(r.examSubjectId, false)}><LockOpen /> Unlock</Button>
                      )}
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/exams/${exam.id}/marks?examSubjectId=${r.examSubjectId}&sectionId=${r.section.id}`}>
                          {open && !r.locked ? 'Enter' : 'View'} <ArrowRight />
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
