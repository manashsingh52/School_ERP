
-- CreateTable
CREATE TABLE "ai_logs" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tools" JSONB NOT NULL DEFAULT '[]',
    "input_chars" INTEGER NOT NULL,
    "output_chars" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_logs_school_id_created_at_idx" ON "ai_logs"("school_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

