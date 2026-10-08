'use client';

import { PageHeader } from '@schoolos/ui';
import { DocumentsPanel } from '@/components/documents/documents-panel';
import { Gate } from '@/components/gate';

/** School-wide documents (policies, circulars, prospectus). Student and staff documents live on their profiles. */
export default function DocumentsPage() {
  return (
    <Gate any={['document.view']}>
      <div className="flex flex-col gap-6">
        <PageHeader title="Documents" description="School documents — policies, circulars, the prospectus. A student's or teacher's own documents are on their profile." />
        <DocumentsPanel ownerType="SCHOOL" title="School documents" shareLabel="Parents can see this" />
      </div>
    </Gate>
  );
}
