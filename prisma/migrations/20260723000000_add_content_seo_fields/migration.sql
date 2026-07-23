ALTER TABLE "Podcast"
  ADD COLUMN "seoTitle" TEXT,
  ADD COLUMN "seoDescription" TEXT,
  ADD COLUMN "primaryKeyword" TEXT,
  ADD COLUMN "secondaryKeywords" TEXT;

ALTER TABLE "Episode"
  ADD COLUMN "seoTitle" TEXT,
  ADD COLUMN "seoDescription" TEXT,
  ADD COLUMN "primaryKeyword" TEXT,
  ADD COLUMN "secondaryKeywords" TEXT;
