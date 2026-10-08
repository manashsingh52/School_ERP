'use client';

import { BOARDS, updateSchoolProfileSchema, type SchoolProfile } from '@schoolos/contracts';
import { Button, Card, CardHeader, Field, Input, Select, Skeleton, toast } from '@schoolos/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { apiPatch } from '@/lib/api-client';
import { GeneralExtrasCard } from '@/components/settings/section-forms';
import { contractResolver } from '@/lib/forms';
import { applyServerErrors, useSchool } from '@/lib/hooks';
import { useMe } from '@/lib/me';

type Values = z.input<typeof updateSchoolProfileSchema>;
const BOARD_LABEL: Record<(typeof BOARDS)[number], string> = { CBSE: 'CBSE', ICSE: 'ICSE', STATE: 'State board', IB: 'IB', CAMBRIDGE: 'Cambridge', OTHER: 'Other' };
const FIELDS = ['name', 'legalName', 'board', 'phone', 'email', 'website', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode'];

export default function GeneralSettingsPage() {
  const school = useSchool();
  if (!school.data) return <Skeleton className="h-96" />;
  return (
    <div className="flex flex-col gap-4">
      <ProfileForm school={school.data} />
      <GeneralExtrasCard />
    </div>
  );
}

function ProfileForm({ school }: { school: SchoolProfile }) {
  const { can } = useMe();
  const qc = useQueryClient();
  const readOnly = !can('school.settings.manage');
  const form = useForm<Values, unknown, z.output<typeof updateSchoolProfileSchema>>({
    resolver: contractResolver(updateSchoolProfileSchema) as never,
    defaultValues: {
      name: school.name,
      legalName: school.legalName ?? '',
      board: (school.board as Values['board']) ?? undefined,
      phone: school.phone ?? '',
      email: school.email ?? '',
      website: school.website ?? '',
      addressLine1: school.address.line1 ?? '',
      addressLine2: school.address.line2 ?? '',
      city: school.address.city ?? '',
      state: school.address.state ?? '',
      postalCode: school.address.postalCode ?? '',
    },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (values) => {
    try {
      await apiPatch('/school', values);
      await qc.invalidateQueries({ queryKey: ['school'] });
      form.reset(form.getValues());
      toast.success('School details saved');
    } catch (err) {
      if (!applyServerErrors(err, form.setError, FIELDS)) toast.error('We couldn’t save the changes.');
    }
  });

  return (
    <Card>
      <CardHeader title="School information" description={`Web address: ${school.slug}.  Code: ${school.code}`} />
      <form onSubmit={submit} noValidate>
        <fieldset disabled={readOnly} className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <Field label="School name" htmlFor="sc-name" error={e.name?.message} className="sm:col-span-2"><Input id="sc-name" {...form.register('name')} /></Field>
          <Field label="Legal / trust name" htmlFor="sc-legal" hint="Shown on receipts and certificates"><Input id="sc-legal" {...form.register('legalName')} /></Field>
          <Field label="Board" htmlFor="sc-board">
            <Select id="sc-board" {...form.register('board')}>
              <option value="">Not specified</option>
              {BOARDS.map((b) => <option key={b} value={b}>{BOARD_LABEL[b]}</option>)}
            </Select>
          </Field>
          <Field label="Office phone" htmlFor="sc-phone" error={e.phone?.message}><Input id="sc-phone" type="tel" {...form.register('phone')} /></Field>
          <Field label="Email" htmlFor="sc-email" error={e.email?.message}><Input id="sc-email" type="email" {...form.register('email')} /></Field>
          <Field label="Website" htmlFor="sc-web" error={e.website?.message} className="sm:col-span-2"><Input id="sc-web" placeholder="https://" {...form.register('website')} /></Field>
          <Field label="Address" htmlFor="sc-a1" className="sm:col-span-2"><Input id="sc-a1" {...form.register('addressLine1')} /></Field>
          <Field label="Address line 2" htmlFor="sc-a2" className="sm:col-span-2"><Input id="sc-a2" {...form.register('addressLine2')} /></Field>
          <Field label="City" htmlFor="sc-city"><Input id="sc-city" {...form.register('city')} /></Field>
          <Field label="State" htmlFor="sc-state"><Input id="sc-state" {...form.register('state')} /></Field>
          <Field label="PIN code" htmlFor="sc-pin" error={e.postalCode?.message}><Input id="sc-pin" inputMode="numeric" maxLength={6} {...form.register('postalCode')} /></Field>
        </fieldset>
        {!readOnly && (
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button type="submit" disabled={!form.formState.isDirty} loading={form.formState.isSubmitting}>Save changes</Button>
          </div>
        )}
      </form>
    </Card>
  );
}
