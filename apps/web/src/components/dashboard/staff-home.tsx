'use client';

import type { AttentionItem, DashboardData } from '@schoolos/contracts';
import { Button, Card, CardHeader, EmptyState, Kbd, Skeleton, cn } from '@schoolos/ui';
import { AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, Info, Megaphone, NotebookPen, Search, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useData } from '@/lib/hooks';
import { formatNumber, formatPercent } from '@/lib/format';
import { useMe } from '@/lib/me';
import { TodayClasses } from './today-classes';

const TONE: Record<AttentionItem['tone'], { icon: typeof Info; cls: string }> = {
  danger: { icon: AlertTriangle, cls: 'text-danger bg-danger-bg' },
  warning: { icon: AlertTriangle, cls: 'text-warning bg-warning-bg' },
  info: { icon: Info, cls: 'text-info bg-info-bg' },
};

function Kpi({ label, value, hint, href }: { label: string; value: string; hint?: string; href: string }) {
  return (
    <Link href={href} className="group rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between text-small text-fg-secondary">
        {label}
        <ArrowRight className="size-4 text-fg-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="tabular mt-1 text-kpi font-semibold">{value}</div>
      {hint && <div className="mt-1 text-caption text-fg-tertiary">{hint}</div>}
    </Link>
  );
}

export function StaffHome() {
  const { can } = useMe();
  const dash = useData<DashboardData>(['dashboard'], '/dashboard', { staleTime: 30_000 });
  const d = dash.data;
  const k = d?.kpis;

  return (
    <>
      {d && d.myRegisters.length > 0 && (
        <div className="flex flex-col gap-2">
          {d.myRegisters.map((r) => (
            <Card key={r.sectionId} className="flex flex-wrap items-center justify-between gap-3 border-accent/30 bg-accent-tint p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-surface text-accent-strong shadow-e1"><CalendarCheck className="size-4" /></span>
                <div>
                  <div className="font-medium">Take attendance for {r.label}</div>
                  <div className="text-small text-fg-secondary">{r.status === 'DRAFT' ? 'Draft saved — not submitted yet' : 'Not taken yet today'}</div>
                </div>
              </div>
              <Button asChild><Link href={`/attendance/${r.sectionId}`}>Open register <ArrowRight /></Link></Button>
            </Card>
          ))}
        </div>
      )}

      {(k?.students !== null || k?.registers) && (
        <section aria-label="Key numbers" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {!d ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[118px]" />)
          ) : (
            <>
              {k!.students !== null && <Kpi label="Students" value={formatNumber(k!.students)} hint="Active this year" href="/students" />}
              {k!.registers && (
                <Kpi
                  label="Present today"
                  value={d.isWeeklyOff ? '—' : formatPercent(k!.presentPercent)}
                  hint={d.isWeeklyOff ? 'Weekly off' : `${k!.registers.taken} of ${k!.registers.total} registers in`}
                  href="/attendance"
                />
              )}
              {k!.absentToday !== null && <Kpi label="Absent today" value={formatNumber(k!.absentToday)} hint="Parents notified" href="/attendance" />}
              {k!.teachers !== null && <Kpi label="Teachers" value={formatNumber(k!.teachers)} hint="On staff" href="/teachers" />}
            </>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {d?.today && <TodayClasses today={d.today} />}
          <Card>
            <CardHeader title="Attention required" description="Things that need someone today" />
            {!d ? (
              <div className="p-5"><Skeleton className="h-24" /></div>
            ) : !d.attention.length ? (
              <EmptyState icon={<CheckCircle2 />} title="Nothing needs your attention" description="Pending registers, low attendance and scheduled notices show up here." />
            ) : (
              <ul className="mt-3 border-t border-border">
                {d.attention.map((a) => {
                  const T = TONE[a.tone];
                  return (
                    <li key={a.key}>
                      <Link href={a.href} className="flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0 hover:bg-hover">
                        <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', T.cls)}><T.icon className="size-3.5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-body font-medium">{a.title}</span>
                          {a.detail && <span className="block truncate text-small text-fg-secondary">{a.detail}</span>}
                        </span>
                        <ArrowRight className="mt-1 size-4 shrink-0 text-fg-tertiary" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Quick actions" />
          <div className="flex flex-col gap-1 p-3">
            {can('attendance.mark') && <Button asChild variant="ghost" className="justify-start"><Link href="/attendance"><CalendarCheck /> Take attendance</Link></Button>}
            {can('homework.manage') && <Button asChild variant="ghost" className="justify-start"><Link href="/homework"><NotebookPen /> Set homework</Link></Button>}
            {can('notice.create') && <Button asChild variant="ghost" className="justify-start"><Link href="/notices"><Megaphone /> Send a notice</Link></Button>}
            {can('student.create') && <Button asChild variant="ghost" className="justify-start"><Link href="/students/new"><UserPlus /> Add student</Link></Button>}
            <Button variant="ghost" className="justify-start" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}>
              <Search /> Search anything <Kbd className="ml-auto">⌘K</Kbd>
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
