'use client';

import { PageHeader } from '@schoolos/ui';
import { ForChild } from '@/components/parent/parent-gate';
import { StudentAttendance } from '@/components/student/attendance-view';

export default function ChildAttendancePage() {
  return (
    <ForChild>
      {(child) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={`${child.firstName}'s attendance`} description={child.classLabel ? `Class ${child.classLabel} · this session` : 'This session'} />
          <StudentAttendance key={child.id} studentId={child.id} />
        </div>
      )}
    </ForChild>
  );
}
