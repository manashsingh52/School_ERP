-- CreateEnum
CREATE TYPE "CertificateKind" AS ENUM ('PARTICIPATION', 'ACHIEVEMENT');

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "serial_no" TEXT NOT NULL,
    "kind" "CertificateKind" NOT NULL,
    "event_name" TEXT NOT NULL,
    "event_date" DATE NOT NULL,
    "position" TEXT,
    "note" TEXT,
    "class_label" TEXT,
    "issued_by_member_id" UUID NOT NULL,
    "issued_by_name" TEXT NOT NULL,
    "file_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "certificates_school_id_student_id_idx" ON "certificates"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "certificates_school_id_created_at_idx" ON "certificates"("school_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_school_id_serial_no_key" ON "certificates"("school_id", "serial_no");

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Certificate permissions for the built-in roles of existing schools (owners bypass RLS only when it
-- isn't FORCEd; scripts/apply-sql.mjs restores FORCE after every deploy, and so do we).
ALTER TABLE "roles" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" NO FORCE ROW LEVEL SECURITY;
INSERT INTO "role_permissions" ("role_id", "school_id", "permission", "scope")
SELECT r."id", r."school_id", g.permission, g.scope::"PermissionScope"
FROM "roles" r
JOIN (VALUES
  ('school_admin', 'certificate.view', 'ALL'), ('school_admin', 'certificate.issue', 'ALL'),
  ('principal', 'certificate.view', 'ALL'), ('principal', 'certificate.issue', 'ALL'),
  ('teacher', 'certificate.view', 'ASSIGNED'), ('teacher', 'certificate.issue', 'ASSIGNED'),
  ('parent', 'certificate.view', 'OWN_CHILDREN')
) AS g(role_key, permission, scope) ON g.role_key = r."key"
WHERE r."is_system"
ON CONFLICT DO NOTHING;
UPDATE "roles" SET "version" = "version" + 1 WHERE "is_system" AND "key" IN ('school_admin', 'principal', 'teacher', 'parent');
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
