-- CreateEnum
CREATE TYPE "ReportSchedule" AS ENUM ('NONE', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "report_runs" ADD COLUMN     "saved_report_id" UUID;

-- CreateTable
CREATE TABLE "saved_reports" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "schedule" "ReportSchedule" NOT NULL DEFAULT 'NONE',
    "next_run_at" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_reports_school_id_member_id_idx" ON "saved_reports"("school_id", "member_id");

-- CreateIndex
CREATE INDEX "saved_reports_school_id_next_run_at_idx" ON "saved_reports"("school_id", "next_run_at");

-- AddForeignKey
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

