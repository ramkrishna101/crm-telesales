ALTER TABLE "call_logs"
ADD COLUMN "totalDurationSeconds" INTEGER NOT NULL DEFAULT 0;

UPDATE "call_logs"
SET "totalDurationSeconds" = COALESCE("durationSeconds", 0)
WHERE "totalDurationSeconds" = 0;