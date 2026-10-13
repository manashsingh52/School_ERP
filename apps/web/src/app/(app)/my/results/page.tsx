'use client';

import { PageHeader } from '@schoolos/ui';
import { ForChild } from '@/components/parent/parent-gate';
import { StudentPerformanceView } from '@/components/student/performance-view';
import { StudentResults } from '@/components/student/results-list';

export default function ChildResultsPage() {
  return (
    <ForChild>
      {(child) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={`${child.firstName}'s exams`} description={child.classLabel ? `Class ${child.classLabel}` : undefined} />
          <StudentPerformanceView key={`perf-${child.id}`} studentId={child.id} />
          <h2 className="mt-2 text-h3 font-semibold">Results and report cards</h2>
          <StudentResults key={child.id} studentId={child.id} />
        </div>
      )}
    </ForChild>
  );
}
