'use client';

import { createStudentSchema, updateStudentSchema, type StudentDetail } from '@schoolos/contracts';
import { Button, Checkbox, Field, Input, Select } from '@schoolos/ui';
import { Plus, X } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { sectionLabel, useClasses } from '@/lib/academics';
import { contractResolver } from '@/lib/forms';
import { applyServerErrors } from '@/lib/hooks';

type CreateValues = z.input<typeof createStudentSchema>;
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const FIELDS = ['admissionNo', 'firstName', 'lastName', 'sectionId', 'rollNo', 'dateOfBirth', 'gender', 'admissionDate', 'bloodGroup', 'phone', 'email', 'postalCode', 'emergencyContactPhone', 'guardians'];
const numberOrUndefined = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v));

/** Add or edit a student with the same rules the API uses. Guardians are only set when adding. */
export function StudentForm({
  student,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  student?: StudentDetail;
  submitLabel: string;
  onSubmit: (values: z.output<typeof createStudentSchema> | z.output<typeof updateStudentSchema>) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const classes = useClasses();
  const sections = (classes.data ?? []).flatMap((c) => c.sections.map((s) => ({ id: s.id, label: sectionLabel(c.name, s.name), count: s.studentCount })));
  const editing = !!student;

  const baseResolver = editing ? contractResolver(updateStudentSchema) : contractResolver(createStudentSchema);
  const form = useForm<CreateValues>({
    // A parent row left completely blank is ignored rather than reported as missing.
    resolver: ((values: CreateValues, ctx: unknown, opts: unknown) =>
      (baseResolver as (v: unknown, c: unknown, o: unknown) => unknown)(
        { ...values, guardians: values.guardians?.filter((g) => g.name?.trim() || g.phone?.trim()) },
        ctx,
        opts,
      )) as never,
    defaultValues: student
      ? {
          admissionNo: student.admissionNo,
          firstName: student.firstName,
          lastName: student.lastName ?? '',
          dateOfBirth: student.dateOfBirth ?? '',
          gender: student.gender ?? undefined,
          admissionDate: student.admissionDate ?? '',
          bloodGroup: (student.bloodGroup as CreateValues['bloodGroup']) ?? undefined,
          phone: student.phone ?? '',
          email: student.email ?? '',
          addressLine1: student.address?.line1 ?? '',
          addressLine2: student.address?.line2 ?? '',
          city: student.address?.city ?? '',
          state: student.address?.state ?? '',
          postalCode: student.address?.postalCode ?? '',
          emergencyContactName: student.emergencyContact?.name ?? '',
          emergencyContactPhone: student.emergencyContact?.phone ?? '',
        }
      : {
          admissionDate: new Date().toISOString().slice(0, 10),
          guardians: [{ name: '', phone: '', relation: 'FATHER', isPrimary: true }],
          inviteGuardians: true,
        },
  });
  const guardians = useFieldArray({ control: form.control, name: 'guardians' });
  const { register, formState } = form;
  const e = formState.errors;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values as never);
    } catch (err) {
      if (!applyServerErrors(err, form.setError, FIELDS)) throw err;
    }
  });

  return (
    <form onSubmit={(ev) => void submit(ev).catch(() => undefined)} className="flex flex-col gap-8" noValidate>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <h2 className="text-h3 font-semibold sm:col-span-2">Student</h2>
        <Field label="First name" htmlFor="s-first" error={e.firstName?.message}><Input id="s-first" invalid={!!e.firstName} {...register('firstName')} /></Field>
        <Field label="Last name" htmlFor="s-last"><Input id="s-last" {...register('lastName')} /></Field>
        <Field label="Admission number" htmlFor="s-adm" error={e.admissionNo?.message}><Input id="s-adm" invalid={!!e.admissionNo} {...register('admissionNo')} /></Field>
        {!editing && (
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Field label="Class & section" htmlFor="s-section" error={e.sectionId?.message}>
              <Select id="s-section" invalid={!!e.sectionId} {...register('sectionId')}>
                <option value="">Choose</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.count})</option>)}
              </Select>
            </Field>
            <Field label="Roll no." htmlFor="s-roll" error={e.rollNo?.message}>
              <Input id="s-roll" type="number" min={1} {...register('rollNo', { setValueAs: numberOrUndefined })} />
            </Field>
          </div>
        )}
        <Field label="Date of birth" htmlFor="s-dob" error={e.dateOfBirth?.message}><Input id="s-dob" type="date" {...register('dateOfBirth')} /></Field>
        <Field label="Gender" htmlFor="s-gender">
          <Select id="s-gender" {...register('gender')}>
            <option value="">Not specified</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Admission date" htmlFor="s-admdate" error={e.admissionDate?.message}><Input id="s-admdate" type="date" {...register('admissionDate')} /></Field>
        <Field label="Blood group" htmlFor="s-blood">
          <Select id="s-blood" {...register('bloodGroup')}>
            <option value="">Not known</option>
            {BLOOD.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
      </section>

      {!editing && (
        <section className="flex flex-col gap-4 border-t border-border pt-6">
          <div>
            <h2 className="text-h3 font-semibold">Parents</h2>
            <p className="text-small text-fg-secondary">If a parent is already in the school (for a brother or sister), they're matched by mobile number — not duplicated.</p>
          </div>
          {e.guardians?.message && <p className="text-small text-danger">{e.guardians.message}</p>}
          {guardians.fields.map((g, i) => (
            <div key={g.id} className="grid grid-cols-1 items-start gap-3 rounded-lg border border-border p-4 sm:grid-cols-[8rem_1fr_1fr_auto]">
              <Field label="Relation" htmlFor={`g-rel-${i}`}>
                <Select id={`g-rel-${i}`} {...register(`guardians.${i}.relation`)}>
                  <option value="FATHER">Father</option>
                  <option value="MOTHER">Mother</option>
                  <option value="GUARDIAN">Guardian</option>
                  <option value="GRANDPARENT">Grandparent</option>
                  <option value="OTHER">Other</option>
                </Select>
              </Field>
              <Field label="Name" htmlFor={`g-name-${i}`} error={e.guardians?.[i]?.name?.message}><Input id={`g-name-${i}`} {...register(`guardians.${i}.name`)} /></Field>
              <Field label="Mobile" htmlFor={`g-phone-${i}`} error={e.guardians?.[i]?.phone?.message}><Input id={`g-phone-${i}`} type="tel" inputMode="tel" {...register(`guardians.${i}.phone`)} /></Field>
              <Button type="button" variant="ghost" size="icon" className="sm:mt-6" aria-label="Remove parent" onClick={() => guardians.remove(i)}><X /></Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {guardians.fields.length < 4 && (
              <Button type="button" variant="secondary" size="sm" onClick={() => guardians.append({ name: '', phone: '', relation: guardians.fields.length ? 'MOTHER' : 'FATHER', isPrimary: guardians.fields.length === 0 })}>
                <Plus /> Add parent
              </Button>
            )}
            <Checkbox label="Invite parents to the parent app" description="They sign in with a one-time code sent to their mobile." {...register('inviteGuardians')} />
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 border-t border-border pt-6 sm:grid-cols-2">
        <h2 className="text-h3 font-semibold sm:col-span-2">Contact & address</h2>
        <Field label="Address" htmlFor="s-addr1" className="sm:col-span-2"><Input id="s-addr1" {...register('addressLine1')} /></Field>
        <Field label="City" htmlFor="s-city"><Input id="s-city" {...register('city')} /></Field>
        <Field label="State" htmlFor="s-state"><Input id="s-state" {...register('state')} /></Field>
        <Field label="PIN code" htmlFor="s-pin" error={e.postalCode?.message}><Input id="s-pin" inputMode="numeric" maxLength={6} {...register('postalCode')} /></Field>
        <Field label="Student mobile (optional)" htmlFor="s-phone" error={e.phone?.message}><Input id="s-phone" type="tel" {...register('phone')} /></Field>
        <Field label="Emergency contact" htmlFor="s-emname"><Input id="s-emname" {...register('emergencyContactName')} /></Field>
        <Field label="Emergency phone" htmlFor="s-emphone" error={e.emergencyContactPhone?.message}><Input id="s-emphone" type="tel" {...register('emergencyContactPhone')} /></Field>
      </section>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={formState.isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
