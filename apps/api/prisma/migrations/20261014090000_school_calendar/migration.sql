-- CreateEnum
CREATE TYPE "CalendarEventKind" AS ENUM ('HOLIDAY', 'VACATION', 'EVENT', 'PTM', 'EXAM', 'OTHER');

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "CalendarEventKind" NOT NULL DEFAULT 'EVENT',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "class_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_by_member_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_events_school_id_start_date_idx" ON "calendar_events"("school_id", "start_date");

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Calendar permissions for the built-in roles of existing schools (owners bypass RLS only when it
-- isn't FORCEd; scripts/apply-sql.mjs restores FORCE after every deploy, and so do we).
ALTER TABLE "roles" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" NO FORCE ROW LEVEL SECURITY;
INSERT INTO "role_permissions" ("role_id", "school_id", "permission", "scope")
SELECT r."id", r."school_id", g.permission, g.scope::"PermissionScope"
FROM "roles" r
JOIN (VALUES
  ('school_admin', 'calendar.view', 'ALL'), ('school_admin', 'calendar.manage', 'ALL'),
  ('principal', 'calendar.view', 'ALL'), ('principal', 'calendar.manage', 'ALL'),
  ('accountant', 'calendar.view', 'ALL'), ('teacher', 'calendar.view', 'ALL'), ('parent', 'calendar.view', 'ALL')
) AS g(role_key, permission, scope) ON g.role_key = r."key"
WHERE r."is_system"
ON CONFLICT DO NOTHING;
UPDATE "roles" SET "version" = "version" + 1 WHERE "is_system" AND "key" IN ('school_admin', 'principal', 'accountant', 'teacher', 'parent');
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
