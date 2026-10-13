'use client';

import { PageHeader } from '@schoolos/ui';
import { ForChild } from '@/components/parent/parent-gate';
import { FeeStatement } from '@/components/student/fee-statement';

export default function ChildFeesPage() {
  return (
    <ForChild>
      {(child) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={`${child.firstName}'s fees`} description={child.classLabel ? `Class ${child.classLabel}` : undefined} />
          <FeeStatement key={child.id} studentId={child.id} firstName={child.firstName} />
        </div>
      )}
    </ForChild>
  );
}
