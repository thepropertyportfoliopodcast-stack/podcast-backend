ALTER TABLE "public"."Episode"
ADD COLUMN "publicationStatus" TEXT NOT NULL DEFAULT 'PUBLISHED';

ALTER TABLE "public"."Episode"
ADD CONSTRAINT "Episode_publicationStatus_check"
CHECK ("publicationStatus" IN ('DRAFT', 'PUBLISHED'));

CREATE INDEX "Episode_publicationStatus_idx"
ON "public"."Episode" ("publicationStatus");
