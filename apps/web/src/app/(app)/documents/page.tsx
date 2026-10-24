'use client';

import { PageHeader } from '@schoolos/ui';
import { DocumentsPanel } from '@/components/documents/documents-panel';
import { Gate } from '@/components/gate';
import { useMe } from '@/lib/me';

/** School-wide documents (policies, circulars, prospectus). Student and staff documents live on their profiles. */
export default function DocumentsPage() {
  const { me } = useMe();
  const m = me.membership;
  // Office staff have no teacher profile: their own documents are here.
  const ownDocs = m && !m.teacherId && !m.children.length;
  return (
    <Gate any={['document.view']}>
      <div className="flex flex-col gap-6">
        <PageHeader title="Documents" description="School documents — policies, circulars, the prospectus. A student's or teacher's own documents are on their profile." />
        <DocumentsPanel ownerType="SCHOOL" title="School documents" shareLabel="Parents can see this" />
        {ownDocs && <DocumentsPanel ownerType="MEMBER" ownerId={m.membershipId} title="My documents" />}
      </div>
    </Gate>
  );
}
