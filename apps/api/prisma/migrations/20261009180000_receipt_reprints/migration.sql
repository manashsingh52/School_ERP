-- Duplicate receipt marking (staff reprints)
ALTER TABLE "receipts" ADD COLUMN "duplicate_file_id" UUID,
ADD COLUMN "print_count" INTEGER NOT NULL DEFAULT 0;
