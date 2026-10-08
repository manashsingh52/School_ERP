'use client';

import { BOARDS, ONBOARDING_STEPS, type OnboardingState, type SchoolProfile } from '@schoolos/contracts';
import { Button, Card, Checkbox, EmptyState, Field, Input, Select, Skeleton, Stepper, cn, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BellRing, CheckCircle2, Circle, IndianRupee, PartyPopper, Plus, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError, apiFetch, apiPatch, apiPost, apiPut } from '@/lib/api-client';
import { keys, useClasses, useSubjects, useYears } from '@/lib/academics';
import { useData, useSchool } from '@/lib/hooks';

const CLASS_PRESETS = ['Nursery', 'LKG', 'UKG', ...Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`)];
const SUBJECT_PRESETS = [
  ['English', 'ENG'], ['Hindi', 'HIN'], ['Mathematics', 'MATH'], ['Science', 'SCI'], ['Social Science', 'SST'],
  ['Environmental Studies', 'EVS'], ['Computer Science', 'COMP'], ['Sanskrit', 'SKT'], ['Physical Education', 'PE'], ['Art & Craft', 'ART'],
] as const;

/** Guided setup (Master Prompt §22, docs/08 W9). Every step saves as you go; you can come back any time. */
export default function OnboardingPage() {
  const state = useData<OnboardingState>(['onboarding'], '/onboarding');
  const school = useSchool();
  const qc = useQueryClient();
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    if (state.data && step === null) setStep(Math.min(state.data.step, 10) - 1);
  }, [state.data, step]);

  if (!state.data || !school.data || step === null) return <Skeleton className="h-96" />;
  const go = (next: number) => {
    setStep(next);
    void apiPut('/onboarding/step', { step: next + 1 }).then(() => qc.invalidateQueries({ queryKey: ['onboarding'] }));
  };
  const next = () => go(Math.min(step + 1, 9));
  const done = (key: string) => state.data!.checklist.find((c) => c.key === key)?.done;

  const steps: Record<number, ReactNode> = {
    0: <SchoolStep school={school.data} onDone={next} />,
    1: <YearStep onDone={next} />,
    2: <ClassesStep onDone={next} />,
    3: <SectionsStep onDone={next} />,
    4: <SubjectsStep onDone={next} />,
    5: <PeopleStep entity="TEACHERS" count={state.data.checklist.find((c) => c.key === 'teachers')?.detail} done={!!done('teachers')} onDone={next} />,
    6: <PeopleStep entity="STUDENTS" count={state.data.checklist.find((c) => c.key === 'students')?.detail} done={!!done('students')} onDone={next} />,
    7: <LaterStep icon={<IndianRupee />} title="Fee structure" text="Fee heads, installments, concessions and online payments arrive with the Fees module. You can set them up then." onDone={next} />,
    8: <LaterStep icon={<BellRing />} title="Notifications" text="Absence alerts, homework and notices to parents arrive with the Notifications module. Defaults will be sensible; you can tune them later." onDone={next} />,
    9: <GoLiveStep state={state.data} />,
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-h1 font-semibold tracking-[-0.01em]">Set up {school.data.name}</h1>
        <p className="mt-1 text-body text-fg-secondary">Step {step + 1} of 10 · progress is saved automatically.</p>
      </div>
      <Stepper steps={ONBOARDING_STEPS.map((s) => s.label)} current={step} onSelect={go} />
      <Card className="p-6">{steps[step]}</Card>
      {step > 0 && step < 9 && (
        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => go(step - 1)}><ArrowLeft /> Back</Button>
          <Button variant="ghost" onClick={next}>Skip for now <ArrowRight /></Button>
        </div>
      )}
    </div>
  );
}

function StepHeader({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-h2 font-semibold">{title}</h2>
      <p className="text-body text-fg-secondary">{text}</p>
    </div>
  );
}

function useStepAction(fn: () => Promise<unknown>, onDone: () => void, invalidate: readonly (readonly unknown[])[] = []) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async () => {
      setBusy(true);
      try {
        await fn();
        await Promise.all([...invalidate, ['onboarding'], ['school']].map((k) => qc.invalidateQueries({ queryKey: k as unknown[] })));
        onDone();
      } catch (err) {
        toast.error(err instanceof ApiError ? (err.details?.[0]?.message ?? err.message) : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
    },
  };
}

function SchoolStep({ school, onDone }: { school: SchoolProfile; onDone: () => void }) {
  const [form, setForm] = useState({ name: school.name, phone: school.phone ?? '', email: school.email ?? '', city: school.address.city ?? '', state: school.address.state ?? '', board: school.board ?? '' });
  const action = useStepAction(
    () => apiPatch('/school', Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))),
    onDone,
  );
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <>
      <StepHeader title="School information" text="How parents and staff will see your school. You can add more in Settings later." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="School name" htmlFor="ob-name" className="sm:col-span-2"><Input id="ob-name" value={form.name} onChange={set('name')} /></Field>
        <Field label="Office phone" htmlFor="ob-phone"><Input id="ob-phone" type="tel" value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Email" htmlFor="ob-email"><Input id="ob-email" type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="City" htmlFor="ob-city"><Input id="ob-city" value={form.city} onChange={set('city')} /></Field>
        <Field label="State" htmlFor="ob-state"><Input id="ob-state" value={form.state} onChange={set('state')} /></Field>
        <Field label="Board" htmlFor="ob-board">
          <Select id="ob-board" value={form.board} onChange={set('board')}>
            <option value="">Not specified</option>
            {BOARDS.map((b) => <option key={b} value={b}>{b === 'STATE' ? 'State board' : b}</option>)}
          </Select>
        </Field>
      </div>
      <div className="mt-6 flex justify-end"><Button loading={action.busy} onClick={() => void action.run()}>Save and continue</Button></div>
    </>
  );
}

function YearStep({ onDone }: { onDone: () => void }) {
  const years = useYears();
  const current = years.data?.find((y) => y.isCurrent);
  const y = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const [form, setForm] = useState({ name: `${y}–${String((y + 1) % 100).padStart(2, '0')}`, startDate: `${y}-04-01`, endDate: `${y + 1}-03-31` });
  const action = useStepAction(() => apiPost('/academic-years', { ...form, makeCurrent: true }), onDone, [keys.years]);
  if (!years.data) return <Skeleton className="h-32" />;
  return (
    <>
      <StepHeader title="Academic year" text="Sections, attendance and fees all belong to an academic year." />
      {current ? (
        <div className="flex items-center gap-3 rounded-lg border border-success-border bg-success-bg p-4 text-success">
          <CheckCircle2 className="size-5" /> <span><span className="font-medium">{current.name}</span> is your current academic year.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Name" htmlFor="ob-y-name"><Input id="ob-y-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Starts" htmlFor="ob-y-start"><Input id="ob-y-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
          <Field label="Ends" htmlFor="ob-y-end"><Input id="ob-y-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
        </div>
      )}
      <div className="mt-6 flex justify-end">
        {current ? <Button onClick={onDone}>Continue</Button> : <Button loading={action.busy} onClick={() => void action.run()}>Create and continue</Button>}
      </div>
    </>
  );
}

function ClassesStep({ onDone }: { onDone: () => void }) {
  const classes = useClasses();
  const have = new Set((classes.data ?? []).map((c) => c.name.toLowerCase()));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const names = [...picked].filter((n) => !have.has(n.toLowerCase()));
  const action = useStepAction(() => (names.length ? apiPost('/classes/bulk', { names }) : Promise.resolve()), onDone, [['classes']]);
  const toggle = (n: string) => setPicked((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  return (
    <>
      <StepHeader title="Classes" text="Which classes does your school have? Classes stay the same every year." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setPicked(new Set(CLASS_PRESETS.slice(0, 13)))}>Nursery – Class 10</Button>
        <Button size="sm" variant="secondary" onClick={() => setPicked(new Set(CLASS_PRESETS))}>Nursery – Class 12</Button>
        <Button size="sm" variant="secondary" onClick={() => setPicked(new Set(CLASS_PRESETS.slice(3, 13)))}>Class 1 – 10</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {CLASS_PRESETS.map((n) => {
          const exists = have.has(n.toLowerCase());
          return (
            <button
              key={n}
              type="button"
              disabled={exists}
              onClick={() => toggle(n)}
              className={cn('rounded-full border px-3 py-1 text-small', exists ? 'border-success-border bg-success-bg text-success' : picked.has(n) ? 'border-accent bg-accent-tint font-medium' : 'border-border-strong hover:bg-hover')}
            >
              {n}{exists && ' ✓'}
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex justify-end">
        <Button disabled={!names.length && !have.size} loading={action.busy} onClick={() => void action.run()}>
          {names.length ? `Add ${names.length} classes and continue` : 'Continue'}
        </Button>
      </div>
    </>
  );
}

function SectionsStep({ onDone }: { onDone: () => void }) {
  const classes = useClasses();
  const school = useSchool();
  const [names, setNames] = useState('A, B');
  const withoutSections = (classes.data ?? []).filter((c) => !c.sections.length);
  const sectionNames = names.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  const action = useStepAction(
    () => (withoutSections.length ? apiPost('/sections/bulk', { academicYearId: school.data!.currentAcademicYear!.id, classIds: withoutSections.map((c) => c.id), names: sectionNames }) : Promise.resolve()),
    onDone,
    [['classes']],
  );
  if (!school.data?.currentAcademicYear) return <EmptyState title="Create the academic year first" description="Go back one step." />;
  return (
    <>
      <StepHeader title="Sections" text={`Sections for ${school.data.currentAcademicYear.name}. Most schools use the same names for every class; adjust individual classes later in Academics.`} />
      <Field label="Section names" htmlFor="ob-sections" hint="Separate with commas" className="max-w-xs"><Input id="ob-sections" value={names} onChange={(e) => setNames(e.target.value)} /></Field>
      <p className="mt-4 text-small text-fg-secondary">
        {withoutSections.length
          ? `Will add ${sectionNames.join(', ')} to ${withoutSections.length} classes (${withoutSections.map((c) => c.name).join(', ')}).`
          : 'Every class already has sections.'}
      </p>
      <div className="mt-6 flex justify-end">
        <Button disabled={!sectionNames.length} loading={action.busy} onClick={() => void action.run()}>{withoutSections.length ? 'Add sections and continue' : 'Continue'}</Button>
      </div>
    </>
  );
}

function SubjectsStep({ onDone }: { onDone: () => void }) {
  const subjects = useSubjects();
  const classes = useClasses();
  const school = useSchool();
  const have = new Set((subjects.data ?? []).map((s) => s.code));
  const [picked, setPicked] = useState<Set<string>>(new Set(['ENG', 'HIN', 'MATH', 'SCI', 'SST']));
  const [applyAll, setApplyAll] = useState(true);
  const action = useStepAction(async () => {
    const rows = SUBJECT_PRESETS.filter(([, code]) => picked.has(code) && !have.has(code)).map(([name, code]) => ({ name, code }));
    if (rows.length) await apiPost('/subjects/bulk', { subjects: rows });
    if (applyAll && school.data?.currentAcademicYear && classes.data?.length) {
      const all = await apiFetch<{ data: { id: string; code: string }[] }>('/subjects');
      await apiPut('/class-subjects', {
        academicYearId: school.data.currentAcademicYear.id,
        classIds: classes.data.map((c) => c.id),
        subjectIds: all.data.filter((s) => picked.has(s.code)).map((s) => s.id),
      });
    }
  }, onDone, [keys.subjects, ['class-subjects']]);
  return (
    <>
      <StepHeader title="Subjects" text="Pick what your school teaches. Fine-tune by class later in Academics → Subjects." />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SUBJECT_PRESETS.map(([name, code]) => (
          <Checkbox key={code} label={name} checked={picked.has(code) || have.has(code)} disabled={have.has(code)} onChange={(e) => setPicked((s) => { const x = new Set(s); if (e.target.checked) x.add(code); else x.delete(code); return x; })} />
        ))}
      </div>
      <Checkbox className="mt-5" label="Teach these subjects in every class" description="Uncheck to assign per class later." checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
      <div className="mt-6 flex justify-end"><Button loading={action.busy} onClick={() => void action.run()}>Save and continue</Button></div>
    </>
  );
}

function PeopleStep({ entity, count, done, onDone }: { entity: 'TEACHERS' | 'STUDENTS'; count?: string; done: boolean; onDone: () => void }) {
  const router = useRouter();
  const teachers = entity === 'TEACHERS';
  return (
    <>
      <StepHeader
        title={teachers ? 'Teachers' : 'Students'}
        text={teachers ? 'Add your teaching staff. Each gets a sign-in on their mobile.' : 'Add students with their class and parents. Parents get the parent app.'}
      />
      <div className="mb-5 flex items-center gap-2 text-body">
        {done ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5 text-fg-tertiary" />}
        <span>{count ?? '—'} so far</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => router.push(`/imports/new?entity=${entity}`)} className="flex flex-col items-start gap-2 rounded-lg border border-accent bg-accent-tint p-4 text-left">
          <Upload className="size-5 text-accent-strong" />
          <span className="font-medium">Import from Excel</span>
          <span className="text-small text-fg-secondary">Recommended — upload your existing sheet, we match the columns.</span>
        </button>
        <Link href={teachers ? '/teachers/new' : '/students/new'} className="flex flex-col items-start gap-2 rounded-lg border border-border p-4 hover:border-border-strong">
          <Plus className="size-5 text-fg-secondary" />
          <span className="font-medium">Add one by one</span>
          <span className="text-small text-fg-secondary">Good for a few people. Come back here when done.</span>
        </Link>
      </div>
      <div className="mt-6 flex justify-end"><Button onClick={onDone}>Continue</Button></div>
    </>
  );
}

function LaterStep({ icon, title, text, onDone }: { icon: ReactNode; title: string; text: string; onDone: () => void }) {
  return (
    <>
      <EmptyState icon={icon} title={`${title} — coming soon`} description={text} />
      <div className="flex justify-end"><Button onClick={onDone}>Continue</Button></div>
    </>
  );
}

function GoLiveStep({ state }: { state: OnboardingState }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const live = state.status === 'ACTIVE';
  async function goLive() {
    setBusy(true);
    try {
      await apiPost('/onboarding/go-live');
      await qc.invalidateQueries({ queryKey: ['onboarding'] });
      await qc.invalidateQueries({ queryKey: ['school'] });
      toast.success('Your school is live!');
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <StepHeader title={live ? 'Your school is live' : 'Go live'} text="Required items must be done. Recommended ones can follow later." />
      <ul className="flex flex-col gap-2">
        {state.checklist.map((c) => (
          <li key={c.key} className="flex items-center gap-3 rounded-md border border-border px-4 py-2.5">
            {c.done ? <CheckCircle2 className="size-5 text-success" /> : <Circle className={cn('size-5', c.required ? 'text-danger' : 'text-fg-tertiary')} />}
            <span className="flex-1 font-medium">{c.label}{!c.required && <span className="ml-2 text-small font-normal text-fg-tertiary">recommended</span>}</span>
            <span className="text-small text-fg-secondary">{c.detail}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex justify-end">
        {live ? (
          <Button asChild><Link href="/dashboard"><PartyPopper /> Go to dashboard</Link></Button>
        ) : (
          <Button disabled={!state.canGoLive} loading={busy} onClick={() => void goLive()}><PartyPopper /> Go live</Button>
        )}
      </div>
    </>
  );
}
