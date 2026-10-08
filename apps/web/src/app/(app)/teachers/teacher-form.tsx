'use client';

import { createTeacherSchema, updateTeacherSchema, type TeacherDetail } from '@schoolos/contracts';
import { Button, Checkbox, Field, Input, Select } from '@schoolos/ui';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { contractResolver } from '@/lib/forms';
import { applyServerErrors } from '@/lib/hooks';

type Values = z.input<typeof createTeacherSchema> & { status?: 'ACTIVE' | 'ON_LEAVE' | 'LEFT' };
const FIELDS = ['employeeId', 'firstName', 'lastName', 'phone', 'email', 'gender', 'dateOfBirth', 'department', 'designation', 'qualification', 'joiningDate'];

/** Used for both "Add teacher" and "Edit teacher" — the same rules as the API. */
export function TeacherForm({
  teacher,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  teacher?: TeacherDetail;
  submitLabel: string;
  onSubmit: (values: z.output<typeof createTeacherSchema> & { status?: string }) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const form = useForm<Values, unknown, z.output<typeof createTeacherSchema>>({
    // Create and edit use the API's own rules; edit also carries `status`.
    resolver: (teacher ? contractResolver(updateTeacherSchema) : contractResolver(createTeacherSchema)) as never,
    defaultValues: teacher
      ? {
          employeeId: teacher.employeeId,
          firstName: teacher.firstName,
          lastName: teacher.lastName ?? '',
          phone: teacher.phone,
          email: teacher.email ?? '',
          gender: teacher.gender ?? undefined,
          dateOfBirth: teacher.dateOfBirth ?? '',
          department: teacher.department ?? '',
          designation: teacher.designation ?? '',
          qualification: teacher.qualification ?? '',
          joiningDate: teacher.joiningDate ?? '',
          status: teacher.status,
          inviteToLogin: false,
        }
      : { inviteToLogin: true },
  });
  const { register, formState } = form;
  const e = formState.errors;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (err) {
      if (!applyServerErrors(err, form.setError, FIELDS)) throw err;
    }
  });

  return (
    <form onSubmit={(ev) => void submit(ev).catch(() => undefined)} className="flex flex-col gap-6" noValidate>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="t-first" error={e.firstName?.message}><Input id="t-first" invalid={!!e.firstName} {...register('firstName')} /></Field>
        <Field label="Last name" htmlFor="t-last" error={e.lastName?.message}><Input id="t-last" {...register('lastName')} /></Field>
        <Field label="Employee ID" htmlFor="t-emp" error={e.employeeId?.message}><Input id="t-emp" invalid={!!e.employeeId} {...register('employeeId')} /></Field>
        <Field label="Mobile number" htmlFor="t-phone" error={e.phone?.message} hint="Used to sign in with a one-time code">
          <Input id="t-phone" type="tel" inputMode="tel" invalid={!!e.phone} {...register('phone')} />
        </Field>
        <Field label="Email" htmlFor="t-email" error={e.email?.message}><Input id="t-email" type="email" invalid={!!e.email} {...register('email')} /></Field>
        <Field label="Gender" htmlFor="t-gender">
          <Select id="t-gender" {...register('gender')}>
            <option value="">Not specified</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
      </section>
      <section className="grid grid-cols-1 gap-4 border-t border-border pt-6 sm:grid-cols-2">
        <Field label="Department" htmlFor="t-dept" hint="e.g. Mathematics"><Input id="t-dept" {...register('department')} /></Field>
        <Field label="Designation" htmlFor="t-desig" hint="e.g. TGT, PGT, PRT"><Input id="t-desig" {...register('designation')} /></Field>
        <Field label="Qualification" htmlFor="t-qual"><Input id="t-qual" {...register('qualification')} /></Field>
        <Field label="Joining date" htmlFor="t-join" error={e.joiningDate?.message}><Input id="t-join" type="date" {...register('joiningDate')} /></Field>
        <Field label="Date of birth" htmlFor="t-dob" error={e.dateOfBirth?.message}><Input id="t-dob" type="date" {...register('dateOfBirth')} /></Field>
        {teacher && (
          <Field label="Status" htmlFor="t-status" hint="Teachers who have left lose access immediately">
            <Select id="t-status" {...register('status')}>
              <option value="ACTIVE">Working</option>
              <option value="ON_LEAVE">On leave</option>
              <option value="LEFT">Left the school</option>
            </Select>
          </Field>
        )}
      </section>
      {!teacher && (
        <Checkbox
          label="Invite to sign in"
          description="They sign in with a one-time code sent to this mobile number and see only their own classes."
          {...register('inviteToLogin')}
        />
      )}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={formState.isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
