'use client';

import { PageHeader } from '@schoolos/ui';
import { DocumentsPanel } from '@/components/documents/documents-panel';
import { ForChild } from '@/components/parent/parent-gate';

/** What the school has shared about the child (certificates, report copies) and school-wide documents. */
export default function ChildDocumentsPage() {
  return (
    <ForChild>
      {(child) => (
        <div className="flex flex-col gap-6">
          <PageHeader title={`${child.firstName}'s documents`} description="Shared with you by the school." />
          <DocumentsPanel key={child.id} ownerType="STUDENT" ownerId={child.id} />
          <DocumentsPanel ownerType="SCHOOL" title="From the school" />
        </div>
      )}
    </ForChild>
  );
}
