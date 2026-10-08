'use client';

import { Badge, Button, Card, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, EmptyState, Field, Input, Skeleton, TD, TH, THead, TR, Table } from '@schoolos/ui';
import { CalendarRange, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError, apiPost } from '@/lib/api-client';
import { keys, useYears } from '@/lib/academics';
import { formatDate, formatNumber } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { useMe } from '@/lib/me';

/** Suggest the next year after the latest one (Indian session: April → March). */
function suggestion(latestEnd?: string) {
  const start = latestEnd ? new Date(Date.parse(latestEnd) + 86_400_000) : new Date(Date.UTC(new Date().getUTCFullYear(), 3, 1));
  const y = start.getUTCFullYear();
  return { name: `${y}–${String((y + 1) % 100).padStart(2, '0')}`, startDate: `${y}-04-01`, endDate: `${y + 1}-03-31` };
}

export function YearsTab({ canManage }: { canManage: boolean }) {
  const years = useYears();
  const { can } = useMe();
  const [open, setOpen] = useState(false);
  const activate = useAction((id: string) => apiPost(`/academic-years/${id}/activate`), {
    success: 'Current year changed',
    invalidate: [keys.years, ['classes'], ['school'], ['students']],
  });
  const close = useAction((id: string) => apiPost(`/academic-years/${id}/close`), { success: 'Year closed', invalidate: [keys.years] });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-fg-secondary">The current year is what every screen shows. Past years stay as history.</p>
        <div className="flex gap-2">
          {can('student.promote') && (years.data?.length ?? 0) > 1 && (
            <Button variant="secondary" asChild><Link href="/students/promotion">Promote students</Link></Button>
          )}
          {canManage && <Button onClick={() => setOpen(true)}><Plus /> New academic year</Button>}
        </div>
      </div>
      <Card className="overflow-hidden">
        {years.isPending ? (
          <Skeleton className="m-5 h-24" />
        ) : !years.data?.length ? (
          <EmptyState icon={<CalendarRange />} title="No academic year yet" description="Create the current academic year to start adding sections and students." action={canManage && <Button onClick={() => setOpen(true)}><Plus /> New academic year</Button>} />
        ) : (
          <Table>
            <THead><tr><TH>Year</TH><TH>Dates</TH><TH className="text-right">Sections</TH><TH className="text-right">Students</TH><TH>Status</TH><TH /></tr></THead>
            <tbody>
              {years.data.map((y) => (
                <TR key={y.id}>
                  <TD className="font-medium">{y.name}</TD>
                  <TD className="text-fg-secondary">{formatDate(y.startDate)} – {formatDate(y.endDate)}</TD>
                  <TD className="tabular text-right">{y.sectionCount}</TD>
                  <TD className="tabular text-right">{formatNumber(y.studentCount)}</TD>
                  <TD>
                    {y.isCurrent ? <Badge tone="accent" dot>Current</Badge> : <Badge tone={y.status === 'CLOSED' ? 'neutral' : 'info'}>{y.status === 'CLOSED' ? 'Closed' : y.status === 'PLANNED' ? 'Planned' : 'Active'}</Badge>}
                  </TD>
                  <TD className="text-right whitespace-nowrap">
                    {canManage && !y.isCurrent && y.status !== 'CLOSED' && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => activate.mutate(y.id)}>Make current</Button>
                        <Button size="sm" variant="ghost" onClick={() => close.mutate(y.id)}>Close</Button>
                      </>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {open && <NewYearDialog onClose={() => setOpen(false)} suggested={suggestion(years.data?.[0]?.endDate)} firstYear={!years.data?.length} />}
    </div>
  );
}

function NewYearDialog({ onClose, suggested, firstYear }: { onClose: () => void; suggested: ReturnType<typeof suggestion>; firstYear: boolean }) {
  const [form, setForm] = useState({ ...suggested, makeCurrent: firstYear });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(() => apiPost('/academic-years', form), {
    success: `${form.name} created`,
    invalidate: [keys.years, ['school'], ['classes']],
    onSuccess: onClose,
    quietErrors: true,
  });
  const submit = () =>
    save.mutate(undefined, {
      onError: (e) => {
        if (e instanceof ApiError) setErrors(Object.fromEntries((e.details ?? []).filter((d) => d.field).map((d) => [d.field!, d.message])));
      },
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="New academic year">
        <DialogBody className="grid grid-cols-2 gap-4">
          <Field label="Name" htmlFor="y-name" className="col-span-2" error={errors.name}>
            <Input id="y-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Starts" htmlFor="y-start" error={errors.startDate}>
            <Input id="y-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
          <Field label="Ends" htmlFor="y-end" error={errors.endDate}>
            <Input id="y-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </Field>
          <Checkbox
            className="col-span-2"
            label="Make this the current year"
            description="Every screen switches to it. Do this when the new session starts."
            checked={form.makeCurrent}
            disabled={firstYear}
            onChange={(e) => setForm({ ...form, makeCurrent: e.target.checked })}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={submit}>Create year</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
