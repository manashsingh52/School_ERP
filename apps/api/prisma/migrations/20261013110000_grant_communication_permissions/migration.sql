-- Grants the parent–teacher communication permissions to the built-in roles of schools that already
-- exist. (The INSERT in 20261013100000 ran while row-level security was forced on the table owner,
-- so it saw no rows.) Table owners bypass RLS only when it isn't FORCEd: lift it for these two
-- tables for this statement; scripts/apply-sql.mjs puts FORCE back after every deploy, and so do we.
ALTER TABLE "roles" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" NO FORCE ROW LEVEL SECURITY;

INSERT INTO "role_permissions" ("role_id", "school_id", "permission", "scope")
SELECT r."id", r."school_id", g.permission, g.scope::"PermissionScope"
FROM "roles" r
JOIN (VALUES
  ('school_admin', 'message.use', 'ALL'), ('school_admin', 'complaint.manage', 'ALL'), ('school_admin', 'meeting.view', 'ALL'), ('school_admin', 'meeting.manage', 'ALL'), ('school_admin', 'reminder.use', 'ALL'),
  ('principal', 'message.use', 'ALL'), ('principal', 'complaint.manage', 'ALL'), ('principal', 'meeting.view', 'ALL'), ('principal', 'meeting.manage', 'ALL'), ('principal', 'reminder.use', 'ALL'),
  ('accountant', 'reminder.use', 'ALL'),
  ('teacher', 'message.use', 'ASSIGNED'), ('teacher', 'meeting.view', 'ASSIGNED'), ('teacher', 'meeting.manage', 'ASSIGNED'), ('teacher', 'reminder.use', 'ALL'),
  ('parent', 'message.use', 'OWN_CHILDREN'), ('parent', 'meeting.view', 'OWN_CHILDREN'), ('parent', 'reminder.use', 'ALL')
) AS g(role_key, permission, scope) ON g.role_key = r."key"
WHERE r."is_system"
ON CONFLICT DO NOTHING;

UPDATE "roles" SET "version" = "version" + 1 WHERE "is_system" AND "key" IN ('school_admin', 'principal', 'accountant', 'teacher', 'parent');

ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
