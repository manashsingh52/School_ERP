'use client';

import { Gate } from '@/components/gate';
import type { StudentDetail } from '@schoolos/contracts';
import { Card, EmptyState, PageHeader, Button, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Layers } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useClasses } from '@/lib/academics';
import { apiFetch, idempotencyKey } from '@/lib/api-client';
import { StudentForm } from '../student-form';

function NewStudentPageContent() {
  const router = useRouter();
  const qc = useQueryClient();
  const classes = useClasses();
  // One key per attempt: a double-click can't create two students; after an error the corrected form gets a new key.
  const [key, setKey] = useState(idempotencyKey);
  const noSections = classes.data && !classes.data.some((c) => c.sections.length);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/students" className="inline-flex items-center gap-1.5 text-small text-fg-secondary hover:text-fg"><ArrowLeft className="size-4" /> Students</Link>
      <PageHeader title="Add student" description="Admission details, class and parents. Everything else can be added later." />
      <Card className="p-6">
        {noSections ? (
          <EmptyState
            icon={<Layers />}
            title="Set up classes first"
            description="Students are placed in a class section for the current academic year."
            action={<Button asChild><Link href="/academics">Go to Academics</Link></Button>}
          />
        ) : (
          <StudentForm
            submitLabel="Add student"
            onCancel={() => router.push('/students')}
            onSubmit={async (values) => {
              const res = await apiFetch<{ data: StudentDetail }>('/students', {
                method: 'POST',
                body: JSON.stringify(values),
                headers: { 'idempotency-key': key },
              }).catch((err: unknown) => {
                setKey(idempotencyKey());
                throw err;
              });
              await qc.invalidateQueries({ queryKey: ['students'] });
              toast.success(`${res.data.firstName} added to ${res.data.className?.replace(/^Class\s+/i, '')}-${res.data.sectionName}`);
              router.push(`/students/${res.data.id}`);
            }}
          />
        )}
      </Card>
    </div>
  );
}

export default function NewStudentPage() {
  return (
    <Gate any={['student.create']}>
      <NewStudentPageContent />
    </Gate>
  );
}
