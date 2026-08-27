ALTER TABLE "Episode"
ADD COLUMN "transcriptProgress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "transcriptProgressNote" TEXT,
ADD COLUMN "transcriptStartedAt" TIMESTAMP(3),
ADD COLUMN "transcriptEstimateSec" INTEGER,
ADD COLUMN "transcriptIsManual" BOOLEAN NOT NULL DEFAULT false;

-- Existing non-empty transcripts were entered through the episode editor before
-- this distinction existed. Preserve them as the editor's authoritative wording.
UPDATE "Episode"
SET "transcriptIsManual" = true
WHERE "transcript" IS NOT NULL AND BTRIM("transcript") <> '';
