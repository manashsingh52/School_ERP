-- CreateEnum
CREATE TYPE "ConversationCategory" AS ENUM ('GENERAL', 'ACADEMIC', 'ATTENDANCE', 'HOMEWORK', 'BEHAVIOUR', 'COMPLAINT', 'SUGGESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReminderRepeat" AS ENUM ('NONE', 'DAILY', 'WEEKDAYS', 'WEEKLY');

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "parent_member_id" UUID NOT NULL,
    "staff_member_id" UUID,
    "category" "ConversationCategory" NOT NULL DEFAULT 'GENERAL',
    "subject" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "started_by_member_id" UUID NOT NULL,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parent_read_at" TIMESTAMP(3),
    "staff_read_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_member_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "organizer_member_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "agenda" TEXT,
    "category" "ConversationCategory" NOT NULL DEFAULT 'GENERAL',
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "room_code" TEXT NOT NULL,
    "cancel_reason" TEXT,
    "reminded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "student_id" UUID,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "remind_at" TIMESTAMP(3) NOT NULL,
    "repeat" "ReminderRepeat" NOT NULL DEFAULT 'NONE',
    "completed_at" TIMESTAMP(3),
    "last_fired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_school_id_parent_member_id_last_message_at_idx" ON "conversations"("school_id", "parent_member_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_school_id_staff_member_id_last_message_at_idx" ON "conversations"("school_id", "staff_member_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_school_id_status_category_idx" ON "conversations"("school_id", "status", "category");

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_created_at_idx" ON "conversation_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_room_code_key" ON "meetings"("room_code");

-- CreateIndex
CREATE INDEX "meetings_school_id_student_id_scheduled_at_idx" ON "meetings"("school_id", "student_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "meetings_school_id_organizer_member_id_scheduled_at_idx" ON "meetings"("school_id", "organizer_member_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "meetings_status_scheduled_at_idx" ON "meetings"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "reminders_school_id_member_id_remind_at_idx" ON "reminders"("school_id", "member_id", "remind_at");

-- CreateIndex
CREATE INDEX "reminders_remind_at_idx" ON "reminders"("remind_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_parent_member_id_fkey" FOREIGN KEY ("parent_member_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_sender_member_id_fkey" FOREIGN KEY ("sender_member_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organizer_member_id_fkey" FOREIGN KEY ("organizer_member_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- New permissions for schools that already exist (new schools get them from the role templates).
-- Only the built-in roles; a school's own custom roles are left for the school to change.
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

-- Permission caches key on the role version.
UPDATE "roles" SET "version" = "version" + 1 WHERE "is_system" AND "key" IN ('school_admin', 'principal', 'accountant', 'teacher', 'parent');
