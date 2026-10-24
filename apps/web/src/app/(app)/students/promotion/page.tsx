'use client';

import { Gate } from '@/components/gate';
import type { PromotionPlan, PromotionResult, StudentListItem } from '@schoolos/contracts';
import { Button, Card, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, Field, PageHeader, Select, Skeleton, Stepper, TD, TH, THead, TR, Table, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CalendarRange, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, apiFetch, apiPost, idempotencyKey } from '@/lib/api-client';
import { useYears } from '@/lib/academics';
import { formatNumber, fullName } from '@/lib/format';
import { useData } from '@/lib/hooks';

const GRADUATE = 'graduate';

/**
 * Year-end promotion (docs/02 D4). Last year's records are kept; students get a new enrollment in
 * the next year. Safe to run again — students already moved are skipped.
 */
function PromotionPageContent() {
  const years = useYears();
  const qc = useQueryClient();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [plan, setPlan] = useState<PromotionPlan | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  /** Students who repeat their class, by section. */
  const [kept, setKept] = useState<Record<string, string[]>>({});
  const [keeping, setKeeping] = useState<{ id: string; label: string } | null>(null);
  const [result, setResult] = useState<PromotionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(idempotencyKey);

  useEffect(() => {
    if (!years.data?.length || fromId) return;
    const current = years.data.find((y) => y.isCurrent) ?? years.data[0]!;
    setFromId(current.id);
    const later = years.data.filter((y) => y.startDate > current.startDate && y.status !== 'CLOSED').sort((a, b) => a.startDate.localeCompare(b.startDate));
    if (later[0]) setToId(later[0].id);
  }, [years.data, fromId]);

  async function preview() {
    setBusy(true);
    try {
      const res = await apiPost<{ data: PromotionPlan }>('/promotions/preview', { fromYearId: fromId, toYearId: toId });
      setPlan(res.data);
      setTargets(Object.fromEntries(res.data.rows.map((r) => [r.fromSection.id, r.suggestedToSectionId ?? GRADUATE])));
      setKept({});
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!plan) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ data: PromotionResult }>('/promotions/commit', {
        method: 'POST',
        headers: { 'idempotency-key': key },
        body: JSON.stringify({
          fromYearId: plan.from.id,
          toYearId: plan.to.id,
          moves: plan.rows.filter((r) => r.fromSection.studentCount > 0).map((r) => ({ fromSectionId: r.fromSection.id, toSectionId: targets[r.fromSection.id] === GRADUATE ? null : targets[r.fromSection.id] })),
          detainedStudentIds: Object.values(kept).flat(),
        }),
      });
      setResult(res.data);
      await qc.invalidateQueries();
    } catch (err) {
      setKey(idempotencyKey());
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const later = (years.data ?? []).filter((y) => fromId && y.id !== fromId && y.status !== 'CLOSED');
  const step = result ? 2 : plan ? 1 : 0;
  const total = plan?.rows.reduce((n, r) => n + r.fromSection.studentCount, 0) ?? 0;
  const keptCount = Object.values(kept).flat().length;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link href="/students" className="inline-flex items-center gap-1.5 text-small text-fg-secondary hover:text-fg"><ArrowLeft className="size-4" /> Students</Link>
      <PageHeader title="Promote students" description="Move every class up at the end of the year. Last year's class, roll number and records stay as history." />
      <Stepper steps={['Choose years', 'Check classes', 'Done']} current={step} />

      {years.isPending ? <Skeleton className="h-40" /> : result ? (
        <Card className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-success-bg text-success"><CheckCircle2 className="size-6" /></span>
          <h2 className="text-h2 font-semibold">{formatNumber(result.promoted)} students promoted to {plan?.to.name}</h2>
          <p className="text-body text-fg-secondary">
            {formatNumber(result.graduated)} graduated · {formatNumber(result.detained)} kept in the same class{result.skipped ? ` · ${formatNumber(result.skipped)} were already moved` : ''}
          </p>
          <p className="text-small text-fg-tertiary">When the new session starts, make {plan?.to.name} the current year in Academics → Academic years.</p>
          <Button asChild><Link href="/academics?tab=years">Go to academic years</Link></Button>
        </Card>
      ) : !plan ? (
        later.length === 0 ? (
          <Card>
            <EmptyState icon={<CalendarRange />} title="Create next year first" description="Add the next academic year and its sections, then come back to promote students." action={<Button asChild><Link href="/academics?tab=years">Academic years</Link></Button>} />
          </Card>
        ) : (
          <Card className="flex flex-wrap items-end gap-4 p-5">
            <Field label="From" htmlFor="pr-from" className="w-48">
              <Select id="pr-from" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                {years.data?.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </Select>
            </Field>
            <ArrowRight className="mb-2.5 size-4 text-fg-tertiary" />
            <Field label="To" htmlFor="pr-to" className="w-48">
              <Select id="pr-to" value={toId} onChange={(e) => setToId(e.target.value)}>
                <option value="">Choose</option>
                {later.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </Select>
            </Field>
            <Button className="ml-auto" disabled={!fromId || !toId} loading={busy} onClick={() => void preview()}>Plan promotion</Button>
          </Card>
        )
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead><tr><TH>{plan.from.name}</TH><TH className="text-right">Students</TH><TH className="w-72">Moves to in {plan.to.name}</TH><TH className="w-40">Same class again</TH></tr></THead>
            <tbody>
              {plan.rows.map((r) => (
                <TR key={r.fromSection.id}>
                  <TD className="font-medium">{r.fromSection.label}</TD>
                  <TD className="tabular text-right">
                    {r.fromSection.studentCount}
                    {r.alreadyPromoted > 0 && <span className="ml-2 text-small text-fg-tertiary">({r.alreadyPromoted} done)</span>}
                  </TD>
                  <TD>
                    <Select aria-label={`Destination for ${r.fromSection.label}`} value={targets[r.fromSection.id]} onChange={(e) => setTargets({ ...targets, [r.fromSection.id]: e.target.value })} disabled={!r.fromSection.studentCount}>
                      <option value={GRADUATE}>Graduate (leave the school)</option>
                      {plan.toSections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </Select>
                  </TD>
                  <TD>
                    <Button size="sm" variant="ghost" disabled={!r.fromSection.studentCount} onClick={() => setKeeping({ id: r.fromSection.id, label: r.fromSection.label })}>
                      {kept[r.fromSection.id]?.length ? `${kept[r.fromSection.id]!.length} kept back` : 'Keep back…'}
                    </Button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
            <Button variant="ghost" onClick={() => setPlan(null)}><ArrowLeft /> Back</Button>
            <Button disabled={!total} loading={busy} onClick={() => void commit()}>
              Promote {formatNumber(total - keptCount)} students{keptCount ? ` · keep ${formatNumber(keptCount)} back` : ''}
            </Button>
          </div>
        </Card>
      )}
      {keeping && (
        <KeepBackDialog
          section={keeping}
          selected={kept[keeping.id] ?? []}
          onClose={() => setKeeping(null)}
          onSave={(ids) => {
            setKept({ ...kept, [keeping.id]: ids });
            setKeeping(null);
          }}
        />
      )}
    </div>
  );
}

/** Pick the students of one section who repeat the class next year. */
function KeepBackDialog({ section, selected, onClose, onSave }: { section: { id: string; label: string }; selected: string[]; onClose: () => void; onSave: (ids: string[]) => void }) {
  // Sections hold well under 100 students (the list's page limit).
  const rows = useData<StudentListItem[]>(['students', { sectionId: section.id, pageSize: 100 }], `/students?sectionId=${section.id}&pageSize=100`);
  const [picked, setPicked] = useState(new Set(selected));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Keep back from ${section.label}`} description="These students stay in the same class next year. Everyone else moves up.">
        <DialogBody className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {rows.isPending ? <Skeleton className="h-40" /> : rows.data?.map((s) => (
            <Checkbox
              key={s.id}
              label={`${s.rollNo ? `${s.rollNo}. ` : ''}${fullName(s.firstName, s.lastName)}`}
              description={`Adm. ${s.admissionNo}`}
              checked={picked.has(s.id)}
              onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(s.id); else n.delete(s.id); setPicked(n); }}
            />
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave([...picked])}>{picked.size ? `Keep ${picked.size} back` : 'Keep nobody back'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PromotionPage() {
  return (
    <Gate any={['student.promote']}>
      <PromotionPageContent />
    </Gate>
  );
}
