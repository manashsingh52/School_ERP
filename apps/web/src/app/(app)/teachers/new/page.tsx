'use client';

import type { TeacherDetail } from '@schoolos/contracts';
import { Card, PageHeader, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch, idempotencyKey } from '@/lib/api-client';
import { TeacherForm } from '../teacher-form';

export default function NewTeacherPage() {
  const router = useRouter();
  const qc = useQueryClient();
  // One key per attempt: a double-click can't create two teachers; after an error the corrected form gets a new key.
  const [key, setKey] = useState(idempotencyKey);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/teachers" className="inline-flex items-center gap-1.5 text-small text-fg-secondary hover:text-fg"><ArrowLeft className="size-4" /> Teachers</Link>
      <PageHeader title="Add teacher" description="Add the teacher's details. You can assign classes and subjects afterwards in Academics." />
      <Card className="p-6">
        <TeacherForm
          submitLabel="Add teacher"
          onCancel={() => router.push('/teachers')}
          onSubmit={async (values) => {
            const res = await apiFetch<{ data: TeacherDetail }>('/teachers', {
              method: 'POST',
              body: JSON.stringify(values),
              headers: { 'idempotency-key': key },
            }).catch((err: unknown) => {
              setKey(idempotencyKey());
              throw err;
            });
            await qc.invalidateQueries({ queryKey: ['teachers'] });
            toast.success(`${res.data.firstName} added${res.data.login === 'INVITED' ? ' and invited to sign in' : ''}`);
            router.push(`/teachers/${res.data.id}`);
          }}
        />
      </Card>
    </div>
  );
}
