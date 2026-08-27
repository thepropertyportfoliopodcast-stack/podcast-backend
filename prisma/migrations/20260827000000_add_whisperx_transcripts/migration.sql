ALTER TABLE "public"."Episode"
ADD COLUMN "transcriptStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "transcriptLanguage" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN "transcriptWords" JSONB,
ADD COLUMN "transcriptSegments" JSONB,
ADD COLUMN "transcriptError" TEXT,
ADD COLUMN "transcriptGeneratedAt" TIMESTAMP(3),
ADD COLUMN "transcriptSourceAudio" TEXT,
ADD COLUMN "transcriptModel" TEXT,
ADD COLUMN "transcriptDurationMs" INTEGER,
ADD COLUMN "transcriptSyncOffsetMs" INTEGER NOT NULL DEFAULT 0;

UPDATE "public"."Episode"
SET "transcriptStatus" = 'QUEUED'
WHERE "audio" IS NOT NULL
  AND BTRIM("audio") <> ''
  AND "isDeleted" = FALSE;

CREATE INDEX "Episode_transcriptStatus_idx"
ON "public"."Episode" ("transcriptStatus");
