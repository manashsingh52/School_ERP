import { z } from 'zod';
import { dateOnlySchema } from './academics.js';
import { pageQuerySchema, uuidSchema } from './common.js';

export const CERTIFICATE_KINDS = ['PARTICIPATION', 'ACHIEVEMENT'] as const;
export const certificateKindSchema = z.enum(CERTIFICATE_KINDS);
export type CertificateKind = z.infer<typeof certificateKindSchema>;

export const CERTIFICATE_KIND_LABELS: Record<CertificateKind, string> = {
  PARTICIPATION: 'Participation',
  ACHIEVEMENT: 'Achievement',
};

/** Offered in the issue form; any other short text is fine too. */
export const POSITION_SUGGESTIONS = ['1st place', '2nd place', '3rd place', 'Winner', 'Runner-up', 'Special mention'] as const;

/** One certificate per chosen student (a whole team in one go). */
export const issueCertificatesSchema = z
  .object({
    kind: certificateKindSchema,
    eventName: z.string().trim().min(2, 'Add the name of the competition or event').max(120),
    eventDate: dateOnlySchema,
    /** Achievements only: "1st place", "Winner", … */
    position: z.string().trim().max(40).optional(),
    /** An extra line on the certificate, e.g. "Inter-school level, organised by …". */
    note: z.string().trim().max(160).optional(),
    studentIds: z.array(uuidSchema).min(1, 'Choose at least one student').max(200),
  })
  .refine((v) => v.kind !== 'ACHIEVEMENT' || !!v.position, { path: ['position'], message: 'Add the position, e.g. 1st place' });
export type IssueCertificatesRequest = z.input<typeof issueCertificatesSchema>;

export const listCertificatesQuerySchema = pageQuerySchema.extend({
  studentId: uuidSchema.optional(),
  kind: certificateKindSchema.optional(),
  /** "true" = certificates I issued. */
  mine: z.enum(['true', 'false']).optional(),
});

export interface CertificateItem {
  id: string;
  /** Printed on the certificate, e.g. "CERT/2026-27/0012". */
  serialNo: string;
  kind: CertificateKind;
  eventName: string;
  eventDate: string;
  position: string | null;
  note: string | null;
  student: { id: string; name: string; classLabel: string | null };
  issuedBy: string;
  createdAt: string;
  canDelete: boolean;
}
