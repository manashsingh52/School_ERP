'use client';

import { Button, Card, EmptyState, Field, Select, Skeleton, TD, TH, THead, TR, Table } from '@schoolos/ui';
import { Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { apiDelete, apiPost } from '@/lib/api-client';
import { sectionLabel, useAssignments, useClasses, useClassSubjects, useSubjects, useTeacherOptions } from '@/lib/academics';
import { fullName } from '@/lib/format';
import { useAction } from '@/lib/hooks';

/** Who teaches which subject in which section — drives each teacher's view (docs/04 ASSIGNED scope). */
export function AssignmentsTab({ canManage }: { canManage: boolean }) {
  const classes = useClasses();
  const sections = (classes.data ?? []).flatMap((c) => c.sections.map((s) => ({ ...s, label: sectionLabel(c.name, s.name) })));
  const [sectionId, setSectionId] = useState('');
  const section = sections.find((s) => s.id === sectionId) ?? sections[0];
  const assignments = useAssignments(section ? `sectionId=${section.id}` : 'sectionId=none');
  const subjects = useSubjects();
  const classSubjects = useClassSubjects();
  const teachers = useTeacherOptions(canManage);
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');

  const forClass = new Set((classSubjects.data ?? []).filter((cs) => cs.classId === section?.classId).map((cs) => cs.subjectId));
  const subjectOptions = (subjects.data ?? []).filter((s) => s.isActive).sort((a, b) => Number(forClass.has(b.id)) - Number(forClass.has(a.id)));

  const add = useAction(() => apiPost('/teaching-assignments', { sectionId: section!.id, subjectId, teacherId }), {
    success: 'Teacher assigned',
    invalidate: [['assignments']],
    onSuccess: () => {
      setSubjectId('');
      setTeacherId('');
    },
  });
  const remove = useAction((id: string) => apiDelete(`/teaching-assignments/${id}`), { success: 'Assignment removed', invalidate: [['assignments']] });

  if (classes.isPending) return <Skeleton className="h-40" />;
  if (!sections.length) {
    return <Card><EmptyState icon={<Users />} title="No sections yet" description="Add classes and sections first, then assign teachers to them." /></Card>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Section" htmlFor="as-section" className="w-48">
          <Select id="as-section" value={section?.id} onChange={(e) => setSectionId(e.target.value)}>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        {section?.classTeacher && <p className="pb-2 text-small text-fg-secondary">Class teacher: <span className="font-medium text-fg">{section.classTeacher.name}</span></p>}
      </div>

      <Card className="overflow-hidden">
        {assignments.isPending ? (
          <Skeleton className="m-5 h-24" />
        ) : !assignments.data?.length ? (
          <EmptyState icon={<Users />} title={`No teachers assigned to ${section?.label}`} description="Assign a teacher for each subject. Teachers see only the sections they teach." />
        ) : (
          <Table>
            <THead><tr><TH>Subject</TH><TH>Teacher</TH><TH className="w-16" /></tr></THead>
            <tbody>
              {assignments.data.map((a) => (
                <TR key={a.id}>
                  <TD className="font-medium">{a.subject.name}</TD>
                  <TD>{a.teacher.name}</TD>
                  <TD className="text-right">
                    {canManage && (
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${a.teacher.name} from ${a.subject.name}`} onClick={() => remove.mutate(a.id)}>
                        <Trash2 />
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
        {canManage && (
          <div className="flex flex-wrap items-end gap-3 border-t border-border p-4">
            <Field label="Subject" htmlFor="as-subject" className="min-w-48 flex-1">
              <Select id="as-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">Choose a subject</option>
                {subjectOptions.map((s) => <option key={s.id} value={s.id}>{s.name}{forClass.size && !forClass.has(s.id) ? ' (not in this class)' : ''}</option>)}
              </Select>
            </Field>
            <Field label="Teacher" htmlFor="as-teacher" className="min-w-48 flex-1">
              <Select id="as-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Choose a teacher</option>
                {teachers.data?.map((t) => <option key={t.id} value={t.id}>{fullName(t.firstName, t.lastName)}{t.department ? ` · ${t.department}` : ''}</option>)}
              </Select>
            </Field>
            <Button disabled={!subjectId || !teacherId} loading={add.isPending} onClick={() => add.mutate(undefined)}><Plus /> Assign</Button>
          </div>
        )}
      </Card>
      <p className="text-small text-fg-tertiary">Changes apply immediately: a teacher sees a section&apos;s students as soon as they&apos;re assigned.</p>
    </div>
  );
}
