ALTER TABLE "Podcast" ADD COLUMN "slug" TEXT;
ALTER TABLE "Episode" ADD COLUMN "slug" TEXT;

WITH podcast_slugs AS (
  SELECT
    id,
    COALESCE(NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g')), ''), 'podcast') AS base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g')), ''), 'podcast')
      ORDER BY id
    ) AS slug_number
  FROM "Podcast"
)
UPDATE "Podcast" AS podcast
SET "slug" = CASE
  WHEN podcast_slugs.slug_number = 1 THEN podcast_slugs.base_slug
  ELSE podcast_slugs.base_slug || '-' || podcast.id
END
FROM podcast_slugs
WHERE podcast.id = podcast_slugs.id;

WITH episode_slugs AS (
  SELECT
    id,
    COALESCE(NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(title), '[^a-z0-9]+', '-', 'g')), ''), 'episode') AS base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(title), '[^a-z0-9]+', '-', 'g')), ''), 'episode')
      ORDER BY id
    ) AS slug_number
  FROM "Episode"
)
UPDATE "Episode" AS episode
SET "slug" = CASE
  WHEN episode_slugs.slug_number = 1 THEN episode_slugs.base_slug
  ELSE episode_slugs.base_slug || '-' || episode.id
END
FROM episode_slugs
WHERE episode.id = episode_slugs.id;

ALTER TABLE "Podcast" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "Episode" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Podcast_slug_key" ON "Podcast"("slug");
CREATE UNIQUE INDEX "Episode_slug_key" ON "Episode"("slug");
