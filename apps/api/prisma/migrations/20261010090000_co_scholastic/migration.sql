-- CreateTable
CREATE TABLE "co_scholastic_grades" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "grade" TEXT NOT NULL,
    "entered_by_member_id" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "co_scholastic_grades_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "co_scholastic_grades_school_id_exam_id_idx" ON "co_scholastic_grades"("school_id", "exam_id");
-- CreateIndex
CREATE UNIQUE INDEX "co_scholastic_grades_exam_id_student_id_subject_id_key" ON "co_scholastic_grades"("exam_id", "student_id", "subject_id");
-- AddForeignKey
ALTER TABLE "co_scholastic_grades" ADD CONSTRAINT "co_scholastic_grades_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
