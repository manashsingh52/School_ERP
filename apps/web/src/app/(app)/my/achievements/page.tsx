'use client';

import { PageHeader } from '@schoolos/ui';
import { CertificateList } from '@/components/certificates/certificates';
import { ForChild } from '@/components/parent/parent-gate';

/** The child's certificates from the school: prizes, positions and events they took part in. */
export default function ChildAchievementsPage() {
  return (
    <ForChild>
      {(child) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={`${child.firstName}'s achievements`} description="Certificates from the school. Download any of them as a PDF." />
          <CertificateList key={child.id} studentId={child.id} showStudent={false} empty={{ title: 'No certificates yet', description: `When ${child.firstName} takes part in or wins a competition, the certificate shows up here.` }} />
        </div>
      )}
    </ForChild>
  );
}
