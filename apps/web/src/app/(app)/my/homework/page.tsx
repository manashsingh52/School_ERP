'use client';

import { PageHeader } from '@schoolos/ui';
import { ForChild } from '@/components/parent/parent-gate';
import { StudentHomework } from '@/components/student/homework-list';

export default function ChildHomeworkPage() {
  return (
    <ForChild>
      {(child) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={`${child.firstName}'s homework`} description={child.classLabel ? `Class ${child.classLabel}` : undefined} />
          <StudentHomework key={child.id} studentId={child.id} />
        </div>
      )}
    </ForChild>
  );
}
