-- CreateTable
CREATE TABLE "exam_terms" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "grading_scale_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "exam_terms_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "term_report_cards" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "term_report_cards_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "exam_terms_school_id_academic_year_id_name_key" ON "exam_terms"("school_id", "academic_year_id", "name");
-- CreateIndex
CREATE UNIQUE INDEX "term_report_cards_term_id_student_id_key" ON "term_report_cards"("term_id", "student_id");
-- AddForeignKey
ALTER TABLE "exam_terms" ADD CONSTRAINT "exam_terms_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "exam_terms" ADD CONSTRAINT "exam_terms_grading_scale_id_fkey" FOREIGN KEY ("grading_scale_id") REFERENCES "grading_scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "term_report_cards" ADD CONSTRAINT "term_report_cards_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "term_report_cards" ADD CONSTRAINT "term_report_cards_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "exam_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
