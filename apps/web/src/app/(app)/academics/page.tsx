'use client';

import { Gate } from '@/components/gate';
import { Button, PageHeader, Tabs } from '@schoolos/ui';
import { FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useMe } from '@/lib/me';
import { AssignmentsTab } from './assignments-tab';
import { ClassesTab } from './classes-tab';
import { SubjectsTab } from './subjects-tab';
import { YearsTab } from './years-tab';

type Tab = 'classes' | 'subjects' | 'assignments' | 'years';

function AcademicsPageContent() {
  return (
    <Suspense>
      <Academics />
    </Suspense>
  );
}

function Academics() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { can } = useMe();
  const tab = (params.get('tab') as Tab) || 'classes';
  const canManage = can('academic.manage');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Academics"
        description="Classes, sections, subjects and who teaches what — for the current academic year."
        actions={canManage && can('import.run') && (tab === 'classes' || tab === 'subjects') && (
          <Button variant="secondary" asChild><Link href={`/imports/new?entity=${tab === 'classes' ? 'CLASSES' : 'SUBJECTS'}`}><FileSpreadsheet /> Import from Excel</Link></Button>
        )}
      />
      <Tabs<Tab>
        value={tab}
        onChange={(t) => router.replace(`${pathname}?tab=${t}`)}
        items={[
          { value: 'classes', label: 'Classes & sections' },
          { value: 'subjects', label: 'Subjects' },
          { value: 'assignments', label: 'Who teaches what' },
          { value: 'years', label: 'Academic years' },
        ]}
      />
      {tab === 'classes' && <ClassesTab canManage={canManage} />}
      {tab === 'subjects' && <SubjectsTab canManage={canManage} />}
      {tab === 'assignments' && <AssignmentsTab canManage={canManage} />}
      {tab === 'years' && <YearsTab canManage={canManage} />}
    </div>
  );
}

export default function AcademicsPage() {
  return (
    <Gate any={['academic.view']} scopes={['ALL', 'ASSIGNED']}>
      <AcademicsPageContent />
    </Gate>
  );
}
