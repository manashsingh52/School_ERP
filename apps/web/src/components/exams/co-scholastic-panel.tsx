'use client';

import type { CoScholasticSheet, ExamDetail } from '@schoolos/contracts';
import { Button, Card, CardHeader, EmptyState, Select, Skeleton, Table, TD, TH, THead, TR, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Palette } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { sectionLabel, useClasses } from '@/lib/academics';
import { ApiError, apiPut } from '@/lib/api-client';
import { useData } from '@/lib/hooks';
import { useMe } from '@/lib/me';

/** Co-scholastic grades (class teacher): students × areas, on the school's scale. */
export function CoScholasticPanel({ exam }: { exam: ExamDetail }) {
  const { me, can } = useMe();
  const classes = useClasses();
  // The sections of the classes in this exam that the person may grade (class teacher, or everyone for admins).
  const sections = useMemo(() => {
    const examClasses = new Set(exam.subjects.map((s) => s.classId));
    return (classes.data ?? [])
      .filter((c) => examClasses.has(c.id))
      .flatMap((c) => c.sections.filter((s) => can('marks.enter', ['ALL']) || s.classTeacher?.id === me.membership?.teacherId).map((s) => ({ id: s.id, label: sectionLabel(c.name, s.name) })));
  }, [classes.data, exam.subjects, can, me.membership?.teacherId]);
  const [sectionId, setSectionId] = useState('');
  useEffect(() => {
    if (!sectionId && sections[0]) setSectionId(sections[0].id);
  }, [sections, sectionId]);

  if (!classes.data) return <Skeleton className="h-64" />;
  if (!sections.length) return <Card><EmptyState icon={<Palette />} title="Nothing to grade" description="The class teacher of each section grades co-scholastic areas." /></Card>;
  return (
    <div className="flex flex-col gap-3">
      <Select aria-label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="w-48">
        {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </Select>
      {sectionId && <Grid key={sectionId} examId={exam.id} sectionId={sectionId} />}
    </div>
  );
}

function Grid({ examId, sectionId }: { examId: string; sectionId: string }) {
  const qc = useQueryClient();
  const key = ['exams', examId, 'co-scholastic', sectionId];
  const sheet = useData<CoScholasticSheet>(key, `/exams/${examId}/co-scholastic?sectionId=${sectionId}`, { staleTime: 0 });
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const s = sheet.data;
  const cell = (studentId: string, areaId: string) => `${studentId}|${areaId}`;
  const changed = Object.entries(draft).filter(([k, v]) => {
    const [studentId, areaId] = k.split('|');
    return (s?.students.find((x) => x.studentId === studentId)?.grades[areaId!] ?? null) !== v;
  });
  async function save() {
    setSaving(true);
    try {
      const res = await apiPut<{ data: CoScholasticSheet }>(`/exams/${examId}/co-scholastic`, { sectionId, entries: changed.map(([k, grade]) => ({ studentId: k.split('|')[0], subjectId: k.split('|')[1], grade })) });
      qc.setQueryData(key, res.data);
      setDraft({});
      toast.success('Grades saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'We couldn’t save the grades.');
    } finally {
      setSaving(false);
    }
  }
  if (!s) return <Skeleton className="h-64" />;
  if (!s.areas.length) return <Card><EmptyState icon={<Palette />} title="No co-scholastic areas" description="Add subjects of type Co-scholastic in Academics → Subjects (e.g. Art Education, Work Education)." /></Card>;
  return (
    <Card>
      <CardHeader title={`Co-scholastic · ${s.section.label}`} description={s.editable ? `Grades: ${s.grades.join(', ')} (best first)` : (s.lockedReason ?? undefined)} action={s.editable && <Button onClick={() => void save()} loading={saving} disabled={!changed.length}>Save {changed.length ? `(${changed.length})` : ''}</Button>} />
      <div className="mt-3 overflow-x-auto border-t border-border">
        <Table>
          <THead><TR><TH>Student</TH>{s.areas.map((a) => <TH key={a.id}>{a.name}</TH>)}</TR></THead>
          <tbody>
            {s.students.map((st) => (
              <TR key={st.studentId}>
                <TD className="font-medium"><span className="tabular mr-2 text-fg-tertiary">{st.rollNo ?? ''}</span>{st.name}</TD>
                {s.areas.map((a) => {
                  const k = cell(st.studentId, a.id);
                  const value = k in draft ? draft[k] : st.grades[a.id];
                  return (
                    <TD key={a.id}>
                      <Select aria-label={`${a.name} for ${st.name}`} value={value ?? ''} disabled={!s.editable} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value || null }))} className="w-24">
                        <option value="">—</option>
                        {s.grades.map((g) => <option key={g} value={g}>{g}</option>)}
                      </Select>
                    </TD>
                  );
                })}
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}
